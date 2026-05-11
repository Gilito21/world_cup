import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, sq } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import Spinner from '../components/Spinner'
import UpcomingAlert from '../components/UpcomingAlert'
import { Flag, teamName } from '../utils/teams'
import { computePredictedKnockout } from '../utils/tournament'

const STAGE_ORDER = ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']

const STAGE_INFO = {
  group:         { icon: '⚽', short: 'Grupos',        full: 'Fase de grupos' },
  round_of_32:   { icon: '🎽', short: 'Dieciseisavos', full: 'Dieciseisavos' },
  round_of_16:   { icon: '🎯', short: 'Octavos',       full: 'Octavos de final' },
  quarter_final: { icon: '⚔️',  short: 'Cuartos',       full: 'Cuartos de final' },
  semi_final:    { icon: '⭐',  short: 'Semis',          full: 'Semifinales' },
  third_place:   { icon: '🥉', short: '3er puesto',    full: 'Tercer puesto' },
  final:         { icon: '🏆', short: 'Final',          full: 'Gran Final' },
}

const STATUS_BADGE = {
  scheduled: null,
  live:     { label: 'EN VIVO',    cls: 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' },
  finished: { label: 'Finalizado', cls: 'bg-stone-200 text-stone-500 border-stone-300' },
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

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
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
    <span className="text-xs font-mono text-stone-400">
      {days > 0 && <><b className="text-stone-600">{days}</b>d </>}
      <b className="text-stone-600">{String(hours).padStart(2, '0')}</b>h{' '}
      <b className="text-stone-600">{String(minutes).padStart(2, '0')}</b>m{' '}
      <b className="text-stone-600">{String(seconds).padStart(2, '0')}</b>s
    </span>
  )
}

