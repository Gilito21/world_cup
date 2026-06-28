import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, getMatchCacheStale, setMatchCache } from '../lib/matchCache'
import { getCache, setCache } from '../lib/dataCache'
import haptics from '../lib/haptics'
import usePullRefresh from '../lib/usePullRefresh'
import { useChromeHidden } from '../lib/scrollChrome'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import Spinner from '../components/Spinner'
import { MatchListSkeleton } from '../components/Skeleton'
import UpcomingAlert from '../components/UpcomingAlert'
import MatchPreviewModal from '../components/MatchPreviewModal'
import LeagueModal from '../components/LeagueModal'
import PaymentModal from '../components/PaymentModal'
import LeagueCreatedModal from '../components/LeagueCreatedModal'
import { Flag, teamName } from '../utils/teams'
import { computePredictedKnockout } from '../utils/tournament'
import { EditorialBand } from '../components/Editorial'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']

function buildStageInfo(t) {
  return {
    group:         { icon: '⚽', short: t('stages.groupShort'),         full: t('stages.group') },
    round_of_32:   { icon: '🎽', short: t('stages.round_of_32Short'),   full: t('stages.round_of_32') },
    round_of_16:   { icon: '🎯', short: t('stages.round_of_16Short'),   full: t('stages.round_of_16') },
    quarter_final: { icon: '⚔️',  short: t('stages.quarter_finalShort'), full: t('stages.quarter_final') },
    semi_final:    { icon: '⭐',  short: t('stages.semi_finalShort'),    full: t('stages.semi_final') },
    third_place:   { icon: '🥉', short: t('stages.third_placeShort'),   full: t('stages.third_place') },
    final:         { icon: '🏆', short: t('stages.finalShort'),         full: t('stages.final') },
  }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function getTimeLeft(ts) {
  const diff = ts - Date.now()
  if (diff <= 0) return null
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000)  / 60000),
    seconds: Math.floor((diff % 60000)    / 1000),
  }
}

