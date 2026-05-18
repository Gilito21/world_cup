import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, setMatchCache } from '../lib/matchCache'
import { getCache, setCache } from '../lib/dataCache'
import haptics from '../lib/haptics'
import usePullRefresh from '../lib/usePullRefresh'
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
    <div className={`inline-flex items-stretch bg-paper border border-ink/30 rounded-xl shadow-sm overflow-hidden select-none ${disabled ? 'opacity-40' : ''}`}>
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

function SubmitPanel({ filledCount, totalCount, cutoffTime, isSubmitted, submittedAt, onSubmit, submitting }) {
  const { t, dateLocale } = useLang()
  const [expanded, setExpanded] = useState(false)
  const pct          = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0
  const isPastCutoff = !!(cutoffTime && Date.now() >= cutoffTime)
  const isComplete   = filledCount === totalCount && totalCount > 0
  const canSubmit    = isComplete && !isPastCutoff && !isSubmitted

  // Terminal: prediction was submitted — compact one-line success card
  if (isSubmitted) {
    return (
      <div className="card p-3 sm:p-4 bg-green-50/80 border-green-200 flex items-center gap-3">
        <span className="text-2xl sm:text-3xl flex-shrink-0">✅</span>
        <div className="min-w-0">
          <p className="font-bold text-green-700 text-sm sm:text-base">{t('pronosticos.submitted')}</p>
          <p className="text-[11px] sm:text-xs text-green-600 mt-0.5">
            {submittedAt
              ? new Date(submittedAt).toLocaleDateString(dateLocale, {
                  day: 'numeric', month: 'short',
                  hour: '2-digit', minute: '2-digit',
                })
              : ''}
            {' · '}{t('pronosticos.submittedDesc', { n: totalCount })}
          </p>
        </div>
      </div>
    )
  }

  // Terminal: deadline missed — keep this fully visible since it's important
  if (isPastCutoff) {
    return (
      <div className="card p-3 sm:p-4 space-y-2.5 sm:space-y-3">
        <div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1.5 gap-2">
            <span className="text-ink/60 font-medium truncate">{t('pronosticos.progressLabel')}</span>
            <span className="font-bold tabular-nums flex-shrink-0 text-ink/70">{filledCount} / {totalCount}</span>
          </div>
          <div className="h-2.5 bg-paper rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-ink/20" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
            <span>🔒</span>{t('pronosticos.closedMsg')}
          </p>
          <p className="text-xs text-red-500">
            {filledCount > 0
              ? t('pronosticos.missedDeadlinePartial', { n: filledCount, total: totalCount })
              : t('pronosticos.missedDeadline')}
          </p>
        </div>
      </div>
    )
  }

  // Active state: collapsible. Header shows progress + counter + chevron.
  // Submit button is always visible (key action). Body — cutoff countdown
  // + hint text — folds in/out so the panel is clean while filling matches.
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 sm:px-4 pt-3 pb-2.5 flex items-center gap-3 hover:bg-cream/80 active:bg-paper/60 transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1.5 gap-2">
            <span className="text-ink/60 font-medium truncate">{t('pronosticos.progressLabel')}</span>
            <span className={`font-bold tabular-nums flex-shrink-0 ${isComplete ? 'text-green-500' : 'text-ink/70'}`}>
              {filledCount} / {totalCount}
            </span>
          </div>
          <div className="h-2 bg-paper rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-terracotta'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className={`text-ink/50 text-xs flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true">
          ▼
        </span>
      </button>

      {/* Expanded body: cutoff details + hint */}
      {expanded && (
        <div className="px-3 sm:px-4 pb-3 pt-2 border-t border-ink/15 space-y-2">
          {cutoffTime && (
            <p className="text-xs text-ink/50 flex items-center gap-1.5 flex-wrap">
              <span>{t('pronosticos.cutoffNote')}</span>
              <CutoffCountdown cutoffTime={cutoffTime} />
            </p>
          )}
          {!isComplete && (
            <p className="text-xs text-ink/50">{t('pronosticos.submitHint')}</p>
          )}
        </div>
      )}

      {/* Submit button — always visible */}
      <div className="px-3 sm:px-4 pb-3 pt-1">
        <button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3"
        >
          {submitting ? <Spinner size="sm" /> : <span>🏆</span>}
          {isComplete
            ? t('pronosticos.submitBtn')
            : t('pronosticos.submitBtnPending', { n: totalCount - filledCount, s: totalCount - filledCount !== 1 ? 's' : '' })}
        </button>
      </div>

    </div>
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

function MatchCard({ match, prediction, onSave, draft, onDraftChange, onTiebreakerChange, predictedHome, predictedAway, submitted, isPastCutoff, onPreview, consensus }) {
  const { t, dateLocale } = useLang()
  const STAGE_INFO = buildStageInfo(t)
  const STATUS_BADGE = useMemo(() => ({
    scheduled: null,
    live:     { label: t('pronosticos.liveLabel'),     cls: 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' },
    finished: { label: t('pronosticos.finishedLabel'), cls: 'bg-paper-200 text-ink/60 border-ink/30' },
  }), [t])

  const isFinished  = match.status === 'finished'
  const isLocked    = submitted || isPastCutoff || isFinished ||
                      match.status !== 'scheduled' ||
                      Date.now() >= new Date(match.match_date).getTime() - 30 * 60 * 1000

  const displayHome = isTbd(match.home_team) ? (predictedHome ?? match.home_team) : match.home_team
  const displayAway = isTbd(match.away_team) ? (predictedAway ?? match.away_team) : match.away_team
  const hasPredictedTeams = (isTbd(match.home_team) || isTbd(match.away_team)) &&
                            (predictedHome || predictedAway)

  const home        = draft?.home ?? ''
  const away        = draft?.away ?? ''
  const tiebreaker  = draft?.tiebreaker ?? null
  const setHome     = val => onDraftChange(match.id, val, away)
  const setAway     = val => onDraftChange(match.id, home, val)
  const isKnockout  = match.stage !== 'group'
  const isDraw      = home !== '' && away !== '' && Number(home) === Number(away)

  const changed = !submitted && home !== '' && away !== '' && (
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
    if (isLocked || submitted || isFinished) return
    if (!changed) return
    if (isKnockout && isDraw && !tiebreaker) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(triggerSave, 700)
    return () => clearTimeout(saveTimerRef.current)
  }, [changed, isLocked, submitted, isFinished, isKnockout, isDraw, tiebreaker, triggerSave])

  const badge = STATUS_BADGE[match.status]

  return (
    <div className={`card p-3 sm:p-4 transition-all duration-200 ${
      isFinished ? 'opacity-80' : submitted ? '' : 'hover:border-ink/30 hover:shadow-sm'
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
          {match.status === 'scheduled' && !submitted && <Countdown matchDate={match.match_date} />}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {badge && (
            <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          )}
          {/* Points badge after results come in */}
          {isFinished && prediction && (() => {
            const pts = prediction.points_earned ?? 0
            const cfg = pts === 3 ? 'bg-terracotta/20 text-terracotta-400 border-terracotta/30'
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
              className="w-7 h-7 rounded-full flex items-center justify-center text-ink/50 hover:text-terracotta hover:bg-terracotta/10 active:bg-terracotta/20 transition-colors flex-shrink-0"
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
            isTbd(match.home_team) && predictedHome ? 'text-violet-600' : 'text-ink'
          }`}>
            {teamName(displayHome)}
          </span>
          <Flag team={displayHome} />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {isFinished ? (
            <div className="flex items-center gap-2 bg-paper rounded-xl px-3 py-1.5">
              <span className="text-xl font-bold text-ink">{match.home_score}</span>
              <span className="text-ink/60">-</span>
              <span className="text-xl font-bold text-ink">{match.away_score}</span>
            </div>
          ) : match.status === 'live' ? (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5">
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
                  placeholder={!isLocked && home === '' && consensus ? consensus.home_score : undefined}
                />
                <span className="text-ink/50 font-bold text-sm">-</span>
                <ScoreStepper
                  value={away}
                  onChange={setAway}
                  disabled={isLocked}
                  placeholder={!isLocked && away === '' && consensus ? consensus.away_score : undefined}
                />
              </div>
              {consensus && !isLocked && (home === '' || away === '') && (
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
            isTbd(match.away_team) && predictedAway ? 'text-violet-600' : 'text-ink'
          }`}>
            {teamName(displayAway)}
          </span>
        </div>
      </div>

      {/* Tiebreaker selector: knockout draw predictions only */}
      {isKnockout && isDraw && !isFinished && (
        <div className="mt-3 pt-3 border-t border-ink/15 flex flex-col items-center gap-2">
          <span className="text-xs text-ink/60 font-medium">{t('pronosticos.tiebreaker')}</span>
          <div className="flex gap-2">
            <button
              onClick={() => !isLocked && onTiebreakerChange(match.id, 'home')}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                tiebreaker === 'home'
                  ? 'bg-terracotta border-terracotta text-ink'
                  : 'bg-paper border-ink/20 text-ink/70 hover:border-terracotta-400 hover:text-ink'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Flag team={displayHome} />
              <span>{teamName(displayHome)}</span>
            </button>
            <button
              onClick={() => !isLocked && onTiebreakerChange(match.id, 'away')}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                tiebreaker === 'away'
                  ? 'bg-terracotta border-terracotta text-ink'
                  : 'bg-paper border-ink/20 text-ink/70 hover:border-terracotta-400 hover:text-ink'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Flag team={displayAway} />
              <span>{teamName(displayAway)}</span>
            </button>
          </div>
          {!tiebreaker && !isLocked && (
            <span className="text-xs text-terracotta-600 font-medium">{t('pronosticos.tiebreakerRequired')}</span>
          )}
        </div>
      )}

      {/* Footer */}
      {isFinished && prediction && (
        <div className="mt-3 pt-3 border-t border-ink/20 text-center text-xs text-ink/60 space-y-1">
          <div>
            {t('pronosticos.myPrediction')}{' '}
            <span className="text-ink/80 font-medium">
              {teamName(displayHome)} {prediction.home_score} – {prediction.away_score} {teamName(displayAway)}
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
                  {`(${t('pronosticos.youPredicted', { team: prediction.tiebreaker === 'home' ? teamName(displayHome) : teamName(displayAway) })} `}
                  {prediction.tiebreaker === match.winner ? '✓)' : '✗)'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Submitted lock footer */}
      {submitted && !isFinished && (
        <div className="mt-3 pt-3 border-t border-ink/15 text-center text-xs text-ink/50 space-y-0.5">
          <div className="flex items-center justify-center gap-1">
            <span>🔒</span>
            <span>
              {t('pronosticos.lockNote')}{' '}
              <span className="font-medium text-ink/70">
                {(home || prediction?.home_score) ?? '?'} – {(away || prediction?.away_score) ?? '?'}
              </span>
            </span>
          </div>
          {isKnockout && tiebreaker && isDraw && (
            <div>
              {t('pronosticos.advancesNote')}{' '}
              <span className="font-medium text-ink/70">
                {tiebreaker === 'home' ? teamName(displayHome) : teamName(displayAway)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Auto-save status row (only while the card is editable) */}
      {!submitted && !isLocked && !isFinished && (
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
            <span className="text-terracotta/70">•</span>
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
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  isActive  ? 'bg-terracotta text-ink shadow-sm'
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
                    isActive ? 'bg-ink/20 text-ink' : 'bg-terracotta/20 text-terracotta-600'
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
  const { activeLeague, leagues, loading: leagueLoading, onLeagueCreated } = useLeague()
  const { t, dateLocale }         = useLang()
  const predictionMode = activeLeague?.prediction_mode ?? 'global'

  const STAGE_INFO = useMemo(() => buildStageInfo(t), [t])

  const [matches,     setMatches]     = useState(() => getMatchCache() ?? [])
  const [predictions, setPredictions] = useState({})
  const [drafts,      setDrafts]      = useState({})
  const [consensus,   setConsensus]   = useState({}) // matchId → { home_score, away_score, vote_count, total_voters }
  // Start as loading only if we have no cached matches at all. When the user
  // navigates back to this page and we already have data in memory, render it
  // immediately and refresh in the background — no spinner.
  const [loading,     setLoading]     = useState(() => !getMatchCache())
  const [activeStage, setActiveStage] = useState('group')
  const [error,       setError]       = useState('')
  const [copying,     setCopying]     = useState(false)

  // No-league join modal state
  const [showLeagueModal,  setShowLeagueModal]  = useState(false)
  const [paymentName,      setPaymentName]      = useState(null)
  const [createdLeague,    setCreatedLeague]    = useState(null)
  const [previewMatch,     setPreviewMatch]     = useState(null)
  const [reuseExpanded,    setReuseExpanded]    = useState(false)

  // Submission state
  const [isSubmitted,  setIsSubmitted]  = useState(false)
  const [submittedAt,  setSubmittedAt]  = useState(null)
  const [cutoffTime,   setCutoffTime]   = useState(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────────
  const load = useCallback(async ({ force = false } = {}) => {
    if (leagueLoading) return
    const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
    const predCacheKey = `preds:${user.id}:${leagueKey}`
    const subCacheKey  = `sub:${user.id}:${leagueKey}`

    // Initial path: hydrate from caches so the UI is instant.
    // Force path (pull-to-refresh): keep current UI, just refetch.
    if (!force) {
      const cachedPreds = getCache(predCacheKey)
      const cachedSub   = getCache(subCacheKey)
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

      const hasMatches    = matches.length > 0 || !!getMatchCache()
      const hasCachedView = hasMatches && getCache(predCacheKey)
      if (!hasCachedView) setLoading(true)
    }

    try {
      const predQuery = (predictionMode === 'per_league' && activeLeague)
        ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', activeLeague.id)
        : supabase.from('predictions').select('*').eq('user_id', user.id).is('league_id', null)

      const subQuery = (predictionMode === 'per_league' && activeLeague)
        ? supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).eq('league_id', activeLeague.id).eq('source', 'matches').maybeSingle()
        : supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).is('league_id', null).eq('source', 'matches').maybeSingle()

      const cachedMatches = !force ? getMatchCache() : null
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

      if (matchData) {
        setMatchCache(matchData)
        setMatches(matchData)
        const firstGroup = matchData.find(m => m.stage === 'group') ?? matchData[0]
        if (firstGroup) {
          setCutoffTime(new Date(firstGroup.match_date).getTime() - 60 * 60 * 1000)
        }
        const available = [...new Set(matchData.map(m => m.stage))]
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
  }, [user?.id, activeLeague?.id, predictionMode, leagueLoading])

  useEffect(() => { load() }, [load])

  // Pull-to-refresh: force a network round-trip, bypass match/pred caches.
  usePullRefresh(useCallback(() => load({ force: true }), [load]))

  // ── Global consensus (most-picked score per match across all users) ─────────
  // Single RPC call returns one row per match with ≥3 voters. Aggregates
  // run via SECURITY DEFINER on the server; only the top score per match
  // is exposed to the client. We cache the result in dataCache so revisits
  // show the placeholder hints instantly while a fresh copy refreshes in
  // the background.
  useEffect(() => {
    const cached = getCache('consensus:global')
    if (cached) setConsensus(cached)
    let cancelled = false
    ;(async () => {
      const { data } = await sq(supabase.rpc('match_consensus_v1'))
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
      setCache('consensus:global', map)
    })()
    return () => { cancelled = true }
  }, [])

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

  // ── Save a single draft ─────────────────────────────────────────────────────
  const handleSave = useCallback(async (matchId, home, away, tiebreaker = null) => {
    setError('')
    const existing = predictions[matchId]
    const leagueId = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : null
    const payload  = { user_id: user.id, match_id: matchId, home_score: home, away_score: away, league_id: leagueId, tiebreaker: tiebreaker ?? null }

    const { data, error: err } = existing
      ? await supabase.from('predictions').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('predictions').insert(payload).select().single()

    if (err) {
      setError(t('pronosticos.errSaveDraft'))
      return false
    }
    setPredictions(p => {
      const next = { ...p, [matchId]: data }
      const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
      setCache(`preds:${user.id}:${leagueKey}`, next)
      return next
    })
    setDrafts(d => ({ ...d, [matchId]: { home: String(data.home_score), away: String(data.away_score), tiebreaker: data.tiebreaker ?? null } }))
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
  }, [matches, drafts, consensus, fillStatus.state, isSubmitted, cutoffTime, handleSave])

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
          return
        }
      }

      // 2. Record the submission (unique per user+league — DB enforces no duplicates)
      const leagueId = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : null
      const { error: err } = await supabase
        .from('prediction_submissions')
        .insert({ user_id: user.id, league_id: leagueId, source: 'matches' })

      if (err) throw err

      const submittedAtNow = new Date().toISOString()
      setIsSubmitted(true)
      setSubmittedAt(submittedAtNow)
      const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
      setCache(`sub:${user.id}:${leagueKey}`, { submitted: true, submittedAt: submittedAtNow })
      setShowConfirm(false)
      haptics.success()
    } catch {
      setError(t('pronosticos.errSubmit'))
      haptics.error()
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
    <div className="space-y-5">
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
        <h2 className="font-display text-2xl sm:text-3xl text-ink leading-none">{t('pronosticos.title')}</h2>
        <p className="font-serif italic text-ink/70 text-sm sm:text-base mt-1.5">
          {t('pronosticos.subtitle')}
        </p>
      </div>

      {/* No-league gate: banner replacing the submit panel */}
      {!leagueLoading && leagues.length === 0 ? (
        <div className="card p-5 border-terracotta/30 bg-gradient-to-br from-terracotta/40 to-terracotta/40 flex flex-col sm:flex-row items-start sm:items-center gap-4">
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
        /* Submit panel — always visible when in a league */
        matches.length > 0 && (
          <SubmitPanel
            filledCount={filledCount}
            totalCount={totalCount}
            cutoffTime={cutoffTime}
            isSubmitted={isSubmitted}
            submittedAt={submittedAt}
            onSubmit={() => setShowConfirm(true)}
            submitting={submitting}
          />
        )
      )}

      {/* Copy from league prompt */}
      {activeLeague && !hasPredictions && !isSubmitted && otherLeagues.length > 0 && (
        <div className="card overflow-hidden border-terracotta/20 bg-terracotta/5">
          <button
            type="button"
            onClick={() => setReuseExpanded(e => !e)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-terracotta/10 active:bg-terracotta/20 transition-colors text-left"
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
            <div className="px-4 pb-3 pt-1 border-t border-terracotta/20 space-y-3">
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
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
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
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                      activeStage === stage
                        ? 'bg-terracotta text-ink'
                        : 'bg-paper text-ink/60 hover:text-ink'
                    }`}
                  >
                    <span>{info.icon}</span>
                    <span>{info.short}</span>
                    {unfilled > 0 && !isSubmitted && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        activeStage === stage ? 'bg-ink/20' : 'bg-terracotta/20 text-terracotta-600'
                      }`}>
                        {unfilled}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Stage header */}
            <div className="flex items-center gap-2">
              <span className="text-xl">{STAGE_INFO[activeStage]?.icon}</span>
              <h3 className="text-lg font-bold text-ink">{STAGE_INFO[activeStage]?.full}</h3>
              <span className="text-sm text-ink/50">
                {t('pronosticos.matchCount', { n: filtered.length, s: filtered.length !== 1 ? 's' : '' })}
              </span>
              {!isSubmitted && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-1 ${
                  unfilledCount(activeStage) === 0
                    ? 'bg-green-100 text-green-600'
                    : 'bg-terracotta/20 text-terracotta-600'
                }`}>
                  {unfilledCount(activeStage) === 0
                    ? t('pronosticos.completeLabel')
                    : t('pronosticos.unfilledLabel', { n: unfilledCount(activeStage) })}
                </span>
              )}
            </div>

            {/* Bulk-fill from consensus — only shown while the user can still
                edit, has at least one empty match, and we have consensus data
                cached. Saves people from tapping +/− 60+ times. */}
            {!isSubmitted && !isPastCutoff && Object.keys(consensus).length > 0 && filledCount < totalCount && (
              <div className="card p-3 bg-terracotta/40 border-terracotta/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
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
                    <MatchCard
                      key={`${m.id}-${activeLeague?.id ?? 'none'}`}
                      match={m}
                      prediction={predictions[m.id]}
                      onSave={handleSave}
                      draft={drafts[m.id]}
                      onDraftChange={handleDraftChange}
                      onTiebreakerChange={handleTiebreakerChange}
                      predictedHome={predictedOverlay[m.id]?.homeTeam}
                      predictedAway={predictedOverlay[m.id]?.awayTeam}
                      submitted={isSubmitted}
                      isPastCutoff={isPastCutoff}
                      consensus={consensus[m.id]}
                      onPreview={activeLeague ? () => setPreviewMatch(m) : null}
                    />
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
    </div>
  )
}