function CutoffCountdown({ cutoffTime }) {
  const [left, setLeft] = useState(() => getTimeLeft(cutoffTime))
  useEffect(() => {
    const t = setInterval(() => setLeft(getTimeLeft(cutoffTime)), 1000)
    return () => clearInterval(t)
  }, [cutoffTime])
  if (!left) return <span className="font-semibold text-red-500">¡Cerrado!</span>
  const { days, hours, minutes, seconds } = left
  return (
    <span className="font-mono font-semibold text-stone-700">
      {days > 0 && <>{days}d </>}
      {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
    </span>
  )
}

// ─── SCORE INPUT ─────────────────────────────────────────────────────────────

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      max="99"
      value={value}
      onChange={e => onChange(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
      disabled={disabled}
      className="w-12 h-12 text-center text-xl font-bold bg-white border border-stone-300 rounded-xl text-stone-900
                 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500
                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
    />
  )
}

// ─── SUBMIT PANEL ─────────────────────────────────────────────────────────────

function SubmitPanel({ filledCount, totalCount, cutoffTime, isSubmitted, submittedAt, onSubmit, submitting }) {
  const pct          = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0
  const isPastCutoff = !!(cutoffTime && Date.now() >= cutoffTime)
  const isComplete   = filledCount === totalCount && totalCount > 0
  const canSubmit    = isComplete && !isPastCutoff && !isSubmitted

  if (isSubmitted) {
    return (
      <div className="card p-4 bg-green-50/80 border-green-200 flex items-center gap-4">
        <span className="text-3xl flex-shrink-0">✅</span>
        <div className="min-w-0">
          <p className="font-bold text-green-700">Pronóstico enviado definitivamente</p>
          <p className="text-xs text-green-600 mt-0.5">
            {submittedAt
              ? new Date(submittedAt).toLocaleDateString('es-ES', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })
              : ''}
            {' · '}{totalCount} partidos · Ya no es posible modificar
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 space-y-3">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-stone-500 font-medium">Progreso del pronóstico completo</span>
          <span className={`font-bold tabular-nums ${isComplete ? 'text-green-500' : 'text-stone-600'}`}>
            {filledCount} / {totalCount} partidos
          </span>
        </div>
        <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Cutoff countdown */}
      {cutoffTime && !isPastCutoff && (
        <p className="text-xs text-stone-400 flex items-center gap-1.5 flex-wrap">
          <span>⏰ El plazo de envío cierra 1 hora antes del primer partido:</span>
          <CutoffCountdown cutoffTime={cutoffTime} />
        </p>
      )}

      {isPastCutoff && (
        <div className="flex items-center gap-2 text-sm text-red-500 font-medium">
          <span>🔒</span>
          <span>El período de pronósticos ha cerrado — ya no se aceptan envíos.</span>
        </div>
      )}

      {/* Submit button */}
      {!isPastCutoff && (
        <button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3"
        >
          {submitting ? <Spinner size="sm" /> : <span>🏆</span>}
          {isComplete
            ? 'Enviar pronóstico definitivo'
            : `Falta completar ${totalCount - filledCount} partido${totalCount - filledCount !== 1 ? 's' : ''}`}
        </button>
      )}

      {!isComplete && !isPastCutoff && (
        <p className="text-xs text-center text-stone-400">
          Debes rellenar el resultado de <strong>todos</strong> los partidos (grupos + eliminatorias) antes de poder enviar.
        </p>
      )}
    </div>
  )
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────

function ConfirmModal({ onConfirm, onCancel, submitting, totalCount }) {
  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card p-6 max-w-sm w-full space-y-5 shadow-2xl">
        <div className="text-center space-y-2">
          <span className="text-5xl">🏆</span>
          <h3 className="text-xl font-bold text-stone-900">¿Enviar pronóstico?</h3>
          <p className="text-stone-500 text-sm">
            Estás a punto de enviar tus <strong>{totalCount} pronósticos</strong>.
            Una vez enviado <strong>no podrás modificar ningún resultado</strong>.
          </p>
          <p className="text-xs text-stone-400">Esta acción es irreversible.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="btn-secondary flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner size="sm" />}
            Confirmar envío
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────

function MatchCard({ match, prediction, onSave, draft, onDraftChange, onTiebreakerChange, predictedHome, predictedAway, submitted, isPastCutoff }) {
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

  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => { setSaved(false) }, [prediction])

  async function handleSave() {
    if (home === '' || away === '') return
    setSaving(true)
    const effectiveTiebreaker = isKnockout ? tiebreaker : null
    const ok = await onSave(match.id, Number(home), Number(away), effectiveTiebreaker)
    setSaving(false)
    if (ok) setSaved(true)
  }

  const badge = STATUS_BADGE[match.status]

  return (
    <div className={`card p-4 transition-all duration-200 ${
      isFinished ? 'opacity-80' : submitted ? '' : 'hover:border-stone-300 hover:shadow-sm'
    }`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-500">{formatDate(match.match_date)}</span>
          {match.group_name && (
            <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
              Grupo {match.group_name}
            </span>
          )}
          {hasPredictedTeams && !isFinished && (
            <span className="text-xs text-violet-500 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
              🔮 según tus pronósticos
            </span>
          )}
          {match.status === 'scheduled' && !submitted && <Countdown matchDate={match.match_date} />}
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          )}
          {/* Points badge after results come in */}
          {isFinished && prediction && (() => {
            const pts = prediction.points_earned ?? 0
            const cfg = pts === 3 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : pts === 1 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      :             'bg-stone-200 text-stone-500 border-stone-300'
            return (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg}`}>
                {pts === 3 ? '🎯 +3' : pts === 1 ? '✓ +1' : '✗ 0'} pts
              </span>
            )
          })()}
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className={`text-sm font-semibold truncate text-right ${
            isTbd(match.home_team) && predictedHome ? 'text-violet-600' : 'text-stone-900'
          }`}>
            {teamName(displayHome)}
          </span>
          <Flag team={displayHome} />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isFinished ? (
            <div className="flex items-center gap-2 bg-stone-100 rounded-xl px-3 py-1.5">
              <span className="text-xl font-bold text-stone-900">{match.home_score}</span>
              <span className="text-stone-500">-</span>
              <span className="text-xl font-bold text-stone-900">{match.away_score}</span>
            </div>
          ) : match.status === 'live' ? (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5">
              <span className="text-xl font-bold text-red-400">{match.home_score ?? 0}</span>
              <span className="text-red-500/60">-</span>
              <span className="text-xl font-bold text-red-400">{match.away_score ?? 0}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ScoreInput value={home} onChange={setHome} disabled={isLocked} />
              <span className="text-stone-400 font-bold text-sm">-</span>
              <ScoreInput value={away} onChange={setAway} disabled={isLocked} />
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
          <Flag team={displayAway} />
          <span className={`text-sm font-semibold truncate ${
            isTbd(match.away_team) && predictedAway ? 'text-violet-600' : 'text-stone-900'
          }`}>
            {teamName(displayAway)}
          </span>
        </div>
      </div>

      {/* Tiebreaker selector: knockout draw predictions only */}
      {isKnockout && isDraw && !isFinished && (
        <div className="mt-3 pt-3 border-t border-stone-100 flex flex-col items-center gap-2">
          <span className="text-xs text-stone-500 font-medium">¿Quién pasa a la siguiente ronda?</span>
          <div className="flex gap-2">
            <button
              onClick={() => !isLocked && onTiebreakerChange(match.id, 'home')}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                tiebreaker === 'home'
                  ? 'bg-amber-500 border-amber-500 text-stone-950'
                  : 'bg-white border-stone-200 text-stone-600 hover:border-amber-400 hover:text-stone-900'
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
                  ? 'bg-amber-500 border-amber-500 text-stone-950'
                  : 'bg-white border-stone-200 text-stone-600 hover:border-amber-400 hover:text-stone-900'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Flag team={displayAway} />
              <span>{teamName(displayAway)}</span>
            </button>
          </div>
          {!tiebreaker && !isLocked && (
            <span className="text-xs text-amber-600 font-medium">Selecciona quién avanza</span>
          )}
        </div>
      )}

      {/* Footer */}
      {isFinished && prediction && (
        <div className="mt-3 pt-3 border-t border-stone-200 text-center text-xs text-stone-500 space-y-1">
          <div>
            Tu pronóstico:{' '}
            <span className="text-stone-700 font-medium">
              {teamName(displayHome)} {prediction.home_score} – {prediction.away_score} {teamName(displayAway)}
            </span>
          </div>
          {isKnockout && match.home_score === match.away_score && match.winner && (
            <div>
              Avanzó:{' '}
              <span className="font-medium text-stone-600">
                {match.winner === 'home' ? teamName(displayHome) : teamName(displayAway)}
              </span>
              {prediction.tiebreaker && (
                <span className={`ml-1.5 font-medium ${prediction.tiebreaker === match.winner ? 'text-green-600' : 'text-red-500'}`}>
                  {`(pronosticaste ${prediction.tiebreaker === 'home' ? teamName(displayHome) : teamName(displayAway)} `}
                  {prediction.tiebreaker === match.winner ? '✓)' : '✗)'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Submitted lock footer */}
      {submitted && !isFinished && (
        <div className="mt-3 pt-3 border-t border-stone-100 text-center text-xs text-stone-400 space-y-0.5">
          <div className="flex items-center justify-center gap-1">
            <span>🔒</span>
            <span>
              Pronóstico enviado:{' '}
              <span className="font-medium text-stone-600">
                {(home || prediction?.home_score) ?? '?'} – {(away || prediction?.away_score) ?? '?'}
              </span>
            </span>
          </div>
          {isKnockout && tiebreaker && isDraw && (
            <div>
              Avanza:{' '}
              <span className="font-medium text-stone-600">
                {tiebreaker === 'home' ? teamName(displayHome) : teamName(displayAway)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Draft save button (only when not submitted, not locked, not finished) */}
      {!submitted && !isLocked && !isFinished && (
        <div className="mt-3 pt-3 border-t border-stone-200 flex items-center justify-between">
          <span className="text-xs text-stone-400">
            {!prediction && (home === '' || away === '') ? 'Sin resultado' :
             !prediction ? 'Borrador sin guardar' :
             changed     ? 'Cambios sin guardar' :
                           '✓ Borrador guardado'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || home === '' || away === '' || (!changed && !!prediction)}
            className="text-xs text-stone-400 hover:text-amber-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? <Spinner size="sm" /> : saved && !changed ? 'Guardado' : 'Guardar borrador'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── SIDEBAR DE FASES ─────────────────────────────────────────────────────────

function StageSidebar({ stages, activeStage, onSelect, unfilledCount }) {
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
                  isActive  ? 'bg-amber-500 text-stone-950 shadow-sm'
                  : hasData ? 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                  :           'text-stone-300 cursor-default'
                }`}
              >
                <span className="text-base flex-shrink-0 leading-none">{info.icon}</span>
                <span className="opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 flex-1 text-left truncate">
                  {info.short}
                </span>
                {unfilled > 0 && (
                  <span className={`opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    isActive ? 'bg-stone-950/20 text-stone-950' : 'bg-amber-500/20 text-amber-600'
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
  const { activeLeague, leagues, loading: leagueLoading } = useLeague()
  const predictionMode = activeLeague?.prediction_mode ?? 'global'

  const [matches,     setMatches]     = useState([])
  const [predictions, setPredictions] = useState({})
  const [drafts,      setDrafts]      = useState({})
  const [loading,     setLoading]     = useState(true)
  const [activeStage, setActiveStage] = useState('group')
  const [error,       setError]       = useState('')
  const [copying,     setCopying]     = useState(false)

  // Submission state
  const [isSubmitted,  setIsSubmitted]  = useState(false)
  const [submittedAt,  setSubmittedAt]  = useState(null)
  const [cutoffTime,   setCutoffTime]   = useState(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    // Wait until LeagueContext has resolved which league is active before loading
    if (leagueLoading) return

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const predQuery = (predictionMode === 'per_league' && activeLeague)
          ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', activeLeague.id)
          : supabase.from('predictions').select('*').eq('user_id', user.id).is('league_id', null)

        const subQuery = (predictionMode === 'per_league' && activeLeague)
          ? supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).eq('league_id', activeLeague.id).maybeSingle()
          : supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).is('league_id', null).maybeSingle()

        const [
          { data: matchData },
          { data: predData },
          { data: subData },
        ] = await Promise.all([
          sq(supabase.from('matches').select('*').order('match_date')),
          sq(predQuery),
          sq(subQuery),
        ])

        if (cancelled) return

        if (matchData) {
          setMatches(matchData)
          // Cutoff = 1 hour before the first group-stage match
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
        }

        if (subData) {
          setIsSubmitted(true)
          setSubmittedAt(subData.submitted_at)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.id, activeLeague?.id, predictionMode, leagueLoading])

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
      setError('Error al guardar el borrador.')
      return false
    }
    setPredictions(p => ({ ...p, [matchId]: data }))
    setDrafts(d => ({ ...d, [matchId]: { home: String(data.home_score), away: String(data.away_score), tiebreaker: data.tiebreaker ?? null } }))
    return true
  }, [predictions, user.id, activeLeague])

  const handleDraftChange = useCallback((matchId, home, away) => {
    setDrafts(d => ({ ...d, [matchId]: { ...(d[matchId] ?? {}), home, away } }))
  }, [])

  const handleTiebreakerChange = useCallback((matchId, tiebreaker) => {
    setDrafts(d => ({ ...d, [matchId]: { ...(d[matchId] ?? { home: '', away: '' }), tiebreaker } }))
  }, [])

  // ── Copy predictions from another league ────────────────────────────────────
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
        setError('Esa liga no tiene pronósticos guardados todavía.')
        return
      }

      const destLeagueId = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : null
      const rows = sourcePreds.map(p => ({
        user_id:    user.id,
        match_id:   p.match_id,
        home_score: p.home_score,
        away_score: p.away_score,
        tiebreaker: p.tiebreaker ?? null,
        league_id:  destLeagueId,
      }))

      // Delete existing predictions for this context before inserting.
      // Upsert with onConflict doesn't reliably handle partial unique indexes
      // (especially when league_id IS NULL), so delete+insert is safer.
      const deleteQ = destLeagueId
        ? supabase.from('predictions').delete().eq('user_id', user.id).eq('league_id', destLeagueId)
        : supabase.from('predictions').delete().eq('user_id', user.id).is('league_id', null)
      const { error: delErr } = await deleteQ
      if (delErr) throw delErr

      const { data, error: err } = await supabase.from('predictions').insert(rows).select()

      if (err) throw err

      const map = {}
      const newDrafts = {}
      data.forEach(p => {
        map[p.match_id] = p
        newDrafts[p.match_id] = { home: String(p.home_score ?? ''), away: String(p.away_score ?? ''), tiebreaker: p.tiebreaker ?? null }
      })
      setPredictions(map)
      setDrafts(newDrafts)
    } catch {
      setError('Error al copiar los pronósticos.')
    } finally {
      setCopying(false)
    }
  }, [user.id, activeLeague, leagues, predictionMode])

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
          setError('Error guardando algunos pronósticos. Inténtalo de nuevo.')
          return
        }
      }

      // 2. Record the submission (unique per user+league — DB enforces no duplicates)
      const leagueId = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : null
      const { error: err } = await supabase
        .from('prediction_submissions')
        .insert({ user_id: user.id, league_id: leagueId })

      if (err) throw err

      setIsSubmitted(true)
      setSubmittedAt(new Date().toISOString())
      setShowConfirm(false)
    } catch {
      setError('Error al enviar el pronóstico. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }, [matches, drafts, predictions, handleSave, user.id, activeLeague])

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
    const day = new Date(m.match_date).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    ;(acc[day] = acc[day] ?? []).push(m)
    return acc
  }, {})

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
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
        <h2 className="text-2xl font-bold text-stone-900">Mis pronósticos</h2>
        <p className="text-stone-400 text-sm mt-1">
          Rellena <strong>todos los partidos</strong> (grupos + eliminatorias) y envía tu pronóstico completo de una vez.
          Una vez enviado no se puede modificar.
        </p>
      </div>

      {/* Submit panel — always visible */}
      {matches.length > 0 && (
        <SubmitPanel
          filledCount={filledCount}
          totalCount={totalCount}
          cutoffTime={cutoffTime}
          isSubmitted={isSubmitted}
          submittedAt={submittedAt}
          onSubmit={() => setShowConfirm(true)}
          submitting={submitting}
        />
      )}

      {/* Copy from league prompt */}
      {activeLeague && !hasPredictions && !isSubmitted && otherLeagues.length > 0 && (
        <div className="card p-4 border-amber-500/20 bg-amber-500/5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-stone-800">¿Reutilizar borradores de otra liga?</p>
            <p className="text-xs text-stone-500 mt-0.5">
              Aún no tienes borradores en{' '}
              <span className="font-medium text-amber-600">{activeLeague.name}</span>.
              Puedes copiar los de otra liga como punto de partida.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {otherLeagues.map(l => (
              <button
                key={l.id}
                onClick={() => copyFromLeague(l.id)}
                disabled={copying}
                className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
              >
                {copying ? <Spinner size="sm" /> : '📋'}
                Copiar de "{l.name}"
              </button>
            ))}
          </div>
        </div>
      )}

      <UpcomingAlert />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-stone-500">Los partidos se cargarán próximamente.</p>
          <p className="text-stone-400 text-sm mt-1">
            Ejecuta <code className="bg-stone-100 px-1 rounded">npm run seed-matches</code> para importarlos.
          </p>
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
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-100 text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <span>{info.icon}</span>
                    <span>{info.short}</span>
                    {unfilled > 0 && !isSubmitted && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        activeStage === stage ? 'bg-stone-950/20' : 'bg-amber-500/20 text-amber-600'
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
              <h3 className="text-lg font-bold text-stone-800">{STAGE_INFO[activeStage]?.full}</h3>
              <span className="text-sm text-stone-400">
                · {filtered.length} partido{filtered.length !== 1 ? 's' : ''}
              </span>
              {!isSubmitted && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-1 ${
                  unfilledCount(activeStage) === 0
                    ? 'bg-green-100 text-green-600'
                    : 'bg-amber-100 text-amber-600'
                }`}>
                  {unfilledCount(activeStage) === 0
                    ? '✓ Completo'
                    : `${unfilledCount(activeStage)} sin rellenar`}
                </span>
              )}
            </div>

            {/* Match cards by day */}
            {Object.entries(grouped).map(([day, dayMatches]) => (
              <div key={day}>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2 capitalize">{day}</p>
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
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