function formatDate(dateStr, locale) {
  return new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function isTbd(name) {
  return !name || name === 'TBD' || name === 'TBA' || name === 'Por determinar'
}

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────

function Countdown({ matchDate }) {
  const [left, setLeft] = useState(() => getTimeLeft(new Date(matchDate).getTime()))
  useEffect(() => {
    const t = setInterval(() => setLeft(getTimeLeft(new Date(matchDate).getTime())), 1000)
    return () => clearInterval(t)
  }, [matchDate])
  if (!left) return null
  const { days, hours, minutes, seconds } = left
  return (
    <span className="text-xs font-mono text-ink/50">
      {days > 0 && <><b className="text-ink/70">{days}</b>d </>}
      <b className="text-ink/70">{String(hours).padStart(2, '0')}</b>h{' '}
      <b className="text-ink/70">{String(minutes).padStart(2, '0')}</b>m{' '}
      <b className="text-ink/70">{String(seconds).padStart(2, '0')}</b>s
    </span>
  )
}

function CutoffCountdown({ cutoffTime }) {
  const { t } = useLang()
  const [left, setLeft] = useState(() => getTimeLeft(cutoffTime))
  useEffect(() => {
    const timer = setInterval(() => setLeft(getTimeLeft(cutoffTime)), 1000)
    return () => clearInterval(timer)
  }, [cutoffTime])
  if (!left) return <span className="font-semibold text-red-500">{t('pronosticos.closedLabel')}</span>
  const { days, hours, minutes, seconds } = left
  return (
    <span className="font-mono font-semibold text-ink/80">
      {days > 0 && <>{days}d </>}
      {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
    </span>
  )
}

// ─── SCORE STEPPER ───────────────────────────────────────────────────────────
//
// Horizontal [−][N][+] control. Replaces the old number input + on-screen
// keyboard — predicting 30 matches no longer requires popping the keyboard
// 60 times. Number area shows the consensus value as a faded placeholder
// when empty; first ± tap promotes from placeholder to a real value.

function ScoreStepper({ value, onChange, disabled, placeholder }) {
  const isEmpty = value === '' || value == null
  const display = isEmpty
    ? (placeholder != null ? String(placeholder) : '–')
    : String(value)

  function bump(delta) {
    if (disabled) return
    const base = isEmpty ? 0 : Number(value)
    const next = Math.max(0, Math.min(99, base + delta))
    if (next === Number(value)) return
    haptics.tap()
    onChange(next)
  }

  return (
    <div className={`inline-flex items-stretch bg-paper border border-ink/30 rounded-none shadow-sm overflow-hidden select-none ${disabled ? 'opacity-40' : ''}`}>
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={disabled || (!isEmpty && Number(value) === 0)}
        className="w-7 sm:w-8 h-11 sm:h-12 flex items-center justify-center text-ink/60 active:bg-paper active:text-ink disabled:text-cream/80 transition-colors touch-manipulation"
        aria-label="−1"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="1" y="5" width="10" height="2" rx="1" />
        </svg>
      </button>
      <span className={`w-7 sm:w-8 flex items-center justify-center text-lg sm:text-xl font-bold tabular-nums ${
        isEmpty ? 'text-ink/40' : 'text-ink'
      }`}>
        {display}
      </span>
      <button
        type="button"
        onClick={() => bump(1)}
        disabled={disabled}
        className="w-7 sm:w-8 h-11 sm:h-12 flex items-center justify-center text-ink/60 active:bg-paper active:text-ink disabled:text-cream/80 transition-colors touch-manipulation"
        aria-label="+1"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="1" y="5" width="10" height="2" rx="1" />
          <rect x="5" y="1" width="2" height="10" rx="1" />
        </svg>
      </button>
    </div>
  )
}

// ─── SUBMIT PANEL ─────────────────────────────────────────────────────────────
// Compact pill that sits inline with the stage header. Shows the
// progress count and the submit action in one row; no expandable
// section — the deadline countdown lives elsewhere (page header
// editorial band) and a hint isn't needed once the user has reached
// this part of the page.

function SubmitPanel({ filledCount, totalCount, cutoffTime, isSubmitted, editedSinceSubmit, onSubmit, submitting }) {
  const { t } = useLang()
  const pct          = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0
  const isPastCutoff = !!(cutoffTime && Date.now() >= cutoffTime)
  const isComplete   = filledCount === totalCount && totalCount > 0
  const canSubmit    = isComplete && !isPastCutoff && !isSubmitted

  // Terminal: prediction was submitted — green confirmation pill. Once the
  // user edits an already-submitted prediction, the pill switches to a
  // persistent "Cambios guardados" so they get a clear, lasting signal that
  // the edit landed (the per-card "Guardado" flash is easy to miss).
  if (isSubmitted) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-grass-500/15 border border-grass-500/30 text-grass-600 text-xs font-bold whitespace-nowrap flex-shrink-0 ${editedSinceSubmit ? 'animate-fade-in' : ''}`}>
        <span aria-hidden="true">{editedSinceSubmit ? '✓' : '✅'}</span>
        <span className={editedSinceSubmit ? '' : 'hidden sm:inline'}>
          {editedSinceSubmit ? t('pronosticos.changesSaved') : t('pronosticos.submitted')}
        </span>
      </span>
    )
  }

  // Terminal: deadline missed.
  if (isPastCutoff) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-bold whitespace-nowrap flex-shrink-0">
        <span aria-hidden="true">🔒</span>
        <span>{t('pronosticos.closedLabel')}</span>
      </span>
    )
  }

  // Active: pill button that doubles as a progress bar. The ink fill
  // grows left-to-right with completion; once full (canSubmit), the
  // entire pill becomes the primary submit CTA.
  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={!canSubmit || submitting}
      title={canSubmit ? t('pronosticos.submitBtn') : t('pronosticos.submitBtnPending', { n: totalCount - filledCount, s: totalCount - filledCount !== 1 ? 's' : '' })}
      className={`relative inline-flex items-center gap-2 px-3 py-2 text-xs font-bold whitespace-nowrap overflow-hidden border transition-colors flex-shrink-0 ${
        canSubmit
          ? 'bg-ink hover:bg-terracotta border-ink hover:border-terracotta text-cream cursor-pointer'
          : 'bg-paper border-ink/25 text-ink/80 cursor-default'
      }`}
    >
      {/* Progress fill — only visible while filling. Sits under the text. */}
      {!canSubmit && (
        <span
          className="absolute inset-y-0 left-0 bg-ink/10 transition-all duration-500"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      )}
      <span className="relative flex items-center gap-1.5">
        {submitting
          ? <Spinner size="sm" />
          : <span aria-hidden="true">🏆</span>}
        <span className="tabular-nums">{filledCount} / {totalCount}</span>
        <span className="hidden sm:inline">
          {canSubmit ? t('pronosticos.submitBtn') : t('pronosticos.submitBtnPending', { n: totalCount - filledCount, s: totalCount - filledCount !== 1 ? 's' : '' })}
        </span>
      </span>
    </button>
  )
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────

function ConfirmModal({ onConfirm, onCancel, submitting, totalCount }) {
  const { t } = useLang()
  return (
    <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card p-6 max-w-sm w-full space-y-5 shadow-2xl">
        <div className="text-center space-y-2">
          <span className="text-5xl">🏆</span>
          <h3 className="text-xl font-bold text-ink">{t('pronosticos.confirmTitle')}</h3>
          <p className="text-ink/60 text-sm">
            {t('pronosticos.confirmBody', { n: totalCount })}
          </p>
          <p className="text-xs text-ink/50">{t('pronosticos.confirmIrreversible')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="btn-secondary flex-1"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner size="sm" />}
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────

function MatchCard({ match, prediction, onSave, draft, onDraftChange, onTiebreakerChange, predictedHome, predictedAway, realHome, realAway, isPastCutoff, onPreview, consensus }) {
  const { t, dateLocale } = useLang()
  const STAGE_INFO = buildStageInfo(t)
  const STATUS_BADGE = useMemo(() => ({
    scheduled: null,
    live:     { label: t('pronosticos.liveLabel'),     cls: 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' },
    finished: { label: t('pronosticos.finishedLabel'), cls: 'bg-paper-200 text-ink/60 border-ink/30' },
  }), [t])

  const isFinished  = match.status === 'finished'
  // Enviar ya NO bloquea: se edita hasta el cutoff global (30 min antes del primer
  // partido, vía isPastCutoff) reforzado en BD por check_prediction_global_cutoff.
  const isLocked    = isPastCutoff || isFinished ||
                      match.status !== 'scheduled' ||
                      Date.now() >= new Date(match.match_date).getTime() - 30 * 60 * 1000

  // Para display: equipos reales del bracket (si disponibles) > cascade del usuario > TBD
  const displayHome = isTbd(match.home_team) ? (realHome ?? predictedHome ?? match.home_team) : match.home_team
  const displayAway = isTbd(match.away_team) ? (realAway ?? predictedAway ?? match.away_team) : match.away_team
  // 🔮 solo cuando mostramos el cascade del usuario (los equipos reales aún no están disponibles)
  const hasPredictedTeams = (isTbd(match.home_team) || isTbd(match.away_team)) &&
                            !realHome && !realAway && (predictedHome || predictedAway)

  // El consenso global solo tiene sentido si sabemos quiénes juegan. En
  // eliminatorias eso requiere que el waterfall de mis picks de grupos (o los
  // resultados reales) haya determinado ambos equipos; si siguen "Por
  // determinar" (TBD) no mostramos ni el placeholder de consenso ni la
  // etiqueta — no tiene sentido un marcador sugerido para TBD vs TBD.
  const teamsKnown    = !isTbd(displayHome) && !isTbd(displayAway)
  const showConsensus = !!consensus && teamsKnown

  const home        = draft?.home ?? ''
  const away        = draft?.away ?? ''
  const tiebreaker  = draft?.tiebreaker ?? null
  const setHome     = val => onDraftChange(match.id, val, away === '' ? 0 : away)
  const setAway     = val => onDraftChange(match.id, home === '' ? 0 : home, val)
  const isKnockout  = match.stage !== 'group'
  const isDraw      = home !== '' && away !== '' && Number(home) === Number(away)

  const changed = home !== '' && away !== '' && (
    !prediction ||
    Number(home) !== prediction.home_score ||
    Number(away) !== prediction.away_score ||
    (isKnockout && isDraw && (tiebreaker ?? null) !== (prediction.tiebreaker ?? null))
  )

  // Auto-save: debounced server write whenever the draft diverges from the
  // saved prediction. The user no longer needs to tap a "save" button — they
  // tap +/− and the change persists ~700ms after the last interaction.
  // `saveOk` flickers a "Guardado" checkmark for 1.5s on each successful save.
  const [saving,  setSaving]  = useState(false)
  const [saveOk,  setSaveOk]  = useState(false)
  const [saveErr, setSaveErr] = useState(false)
  const saveTimerRef = useRef(null)
  const inFlightRef  = useRef(false)

  useEffect(() => { setSaveOk(false); setSaveErr(false) }, [prediction])

  const triggerSave = useCallback(async () => {
    if (inFlightRef.current) return
    if (home === '' || away === '') return
    inFlightRef.current = true
    setSaving(true)
    setSaveErr(false)
    const effectiveTiebreaker = isKnockout ? tiebreaker : null
    const ok = await onSave(match.id, Number(home), Number(away), effectiveTiebreaker)
    inFlightRef.current = false
    setSaving(false)
    if (ok) {
      haptics.medium()
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 1500)
    } else {
      haptics.error()
      setSaveErr(true)
    }
  }, [home, away, tiebreaker, isKnockout, match.id, onSave])

  // Schedule auto-save when there are unsaved changes. Knockout draws need a
  // tiebreaker before they're valid — wait for it instead of nagging.
  useEffect(() => {
    if (isLocked || isFinished) return
    if (!changed) return
    if (isKnockout && isDraw && !tiebreaker) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(triggerSave, 700)
    return () => clearTimeout(saveTimerRef.current)
  }, [changed, isLocked, isFinished, isKnockout, isDraw, tiebreaker, triggerSave])

  const badge = STATUS_BADGE[match.status]

  return (
    <div className={`card p-3 sm:p-4 transition-all duration-200 ${
      isFinished ? 'opacity-80' : 'hover:border-ink/30 hover:shadow-sm'
    }`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[11px] sm:text-xs text-ink/60 truncate">{formatDate(match.match_date, dateLocale)}</span>
          {match.group_name && (
            <span className="text-[11px] sm:text-xs text-ink/50 bg-paper px-1.5 py-0.5 rounded">
              {match.group_name}
            </span>
          )}
          {hasPredictedTeams && !isFinished && (
            <span className="text-[11px] sm:text-xs text-violet-500 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
              🔮
            </span>
          )}
          {match.status === 'scheduled' && <Countdown matchDate={match.match_date} />}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {badge && (
            <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          )}
          {/* Points badge after results come in */}
          {isFinished && prediction && (() => {
            const pts = prediction.points_earned ?? 0
            const cfg = pts === 3 ? 'bg-grass-500/15 text-grass-600 border-grass-500/30'
                      : pts === 1 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      :             'bg-paper-200 text-ink/60 border-ink/30'
            return (
              <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full border ${cfg}`}>
                {pts === 3 ? '+3' : pts === 1 ? '+1' : '0'}
              </span>
            )
          })()}
          {onPreview && (
            <button
              type="button"
              onClick={onPreview}
              className="w-7 h-7 rounded-full flex items-center justify-center text-ink/50 hover:text-ink hover:bg-paper-200 active:bg-cream transition-colors flex-shrink-0"
              aria-label={t('preview.openLabel')}
              title={t('preview.openLabel')}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
          <span className={`text-sm font-semibold truncate text-right ${
            isTbd(match.home_team) && !realHome && predictedHome ? 'text-violet-600' : 'text-ink'
          }`}>
            {teamName(displayHome)}
          </span>
          <Flag team={displayHome} />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {isFinished ? (
            <div className="flex items-center gap-2 bg-paper rounded-none px-3 py-1.5">
              <span className="text-xl font-bold text-ink">{match.home_score}</span>
              <span className="text-ink/60">-</span>
              <span className="text-xl font-bold text-ink">{match.away_score}</span>
            </div>
          ) : match.status === 'live' ? (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-none px-3 py-1.5">
              <span className="text-xl font-bold text-red-400">{match.home_score ?? 0}</span>
              <span className="text-red-500/60">-</span>
              <span className="text-xl font-bold text-red-400">{match.away_score ?? 0}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <ScoreStepper
                  value={home}
                  onChange={setHome}
                  disabled={isLocked}
                  placeholder={!isLocked && home === '' && showConsensus ? consensus.home_score : undefined}
                />
                <span className="text-ink/50 font-bold text-sm">-</span>
                <ScoreStepper
                  value={away}
                  onChange={setAway}
                  disabled={isLocked}
                  placeholder={!isLocked && away === '' && showConsensus ? consensus.away_score : undefined}
                />
              </div>
              {showConsensus && !isLocked && (home === '' || away === '') && (
                <span
                  className="text-[10px] text-ink/50 flex items-center gap-1 leading-none"
                  title={t('pronosticos.consensusTooltip', { n: consensus.total_voters })}
                >
                  <span aria-hidden="true">🌐</span>
                  {t('pronosticos.consensusLabel')}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-start gap-1.5 sm:gap-2 min-w-0">
          <Flag team={displayAway} />
          <span className={`text-sm font-semibold truncate ${
            isTbd(match.away_team) && !realAway && predictedAway ? 'text-violet-600' : 'text-ink'
          }`}>
            {teamName(displayAway)}
          </span>
        </div>
      </div>

      {/* Tu cuadro: equipos predichos cuando difieren de los reales */}
      {isKnockout && !isFinished && realHome && predictedHome && predictedHome !== realHome && (
        <p className="text-[10px] text-ink/50 text-center mt-1.5">
          Tu cuadro: {teamName(predictedHome)} – {teamName(predictedAway ?? '')}
        </p>
      )}

      {/* Tiebreaker selector: knockout draw predictions only */}
      {isKnockout && isDraw && !isFinished && (
        <div className="mt-3 pt-3 border-t border-ink/15 flex flex-col items-center gap-2">
          <span className="text-xs text-ink/60 font-medium">{t('pronosticos.tiebreaker')}</span>
          <div className="flex gap-2">
            <button
              onClick={() => !isLocked && onTiebreakerChange(match.id, 'home')}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-medium border transition-all ${
                tiebreaker === 'home'
                  ? 'bg-ink border-ink text-cream'
                  : 'bg-paper border-ink/20 text-ink/70 hover:border-ink/50 hover:text-ink'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Flag team={displayHome} />
              <span>{teamName(displayHome)}</span>
            </button>
            <button
              onClick={() => !isLocked && onTiebreakerChange(match.id, 'away')}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-medium border transition-all ${
                tiebreaker === 'away'
                  ? 'bg-ink border-ink text-cream'
                  : 'bg-paper border-ink/20 text-ink/70 hover:border-ink/50 hover:text-ink'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Flag team={displayAway} />
              <span>{teamName(displayAway)}</span>
            </button>
          </div>
          {!tiebreaker && !isLocked && (
            <span className="text-xs text-ink/70 font-medium italic">{t('pronosticos.tiebreakerRequired')}</span>
          )}
        </div>
      )}

      {/* Footer */}
      {isFinished && prediction && (() => {
        // Para "Tu pronóstico:" usar equipos del cascade del usuario (lo que pensaba que jugaría)
        const predH = (isTbd(match.home_team) && predictedHome) ? predictedHome : displayHome
        const predA = (isTbd(match.away_team) && predictedAway) ? predictedAway : displayAway
        return (
          <div className="mt-3 pt-3 border-t border-ink/20 text-center text-xs text-ink/60 space-y-1">
            <div>
              {t('pronosticos.myPrediction')}{' '}
              <span className="text-ink/80 font-medium">
                {teamName(predH)} {prediction.home_score} – {prediction.away_score} {teamName(predA)}
              </span>
            </div>
            {isKnockout && match.home_score === match.away_score && match.winner && (
              <div>
                {t('pronosticos.advanced')}{' '}
                <span className="font-medium text-ink/70">
                  {match.winner === 'home' ? teamName(displayHome) : teamName(displayAway)}
                </span>
                {prediction.tiebreaker && (
                  <span className={`ml-1.5 font-medium ${prediction.tiebreaker === match.winner ? 'text-green-600' : 'text-red-500'}`}>
                    {`(${t('pronosticos.youPredicted', { team: prediction.tiebreaker === 'home' ? teamName(predH) : teamName(predA) })} `}
                    {prediction.tiebreaker === match.winner ? '✓)' : '✗)'}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Auto-save status row (only while the card is editable) */}
      {!isLocked && !isFinished && (
        <div className="mt-2 pt-2 border-t border-ink/15 flex items-center justify-end gap-1.5 text-xs h-5">
          {saving ? (
            <span className="text-ink/50 flex items-center gap-1.5">
              <Spinner size="sm" /> <span>{t('pronosticos.saving')}</span>
            </span>
          ) : saveErr ? (
            <button
              onClick={triggerSave}
              className="text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
            >
              <span>⚠️</span><span>{t('pronosticos.saveErrRetry')}</span>
            </button>
          ) : saveOk ? (
            <span className="text-green-500 flex items-center gap-1 animate-fade-in">
              <span>✓</span><span>{t('common.saved')}</span>
            </span>
          ) : changed ? (
            <span className="text-ink/40">•</span>
          ) : prediction ? (
            <span className="text-ink/40">✓</span>
          ) : (
            <span className="text-ink/40">{t('pronosticos.noDraft')}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SIDEBAR DE FASES ─────────────────────────────────────────────────────────

function StageSidebar({ stages, activeStage, onSelect, unfilledCount }) {
  const { t } = useLang()
  const STAGE_INFO = buildStageInfo(t)

  return (
    <aside className="hidden md:block flex-shrink-0">
      <nav className="sticky top-24 group/nav w-11 hover:w-52 transition-all duration-200 overflow-hidden">
        <div className="space-y-0.5 py-1 pr-1">
          {STAGE_ORDER.map(stage => {
            const info     = STAGE_INFO[stage]
            const hasData  = stages.includes(stage)
            const unfilled = unfilledCount(stage)
            const isActive = activeStage === stage

            return (
              <button
                key={stage}
                onClick={() => hasData && onSelect(stage)}
                title={info.full}
                disabled={!hasData}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-none text-sm font-medium transition-all whitespace-nowrap ${
                  isActive  ? 'bg-ink text-cream shadow-sm'
                  : hasData ? 'text-ink/60 hover:bg-paper hover:text-ink'
                  :           'text-ink/40 cursor-default'
                }`}
              >
                <span className="text-base flex-shrink-0 leading-none">{info.icon}</span>
                <span className="opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 flex-1 text-left truncate">
                  {info.short}
                </span>
                {unfilled > 0 && (
                  <span className={`opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    isActive ? 'bg-cream/20 text-cream' : 'bg-paper-200 text-ink/70'
                  }`}>
                    {unfilled}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function Pronosticos() {
  const { user }                  = useAuth()
  const { activeLeague, leagues, loading: leagueLoading, leaguesReady, onLeagueCreated, joinNotice, clearJoinNotice } = useLeague()
  const { t, dateLocale }         = useLang()
  const predictionMode = activeLeague?.prediction_mode ?? 'global'

  const STAGE_INFO = useMemo(() => buildStageInfo(t), [t])

  const [matches,     setMatches]     = useState(() => getMatchCache() ?? getMatchCacheStale() ?? [])
  const [predictions, setPredictions] = useState({})
  const [drafts,      setDrafts]      = useState({})
  const [consensus,   setConsensus]   = useState({}) // matchId → { home_score, away_score, vote_count, total_voters }
  // Start as loading only if we have no cached matches at all (ni fresca ni
  // stale). Si hay cualquier versión cacheada la mostramos al instante y
  // refrescamos en background — nunca pantalla vacía tras un deploy.
  const [loading,     setLoading]     = useState(() => !(getMatchCache() ?? getMatchCacheStale()))
  const [activeStage, setActiveStage] = useState('group')
  const [error,       setError]       = useState('')
  const [copying,     setCopying]     = useState(false)
  const [scrollTarget, setScrollTarget] = useState(null)
  const chromeHidden = useChromeHidden()

  // No-league join modal state
  const [showLeagueModal,  setShowLeagueModal]  = useState(false)
  const [paymentName,      setPaymentName]      = useState(null)
  const [createdLeague,    setCreatedLeague]    = useState(null)
  const [previewMatch,     setPreviewMatch]     = useState(null)
  const [reuseExpanded,    setReuseExpanded]    = useState(false)

  // Auto-abrir el modal de ligas una vez si el usuario no está en ninguna liga.
  // Muchos se registran (incluso rellenan "compañía") pero no llegan a unirse;
  // el banner pasivo se ignora, así que damos un empujón explícito. Solo una vez
  // por montaje para no ser insistentes — el banner queda como vía de reentrada.
  const leaguePromptedRef = useRef(false)
  useEffect(() => {
    if (leagueLoading || leaguePromptedRef.current) return
    if (leaguesReady && leagues.length === 0) {
      leaguePromptedRef.current = true
      setShowLeagueModal(true)
    }
  }, [leagueLoading, leaguesReady, leagues.length])

  // Submission state
  const [isSubmitted,  setIsSubmitted]  = useState(false)
  const [submittedAt,  setSubmittedAt]  = useState(null)
  const [cutoffTime,   setCutoffTime]   = useState(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  // True once the user edits an already-submitted prediction. Drives the
  // persistent "Cambios guardados" state in the submit pill. Reset on every
  // (re)load so a fresh scope/refresh shows the canonical "Pronóstico enviado".
  const [editedSinceSubmit, setEditedSinceSubmit] = useState(false)
  // Auto-envío al completar los 104: muchos rellenan todo y creen que ya está
  // enviado. Como se puede editar hasta el cierre, no hay fricción en marcarlo
  // como enviado en cuanto se completa. El ref evita doble disparo por scope.
  const [autoSubmitNotice, setAutoSubmitNotice] = useState(false)
  const autoSubmitRef = useRef(false)
  // Read inside handleSave without recreating it on every submission change.
  const isSubmittedRef = useRef(false)
  useEffect(() => { isSubmittedRef.current = isSubmitted }, [isSubmitted])

  // ── Data loading ────────────────────────────────────────────────────────────
  const load = useCallback(async ({ force = false } = {}) => {
    if (!leaguesReady) { console.log('[porra:load] skipped — leaguesReady=false'); return }
    const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
    const predCacheKey = `preds:${user.id}:${leagueKey}`
    const subCacheKey  = `sub:${user.id}:${leagueKey}`
    console.log(`[porra:load] START — mode=${predictionMode} leagueKey=${leagueKey} force=${force}`)
    setEditedSinceSubmit(false)
    autoSubmitRef.current = false

    // Initial path: hydrate from caches so the UI is instant.
    // Force path (pull-to-refresh): keep current UI, just refetch.
    if (!force) {
      const cachedPreds = getCache(predCacheKey)
      const cachedSub   = getCache(subCacheKey)
      console.log('[porra:load] predCache:', cachedPreds ? `HIT (${Object.keys(cachedPreds).length} preds)` : 'MISS')
      if (cachedPreds) {
        setPredictions(cachedPreds)
        const initialDrafts = {}
        for (const [matchId, p] of Object.entries(cachedPreds)) {
          initialDrafts[matchId] = {
            home: String(p.home_score ?? ''),
            away: String(p.away_score ?? ''),
            tiebreaker: p.tiebreaker ?? null,
          }
        }
        setDrafts(initialDrafts)
      } else {
        setPredictions({})
        setDrafts({})
      }
      if (cachedSub !== null) {
        setIsSubmitted(cachedSub?.submitted ?? false)
        setSubmittedAt(cachedSub?.submittedAt ?? null)
      } else {
        setIsSubmitted(false)
        setSubmittedAt(null)
      }

      const hasMatches = matches.length > 0 || !!getMatchCache()
      console.log('[porra:load] hasMatches:', hasMatches, `(state=${matches.length}, cache=${!!getMatchCache()})`)
      if (!hasMatches) setLoading(true)
    }

    const t0 = Date.now()
    try {
      const predQuery = (predictionMode === 'per_league' && activeLeague)
        ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', activeLeague.id)
        : supabase.from('predictions').select('*').eq('user_id', user.id).is('league_id', null)

      const subQuery = (predictionMode === 'per_league' && activeLeague)
        ? supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).eq('league_id', activeLeague.id).eq('source', 'matches').maybeSingle()
        : supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).is('league_id', null).eq('source', 'matches').maybeSingle()

      const cachedMatches = !force ? getMatchCache() : null
      console.log('[porra:load] matchCache for query:', cachedMatches ? `HIT (${cachedMatches.length} matches, skipping network)` : 'MISS → fetching from DB')
      const [
        { data: matchData },
        { data: predData },
        { data: subData },
      ] = await Promise.all([
        cachedMatches
          ? Promise.resolve({ data: cachedMatches })
          : sq(supabase.from('matches').select('*').order('match_date')),
        sq(predQuery),
        sq(subQuery),
      ])
      console.log(`[porra:load] network done in ${Date.now() - t0}ms — matches:${matchData?.length ?? 'TIMEOUT'} preds:${predData?.length ?? 'TIMEOUT'} sub:${subData !== undefined ? (subData ? 'submitted' : 'none') : 'TIMEOUT'}`)

      // Si la red trae partidos los usamos; si no (timeout por token
      // refrescándose tras deploy, error de red…) caemos a la última versión
      // conocida en vez de dejar la página vacía. matchData puede ser [] si la
      // query "tuvo éxito" pero no devolvió filas → tratamos igual que fallo.
      const effectiveMatches = matchData?.length ? matchData : getMatchCacheStale()
      if (matchData?.length) setMatchCache(matchData)
      if (effectiveMatches?.length) {
        setMatches(effectiveMatches)
        const firstGroup = effectiveMatches.find(m => m.stage === 'group') ?? effectiveMatches[0]
        if (firstGroup) {
          setCutoffTime(new Date(firstGroup.match_date).getTime() - 30 * 60 * 1000)
        }
        const available = [...new Set(effectiveMatches.map(m => m.stage))]
        setActiveStage(prev => available.includes(prev) ? prev : (STAGE_ORDER.find(s => available.includes(s)) ?? available[0]))
      }

      if (predData) {
        const map = {}
        const initialDrafts = {}
        predData.forEach(p => {
          map[p.match_id] = p
          initialDrafts[p.match_id] = { home: String(p.home_score ?? ''), away: String(p.away_score ?? ''), tiebreaker: p.tiebreaker ?? null }
        })
        setPredictions(map)
        setDrafts(initialDrafts)
        setCache(predCacheKey, map)
      }

      if (predData !== null) {
        if (subData) {
          setIsSubmitted(true)
          setSubmittedAt(subData.submitted_at)
          setCache(subCacheKey, { submitted: true, submittedAt: subData.submitted_at })
        } else {
          setIsSubmitted(false)
          setSubmittedAt(null)
          setCache(subCacheKey, { submitted: false, submittedAt: null })
        }
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeLeague?.id, predictionMode, leaguesReady])

  useEffect(() => { load() }, [load])

  // Pull-to-refresh: force a network round-trip, bypass match/pred caches.
  usePullRefresh(useCallback(() => load({ force: true }), [load]))

  // Realtime: cuando un partido cambia de estado (live → finished, corrección
  // de marcador), recargamos para reflejar el resultado y los puntos sin que
  // el usuario tenga que hacer pull-to-refresh.
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`pronosticos-matches-${user.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => load({ force: true }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, load])

  // ── Consensus (most-picked score per match) ─────────────────────────────────
  // En modo global: RPC `match_consensus_v1()` agrega sobre todos los usuarios.
  // En modo per_league: RPC `match_consensus_by_league_v1(league_id)` filtra
  // a los miembros de la liga (≥3 votantes dentro de la liga). Cacheamos por
  // clave de scope para que un swap de liga no muestre datos del scope previo.
  useEffect(() => {
    const isPerLeague = predictionMode === 'per_league' && !!activeLeague?.id
    const cacheKey    = isPerLeague ? `consensus:league:${activeLeague.id}` : 'consensus:global'
    const cached = getCache(cacheKey)
    if (cached) setConsensus(cached)
    else        setConsensus({})
    let cancelled = false
    ;(async () => {
      const rpc = isPerLeague
        ? supabase.rpc('match_consensus_by_league_v1', { p_league_id: activeLeague.id })
        : supabase.rpc('match_consensus_v1')
      const { data } = await sq(rpc)
      if (cancelled || !data) return
      const map = {}
      for (const row of data) {
        map[row.match_id] = {
          home_score:  row.home_score,
          away_score:  row.away_score,
          vote_count:  row.vote_count,
          total_voters: row.total_voters,
        }
      }
      setConsensus(map)
      setCache(cacheKey, map)
    })()
    return () => { cancelled = true }
  }, [predictionMode, activeLeague?.id])

  // ── Cascade: group predictions → predicted knockout teams ───────────────────
  const predictedOverlay = useMemo(() => {
    if (!matches.length) return {}
    const predMap = {}
    for (const [matchId, pred] of Object.entries(predictions)) {
      predMap[matchId] = { home_score: pred.home_score, away_score: pred.away_score, tiebreaker: pred.tiebreaker ?? null }
    }
    for (const [matchId, draft] of Object.entries(drafts)) {
      if (draft.home !== '' && draft.away !== '') {
        predMap[matchId] = { home_score: Number(draft.home), away_score: Number(draft.away), tiebreaker: draft.tiebreaker ?? null }
      }
    }
    return computePredictedKnockout(matches, predMap)
  }, [matches, predictions, drafts])

  // ── Cascade real: resultados reales → equipos reales en cada cruce ──────────
  const realKnockoutOverlay = useMemo(() => {
    if (!matches.length) return {}
    const realPredMap = {}
    for (const m of matches) {
      if (m.home_score != null && m.away_score != null) {
        realPredMap[m.id] = { home_score: m.home_score, away_score: m.away_score, tiebreaker: m.winner ?? null }
      }
    }
    return computePredictedKnockout(matches, realPredMap)
  }, [matches])

  // ── Save a single draft ─────────────────────────────────────────────────────
  const handleSave = useCallback(async (matchId, home, away, tiebreaker = null) => {
    setError('')
    const existing = predictions[matchId]
    const leagueId = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : null
    const payload  = { user_id: user.id, match_id: matchId, home_score: home, away_score: away, league_id: leagueId, tiebreaker: tiebreaker ?? null }
    const op = existing ? 'UPDATE' : 'INSERT'
    console.log(`[porra:save] ${op} matchId=${matchId} score=${home}-${away} league=${leagueId ?? 'global'}`)

    const t0 = Date.now()
    const { data, error: err } = existing
      ? await supabase.from('predictions').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('predictions').insert(payload).select().single()

    if (err) {
      console.error(`[porra:save] ${op} FAILED in ${Date.now() - t0}ms`, err)
      setError(t('pronosticos.errSaveDraft'))
      return false
    }
    console.log(`[porra:save] ${op} OK in ${Date.now() - t0}ms → id=${data.id} score=${data.home_score}-${data.away_score}`)
    setPredictions(p => {
      const next = { ...p, [matchId]: data }
      const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
      setCache(`preds:${user.id}:${leagueKey}`, next)
      return next
    })
    setDrafts(d => ({ ...d, [matchId]: { home: String(data.home_score), away: String(data.away_score), tiebreaker: data.tiebreaker ?? null } }))
    // Editing an already-submitted prediction → flip the pill to "Cambios
    // guardados". Pre-submission saves (and the flush inside handleSubmit, which
    // runs before the submission row exists) leave the ref false, so they don't.
    if (isSubmittedRef.current) setEditedSinceSubmit(true)
    return true
  }, [predictions, user.id, activeLeague, predictionMode, t])

  const handleDraftChange = useCallback((matchId, home, away) => {
    setDrafts(d => ({ ...d, [matchId]: { ...(d[matchId] ?? {}), home, away } }))
  }, [])

  const handleTiebreakerChange = useCallback((matchId, tiebreaker) => {
    setDrafts(d => ({ ...d, [matchId]: { ...(d[matchId] ?? { home: '', away: '' }), tiebreaker } }))
  }, [])

  // ── Copy predictions from another league ────────────────────────────────────
  async function handleLeaguePaymentSuccess(league) {
    setPaymentName(null)
    if (onLeagueCreated) await onLeagueCreated(league)
    setCreatedLeague(league)
  }
  async function handleFounderCreated(league) {
    setShowLeagueModal(false)
    if (onLeagueCreated) await onLeagueCreated(league)
    setCreatedLeague(league)
  }

  const copyFromLeague = useCallback(async (sourceLeagueId) => {
    setCopying(true)
    setError('')
    try {
      const sourceLeague = leagues.find(l => l.id === sourceLeagueId)
      const sourcePredMode = sourceLeague?.prediction_mode ?? 'global'
      const sourceQuery = sourcePredMode === 'per_league'
        ? supabase.from('predictions').select('match_id, home_score, away_score, tiebreaker').eq('user_id', user.id).eq('league_id', sourceLeagueId)
        : supabase.from('predictions').select('match_id, home_score, away_score, tiebreaker').eq('user_id', user.id).is('league_id', null)

      const { data: sourcePreds } = await sourceQuery

      if (!sourcePreds?.length) {
        setError(t('pronosticos.errNoPredictions'))
        return
      }

      const destLeagueId = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : null

      // RPC `copy_predictions_v1` envuelve delete+insert en una sola
      // transacción server-side. Si el insert falla por cualquier motivo
      // el delete previo se revierte → el usuario NO se queda sin
      // pronósticos en la liga de destino (era el riesgo de la
      // implementación anterior, que hacía las dos queries por separado).
      const rpcRows = sourcePreds.map(p => ({
        match_id:   p.match_id,
        home_score: p.home_score,
        away_score: p.away_score,
        tiebreaker: p.tiebreaker ?? null,
      }))
      const { error: rpcErr } = await supabase.rpc('copy_predictions_v1', {
        p_dst_league_id: destLeagueId,
        p_rows:          rpcRows,
      })
      if (rpcErr) throw rpcErr

      // Releemos para reflejar lo que quedó realmente en BD (los IDs son
      // nuevos tras el delete+insert).
      const readQuery = destLeagueId
        ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', destLeagueId)
        : supabase.from('predictions').select('*').eq('user_id', user.id).is('league_id', null)
      const { data: fresh } = await readQuery
      const map = {}
      const newDrafts = {}
      ;(fresh ?? []).forEach(p => {
        map[p.match_id] = p
        newDrafts[p.match_id] = { home: String(p.home_score ?? ''), away: String(p.away_score ?? ''), tiebreaker: p.tiebreaker ?? null }
      })
      setPredictions(map)
      setDrafts(newDrafts)
      const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
      setCache(`preds:${user.id}:${leagueKey}`, map)
    } catch {
      setError(t('pronosticos.errCopy'))
    } finally {
      setCopying(false)
    }
  }, [user.id, activeLeague, leagues, predictionMode, t])

  // ── Bulk fill empty drafts from the global consensus ───────────────────────
  // Quality-of-life: scrolls through every match without a saved prediction
  // AND no draft, drops the most-popular score in, and persists in parallel.
  // Knockout draws are skipped (no consensus tiebreaker → would require an
  // extra user decision; better to leave those for manual fill).
  const [fillStatus, setFillStatus] = useState({ state: 'idle', count: 0, failed: 0 })

  // Lets the user hide the consensus-fill suggestion for the current session
  // (e.g. they prefer to fill picks manually). Resets on page reload — no
  // need to persist; reappearing is a useful nudge if they come back.
  const [consensusDismissed, setConsensusDismissed] = useState(false)
  const fillTimerRef = useRef(null)
  const fillFromConsensus = useCallback(async () => {
    if (fillStatus.state === 'running') return
    if (isSubmitted) return
    if (cutoffTime && Date.now() >= cutoffTime) return
    setError('')

    const targets = matches.filter(m => {
      if (m.status !== 'scheduled') return false
      if (Date.now() >= new Date(m.match_date).getTime() - 30 * 60 * 1000) return false
      const d = drafts[m.id]
      if (d && d.home !== '' && d.away !== '') return false  // already filled
      const c = consensus[m.id]
      if (!c) return false
      // Solo rellenamos partidos cuyos equipos conocemos: en eliminatorias eso
      // exige tener los equipos reales (o el cascade del usuario como fallback).
      const dh = isTbd(m.home_team)
        ? (realKnockoutOverlay[m.id]?.homeTeam ?? predictedOverlay[m.id]?.homeTeam ?? m.home_team)
        : m.home_team
      const da = isTbd(m.away_team)
        ? (realKnockoutOverlay[m.id]?.awayTeam ?? predictedOverlay[m.id]?.awayTeam ?? m.away_team)
        : m.away_team
      if (isTbd(dh) || isTbd(da)) return false
      // Skip knockout matches where consensus is a draw — those need a
      // tiebreaker the user has to pick manually.
      if (m.stage !== 'group' && Number(c.home_score) === Number(c.away_score)) return false
      return true
    })

    clearTimeout(fillTimerRef.current)

    if (targets.length === 0) {
      setFillStatus({ state: 'empty', count: 0, failed: 0 })
      fillTimerRef.current = setTimeout(() => setFillStatus({ state: 'idle', count: 0, failed: 0 }), 2500)
      return
    }

    setFillStatus({ state: 'running', count: 0, failed: 0 })

    // Important: do NOT set drafts optimistically here. Each MatchCard has
    // its own debounced auto-save effect (700 ms after a draft mutation).
    // Pre-filling drafts and then firing handleSave in parallel would race
    // both code paths against the same prediction row. handleSave already
    // updates drafts AND predictions atomically on success, so the cards
    // re-render with the new values once the server confirms — at the cost
    // of a brief 200-500 ms perceived delay, which is acceptable for a
    // bulk action.
    const results = await Promise.all(
      targets.map(m => {
        const c = consensus[m.id]
        return handleSave(m.id, c.home_score, c.away_score, null)
      })
    )
    const ok     = results.filter(r => r).length
    const failed = results.length - ok
    haptics.medium()
    setFillStatus({ state: 'done', count: ok, failed })
    fillTimerRef.current = setTimeout(() => setFillStatus({ state: 'idle', count: 0, failed: 0 }), 3500)
  }, [matches, drafts, consensus, predictedOverlay, fillStatus.state, isSubmitted, cutoffTime, handleSave])

  // Cancel any pending status-reset timer on unmount so it doesn't fire
  // after the component is gone (and to avoid stale state warnings).
  useEffect(() => () => clearTimeout(fillTimerRef.current), [])

  // ── Final submission ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try {
      // 1. Flush all unsaved drafts in parallel
      const toSave = matches.filter(m => {
        const d = drafts[m.id]
        if (!d || d.home === '' || d.away === '') return false
        const pred = predictions[m.id]
        if (!pred) return true
        const tiebreakerChanged = m.stage !== 'group' && (d.tiebreaker ?? null) !== (pred.tiebreaker ?? null)
        return Number(d.home) !== pred.home_score || Number(d.away) !== pred.away_score || tiebreakerChanged
      })

      if (toSave.length > 0) {
        const results = await Promise.all(
          toSave.map(m => handleSave(m.id, Number(drafts[m.id].home), Number(drafts[m.id].away), drafts[m.id].tiebreaker ?? null))
        )
        if (results.some(r => r === false)) {
          setError(t('pronosticos.errSaveMultiple'))
          return false
        }
      }

      // 2. Record the submission (unique per user+league). 23505 = ya existe →
      // lo tratamos como éxito (idempotente: auto-submit y manual conviven).
      const leagueId = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : null
      const { error: err } = await supabase
        .from('prediction_submissions')
        .insert({ user_id: user.id, league_id: leagueId, source: 'matches' })

      if (err && err.code !== '23505') throw err

      const submittedAtNow = new Date().toISOString()
      setIsSubmitted(true)
      setSubmittedAt(submittedAtNow)
      const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
      setCache(`sub:${user.id}:${leagueKey}`, { submitted: true, submittedAt: submittedAtNow })
      setShowConfirm(false)
      haptics.success()
      return true
    } catch {
      setError(t('pronosticos.errSubmit'))
      haptics.error()
      return false
    } finally {
      setSubmitting(false)
    }
  }, [matches, drafts, predictions, handleSave, user.id, activeLeague, t])

  // ── Derived values ──────────────────────────────────────────────────────────
  const otherLeagues    = leagues.filter(l => l.id !== activeLeague?.id)
  const hasPredictions  = Object.keys(predictions).length > 0
  const stages          = [...new Set(matches.map(m => m.stage))]
  const totalCount      = matches.length
  const isPastCutoff    = !!(cutoffTime && Date.now() >= cutoffTime)

  const filledCount = useMemo(
    () => matches.filter(m => {
      const d = drafts[m.id]
      if (!d || d.home === '' || d.away === '') return false
      if (m.stage !== 'group' && Number(d.home) === Number(d.away) && !d.tiebreaker) return false
      return true
    }).length,
    [matches, drafts]
  )

  // Auto-envío: en cuanto los 104 están rellenos (y no ha cerrado), registra la
  // submission sin modal. handleSubmit es idempotente, así que si ya estaba
  // enviado no rompe; el aviso solo se muestra si se acaba de enviar de verdad.
  useEffect(() => {
    if (isSubmitted || submitting || isPastCutoff) return
    if (totalCount === 0 || filledCount !== totalCount) return
    if (autoSubmitRef.current) return
    autoSubmitRef.current = true
    ;(async () => {
      const ok = await handleSubmit()
      if (ok) setAutoSubmitNotice(true)
      else    autoSubmitRef.current = false
    })()
  }, [filledCount, totalCount, isSubmitted, submitting, isPastCutoff, handleSubmit])

  // Badge on sidebar: how many matches in this stage still have no draft
  const unfilledCount = useCallback((stage) =>
    matches.filter(m => {
      if (m.stage !== stage) return false
      const d = drafts[m.id]
      if (!d || d.home === '' || d.away === '') return true
      if (m.stage !== 'group' && Number(d.home) === Number(d.away) && !d.tiebreaker) return true
      return false
    }).length,
    [matches, drafts]
  )

  // Último partido jugándose / jugado, para el botón de salto rápido. matches
  // viene ordenado por match_date asc, así que el último del grupo es el más
  // reciente; si hay alguno en vivo, ese manda.
  const latestPlayed = useMemo(() => {
    const played = matches.filter(m => m.status === 'live' || m.status === 'finished')
    if (played.length === 0) return null
    const live = played.filter(m => m.status === 'live')
    const pool = live.length ? live : played
    return pool[pool.length - 1]
  }, [matches])

  const goToLatest = useCallback(() => {
    if (!latestPlayed) return
    haptics.tap()
    setActiveStage(latestPlayed.stage)
    setScrollTarget(latestPlayed.id)
  }, [latestPlayed])

  useEffect(() => {
    if (!scrollTarget) return
    const el = document.getElementById(`match-${scrollTarget}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setScrollTarget(null)
  }, [scrollTarget, activeStage])

  const filtered = matches.filter(m => m.stage === activeStage)
  const grouped  = filtered.reduce((acc, m) => {
    const day = new Date(m.match_date).toLocaleDateString(dateLocale, {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    ;(acc[day] = acc[day] ?? []).push(m)
    return acc
  }, {})

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 py-2">
        <MatchListSkeleton count={6} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {showConfirm && (
        <ConfirmModal
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
          totalCount={totalCount}
        />
      )}

      {/* Page header */}
      <div>
        <span className="ed-mono text-terracotta text-[10px] block mb-1">// {t('pronosticos.chapter')}</span>
        <h2 className="font-display text-base sm:text-lg text-ink leading-none">{t('pronosticos.title')}</h2>
      </div>

      {/* Resultado de la unión automática por código (link/registro) */}
      {joinNotice && (
        <div className={`card px-4 py-3 flex items-start gap-3 ${
          joinNotice.type === 'success'
            ? 'border-green-600/30 bg-green-600/10'
            : 'border-red-500/30 bg-red-500/10'
        }`}>
          <span className="text-lg flex-shrink-0">{joinNotice.type === 'success' ? '✅' : '⚠️'}</span>
          <p className={`flex-1 text-sm ${joinNotice.type === 'success' ? 'text-ink' : 'text-red-400'}`}>
            {joinNotice.message}
          </p>
          <button
            onClick={clearJoinNotice}
            className="text-ink/40 hover:text-ink flex-shrink-0"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
      )}

      {/* Aviso de auto-envío: al completar los 104 se marca como enviado solo. */}
      {autoSubmitNotice && (
        <div className="card px-4 py-3 flex items-start gap-3 border-green-600/30 bg-green-600/10">
          <span className="text-lg flex-shrink-0">✅</span>
          <p className="flex-1 text-sm text-ink">
            <b>{t('pronosticos.autoSubmittedTitle')}</b> {t('pronosticos.autoSubmittedBody')}
          </p>
          <button
            onClick={() => setAutoSubmitNotice(false)}
            className="text-ink/40 hover:text-ink flex-shrink-0"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
      )}

      {/* No-league gate: banner replacing the submit panel */}
      {!leagueLoading && leagues.length === 0 ? (
        <div className="card p-5 border-ink/20 bg-cream flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-3xl flex-shrink-0">🏆</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-ink text-sm sm:text-base">{t('pronosticos.noLeagueTitle')}</p>
            <p className="text-ink/60 text-xs sm:text-sm mt-0.5">{t('pronosticos.noLeagueDesc')}</p>
          </div>
          <button
            onClick={() => setShowLeagueModal(true)}
            className="btn-primary text-sm px-4 py-2 flex-shrink-0 w-full sm:w-auto"
          >
            {t('pronosticos.noLeagueCta')}
          </button>
        </div>
      ) : (
        /* Submit panel is now rendered inline with the stage header
           below (compact pill on the right). Nothing to render here. */
        null
      )}

      {/* Copy from league prompt */}
      {activeLeague && !hasPredictions && !isSubmitted && otherLeagues.length > 0 && (
        <div className="card overflow-hidden border-ink/20 bg-paper-200">
          <button
            type="button"
            onClick={() => setReuseExpanded(e => !e)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-paper active:bg-cream transition-colors text-left"
            aria-expanded={reuseExpanded}
          >
            <span className="text-base flex-shrink-0">📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{t('pronosticos.reuseTitle')}</p>
              {!reuseExpanded && (
                <p className="text-[11px] text-ink/60 mt-0.5 truncate">
                  {t('pronosticos.reuseHint', { n: otherLeagues.length, s: otherLeagues.length !== 1 ? 's' : '' })}
                </p>
              )}
            </div>
            <span className={`text-ink/50 text-xs flex-shrink-0 transition-transform duration-200 ${reuseExpanded ? 'rotate-180' : ''}`} aria-hidden="true">
              ▼
            </span>
          </button>
          {reuseExpanded && (
            <div className="px-4 pb-3 pt-1 border-t border-ink/15 space-y-3">
              <p className="text-xs text-ink/60">
                {t('pronosticos.reuseBody', { league: activeLeague.name })}
              </p>
              <div className="flex flex-wrap gap-2">
                {otherLeagues.map(l => (
                  <button
                    key={l.id}
                    onClick={() => copyFromLeague(l.id)}
                    disabled={copying}
                    className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
                  >
                    {copying ? <Spinner size="sm" /> : '📋'}
                    {t('pronosticos.copyFrom', { name: l.name })}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <UpcomingAlert />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-none px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="card p-6 sm:p-10 text-center">
          <div className="text-3xl sm:text-4xl mb-3">📅</div>
          <p className="text-ink/60 text-sm">{t('pronosticos.noMatches')}</p>
        </div>
      ) : (
        <div className="flex gap-3 items-start">
          {/* Sidebar — desktop */}
          <StageSidebar
            stages={stages}
            activeStage={activeStage}
            onSelect={setActiveStage}
            unfilledCount={unfilledCount}
          />

          <div className="flex-1 min-w-0 space-y-4">
            {/* Tabs — mobile */}
            <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {STAGE_ORDER.filter(s => stages.includes(s)).map(stage => {
                const info     = STAGE_INFO[stage]
                const unfilled = unfilledCount(stage)
                return (
                  <button
                    key={stage}
                    onClick={() => setActiveStage(stage)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-none text-sm font-medium transition-colors ${
                      activeStage === stage
                        ? 'bg-ink text-cream'
                        : 'bg-paper text-ink/60 hover:text-ink'
                    }`}
                  >
                    <span>{info.icon}</span>
                    <span>{info.short}</span>
                    {unfilled > 0 && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        activeStage === stage ? 'bg-cream/20 text-cream' : 'bg-paper-200 text-ink/70'
                      }`}>
                        {unfilled}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Stage header + compact submit pill on the right */}
            <div className="flex items-center gap-2 justify-between flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-xl">{STAGE_INFO[activeStage]?.icon}</span>
                <h3 className="text-lg font-bold text-ink">{STAGE_INFO[activeStage]?.full}</h3>
                <span className="text-sm text-ink/50">
                  {t('pronosticos.matchCount', { n: filtered.length, s: filtered.length !== 1 ? 's' : '' })}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  unfilledCount(activeStage) === 0
                    ? 'bg-grass-500/15 text-grass-600 border border-grass-500/30'
                    : 'bg-paper-200 text-ink/70 border border-ink/20'
                }`}>
                  {unfilledCount(activeStage) === 0
                    ? t('pronosticos.completeLabel')
                    : t('pronosticos.unfilledLabel', { n: unfilledCount(activeStage) })}
                </span>
              </div>
              {matches.length > 0 && (
                <SubmitPanel
                  filledCount={filledCount}
                  totalCount={totalCount}
                  cutoffTime={cutoffTime}
                  isSubmitted={isSubmitted}
                  submittedAt={submittedAt}
                  editedSinceSubmit={editedSinceSubmit}
                  onSubmit={() => setShowConfirm(true)}
                  submitting={submitting}
                />
              )}
            </div>

            {/* Bulk-fill from consensus — only shown while the user can still
                edit, has at least one empty match, and we have consensus data
                cached. Saves people from tapping +/− 60+ times. */}
            {!isSubmitted && !isPastCutoff && !consensusDismissed && Object.keys(consensus).length > 0 && filledCount < totalCount && (
              <div className="relative bg-paper border border-ink/20 border-l-4 border-l-ink p-3 pr-9 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setConsensusDismissed(true)}
                  aria-label={t('common.close')}
                  className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center text-ink/50 hover:text-ink hover:bg-cream transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-ink">
                    {fillStatus.state === 'done' && fillStatus.failed > 0
                      ? t('pronosticos.fillConsensusPartial', {
                          ok:   fillStatus.count,
                          fail: fillStatus.failed,
                        })
                      : fillStatus.state === 'done'
                        ? t('pronosticos.fillConsensusDone', {
                            n: fillStatus.count,
                            s: fillStatus.count !== 1 ? 's' : '',
                          })
                        : fillStatus.state === 'empty'
                          ? t('pronosticos.fillConsensusEmpty')
                          : t('pronosticos.fillConsensusBtn')}
                  </p>
                  {fillStatus.state === 'idle' && (
                    <p className="text-[11px] text-ink/60 mt-0.5 leading-snug">
                      {t('pronosticos.fillConsensusHint')}
                    </p>
                  )}
                </div>
                {fillStatus.state !== 'done' && fillStatus.state !== 'empty' && (
                  <button
                    onClick={fillFromConsensus}
                    disabled={fillStatus.state === 'running'}
                    className="btn-secondary text-sm py-2 px-4 flex-shrink-0 flex items-center justify-center gap-1.5"
                  >
                    {fillStatus.state === 'running'
                      ? <><Spinner size="sm" />{t('pronosticos.fillConsensusFilling')}</>
                      : t('pronosticos.fillConsensusBtn')}
                  </button>
                )}
              </div>
            )}

            {/* Match cards by day */}
            {Object.entries(grouped).map(([day, dayMatches]) => (
              <div key={day}>
                <p className="text-xs font-semibold text-ink/50 uppercase tracking-wider mb-2 capitalize">{day}</p>
                <div className="space-y-3">
                  {dayMatches.map(m => (
                    <div key={`${m.id}-${activeLeague?.id ?? 'none'}`} id={`match-${m.id}`} className="scroll-mt-20">
                    <MatchCard
                      match={m}
                      prediction={predictions[m.id]}
                      onSave={handleSave}
                      draft={drafts[m.id]}
                      onDraftChange={handleDraftChange}
                      onTiebreakerChange={handleTiebreakerChange}
                      predictedHome={predictedOverlay[m.id]?.homeTeam}
                      predictedAway={predictedOverlay[m.id]?.awayTeam}
                      realHome={realKnockoutOverlay[m.id]?.homeTeam}
                      realAway={realKnockoutOverlay[m.id]?.awayTeam}
                      isPastCutoff={isPastCutoff}
                      consensus={consensus[m.id]}
                      onPreview={activeLeague ? () => setPreviewMatch(m) : null}
                    />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showLeagueModal && (
        <LeagueModal
          onClose={() => setShowLeagueModal(false)}
          onPaymentRequested={(name) => { setShowLeagueModal(false); setPaymentName(name) }}
          onFounderCreated={handleFounderCreated}
        />
      )}
      {paymentName && (
        <PaymentModal
          leagueName={paymentName}
          onClose={() => setPaymentName(null)}
          onSuccess={handleLeaguePaymentSuccess}
        />
      )}
      {createdLeague && (
        <LeagueCreatedModal
          league={createdLeague}
          onClose={() => setCreatedLeague(null)}
        />
      )}
      {previewMatch && (
        <MatchPreviewModal
          match={previewMatch}
          userPrediction={predictions[previewMatch.id]}
          league={activeLeague}
          onClose={() => setPreviewMatch(null)}
        />
      )}

      {latestPlayed && matches.length > 0 && (
        <button
          type="button"
          onClick={goToLatest}
          aria-label={t('pronosticos.jumpToLive')}
          title={t('pronosticos.jumpToLive')}
          className={`fixed bottom-20 sm:bottom-5 left-3 sm:left-5 z-40 flex items-center gap-2 pl-3 pr-3.5 py-2.5 rounded-full bg-ink/90 text-cream shadow-lg backdrop-blur hover:bg-ink transition-all duration-300 ${
            chromeHidden ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
          } sm:opacity-100 sm:translate-y-0 sm:pointer-events-auto`}
        >
          {latestPlayed.status === 'live'
            ? <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
            : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          <span className="text-xs font-semibold hidden sm:inline">{t('pronosticos.jumpToLive')}</span>
        </button>
      )}
    </div>
  )
}
