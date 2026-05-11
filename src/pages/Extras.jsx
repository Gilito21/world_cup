import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, setMatchCache } from '../lib/matchCache'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import Spinner from '../components/Spinner'

// Candidatos al Pichichi como atajos visuales (el usuario puede escribir libre).
const TOP_SCORER_SUGGESTIONS = [
  { name: 'Kylian Mbappé',     flag: '🇫🇷' },
  { name: 'Lamine Yamal',      flag: '🇪🇸' },
  { name: 'Jude Bellingham',   flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Vinícius Jr',       flag: '🇧🇷' },
  { name: 'Erling Haaland',    flag: '🇳🇴' },
  { name: 'Harry Kane',        flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Cristiano Ronaldo', flag: '🇵🇹' },
  { name: 'Lionel Messi',      flag: '🇦🇷' },
]

// ─── Countdown del cutoff ──────────────────────────────────────────────────
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

// ─── Pregunta tipo "choice" (Mbappé vs Lamine) ─────────────────────────────
function ChoiceQuestion({ question, value, onSelect, locked }) {
  const opts = question.options ?? []

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {opts.map(opt => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => !locked && onSelect(opt.value)}
            disabled={locked}
            className={`relative rounded-xl sm:rounded-2xl border-2 p-3 sm:p-5 text-left transition-all active:scale-[0.98] disabled:active:scale-100 ${
              isActive
                ? 'border-amber-500 bg-amber-50 shadow-md shadow-amber-500/20'
                : 'border-stone-200 bg-white hover:border-stone-300'
            } ${locked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex flex-col items-center gap-1.5 sm:gap-2">
              <span className="text-3xl sm:text-5xl">{opt.emoji}</span>
              <div className="text-center min-w-0 w-full">
                <div className={`font-bold text-sm sm:text-lg truncate ${isActive ? 'text-amber-700' : 'text-stone-800'}`}>
                  {opt.label}
                </div>
                {opt.team && (
                  <div className="text-[11px] sm:text-xs text-stone-500 mt-0.5">{opt.team}</div>
                )}
              </div>
            </div>
            {isActive && (
              <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] sm:text-xs font-bold">
                ✓
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Pregunta tipo "player" (Pichichi) ─────────────────────────────────────
function PlayerQuestion({ value, draft, onDraft, onSave, locked, saving }) {
  const trimmed   = (draft ?? '').trim()
  const isDirty   = trimmed !== (value ?? '')
  const canSubmit = !!trimmed && isDirty && !locked

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft ?? ''}
          onChange={e => onDraft(e.target.value)}
          disabled={locked}
          placeholder="Escribe el nombre del jugador…"
          className="input flex-1"
          maxLength={80}
          enterKeyHint="done"
          onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSave() }}
        />
        <button
          onClick={onSave}
          disabled={!canSubmit}
          className="btn-primary text-sm px-4"
        >
          {saving ? <Spinner size="sm" /> : value && !isDirty ? '✓' : 'Guardar'}
        </button>
      </div>

      {!locked && (
        <div>
          <p className="text-xs text-stone-500 mb-2">Sugerencias:</p>
          <div className="flex flex-wrap gap-1.5">
            {TOP_SCORER_SUGGESTIONS.map(s => {
              const isCurrent = (value ?? '').trim().toLowerCase() === s.name.toLowerCase()
              return (
                <button
                  key={s.name}
                  onClick={() => { onDraft(s.name) }}
                  className={`flex items-center gap-1.5 text-xs sm:text-sm px-2.5 py-1.5 rounded-full border transition-colors ${
                    isCurrent
                      ? 'bg-amber-500 border-amber-500 text-stone-950 font-semibold'
                      : 'bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  <span>{s.flag}</span>
                  <span>{s.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {value && !isDirty && (
        <p className="text-xs text-green-600">Guardado: <strong>{value}</strong></p>
      )}
    </div>
  )
}

// ─── Pregunta tipo "number" (total tarjetas) ───────────────────────────────
function NumberQuestion({ value, draft, onDraft, onSave, locked, saving }) {
  const parsed    = draft === '' || draft == null ? null : parseInt(draft, 10)
  const isValid   = parsed !== null && Number.isFinite(parsed) && parsed >= 0 && parsed <= 9999
  const isDirty   = parsed !== value
  const canSubmit = isValid && isDirty && !locked

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min="0"
          max="9999"
          value={draft ?? ''}
          onChange={e => onDraft(e.target.value.replace(/\D/g, ''))}
          onFocus={e => e.target.select()}
          disabled={locked}
          placeholder="350"
          className="input flex-1 text-center text-2xl font-bold tabular-nums max-w-[180px]"
          enterKeyHint="done"
          onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSave() }}
        />
        <button
          onClick={onSave}
          disabled={!canSubmit}
          className="btn-primary text-sm px-4"
        >
          {saving ? <Spinner size="sm" /> : value != null && !isDirty ? '✓' : 'Guardar'}
        </button>
      </div>

      {!locked && (
        <p className="text-xs text-stone-500 leading-relaxed">
          💡 Referencia: en Qatar 2022 hubo <strong>~227 amarillas y 4 rojas</strong> (≈ 235 puntos).
          Con más partidos en 2026, el rango habitual está entre <strong>300 y 500</strong>.
        </p>
      )}

      {value != null && !isDirty && (
        <p className="text-xs text-green-600">Guardado: <strong className="tabular-nums">{value}</strong></p>
      )}
    </div>
  )
}

// ─── Card de una pregunta ──────────────────────────────────────────────────
function QuestionCard({
  question,
  prediction,
  draft,
  onDraft,
  onSelect,
  onSave,
  locked,
  saving,
}) {
  const value =
    question.kind === 'choice' ? prediction?.answer_choice
    : question.kind === 'player' ? prediction?.answer_player
    : prediction?.answer_number

  return (
    <article className="card p-3 sm:p-5 space-y-3 sm:space-y-4">
      <header className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm sm:text-lg font-bold text-stone-900 leading-tight">
              {question.prompt}
            </h3>
            <span className="text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30 flex-shrink-0">
              +{question.points} pts
            </span>
          </div>
          {question.description && (
            <p className="text-[11px] sm:text-sm text-stone-500 mt-1 leading-relaxed">
              {question.description}
            </p>
          )}
        </div>
      </header>

      {question.kind === 'choice' && (
        <ChoiceQuestion question={question} value={value} onSelect={onSelect} locked={locked} />
      )}
      {question.kind === 'player' && (
        <PlayerQuestion
          value={value}
          draft={draft}
          onDraft={onDraft}
          onSave={onSave}
          locked={locked}
          saving={saving}
        />
      )}
      {question.kind === 'number' && (
        <NumberQuestion
          value={value}
          draft={draft}
          onDraft={onDraft}
          onSave={onSave}
          locked={locked}
          saving={saving}
        />
      )}
    </article>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────
export default function Extras() {
  const { user }                  = useAuth()
  const { activeLeague, loading: leagueLoading } = useLeague()
  const predictionMode = activeLeague?.prediction_mode ?? 'global'
  const leagueIdForPred = predictionMode === 'per_league' ? activeLeague?.id ?? null : null

  const [questions,   setQuestions]   = useState([])
  const [predictions, setPredictions] = useState({})  // keyed by question_key
  const [drafts,      setDrafts]      = useState({})  // free-text drafts
  const [loading,     setLoading]     = useState(true)
  const [savingKey,   setSavingKey]   = useState(null)
  const [cutoffTime,  setCutoffTime]  = useState(null)
  const [error,       setError]       = useState('')

  // ── Fetch all data ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user || leagueLoading) return
    setLoading(true)
    setError('')

    try {
      // Matches: usar el caché si lo hay (Pronosticos ya los habrá cargado).
      const cachedMatches = getMatchCache()
      const matchesPromise = cachedMatches
        ? Promise.resolve({ data: cachedMatches })
        : sq(supabase.from('matches').select('match_date, stage').order('match_date'))

      const qPromise = sq(
        supabase.from('special_questions')
          .select('*')
          .order('display_order')
      )

      const predQuery = leagueIdForPred
        ? supabase.from('special_predictions')
            .select('*')
            .eq('user_id', user.id)
            .eq('league_id', leagueIdForPred)
        : supabase.from('special_predictions')
            .select('*')
            .eq('user_id', user.id)
            .is('league_id', null)
      const pPromise = sq(predQuery)

      const [matchRes, qRes, pRes] = await Promise.all([matchesPromise, qPromise, pPromise])

      if (matchRes?.data?.length) {
        if (!cachedMatches) setMatchCache(matchRes.data)
        const firstGroup = matchRes.data.find(m => m.stage === 'group') ?? matchRes.data[0]
        if (firstGroup) {
          setCutoffTime(new Date(firstGroup.match_date).getTime() - 60 * 60 * 1000)
        }
      }

      if (qRes?.data) setQuestions(qRes.data)

      if (pRes?.data) {
        const map = {}
        const initialDrafts = {}
        pRes.data.forEach(p => {
          map[p.question_key] = p
          if (p.answer_player != null) initialDrafts[p.question_key] = p.answer_player
          if (p.answer_number != null) initialDrafts[p.question_key] = String(p.answer_number)
        })
        setPredictions(map)
        setDrafts(initialDrafts)
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id, leagueIdForPred, leagueLoading])

  useEffect(() => { fetchAll() }, [fetchAll])

  const locked = !!(cutoffTime && Date.now() >= cutoffTime)

  // ── Tick para refrescar el bloqueo cuando llega el cutoff ────────────
  const [, force] = useState(0)
  useEffect(() => {
    if (!cutoffTime || locked) return
    const t = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [cutoffTime, locked])

  // ── Upsert helper ────────────────────────────────────────────────────
  async function upsert(question_key, payload) {
    if (locked) return
    setSavingKey(question_key)
    setError('')

    const existing = predictions[question_key]
    try {
      let result
      if (existing) {
        result = await supabase
          .from('special_predictions')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('special_predictions')
          .insert({
            user_id: user.id,
            league_id: leagueIdForPred,
            question_key,
            answer_choice: null,
            answer_player: null,
            answer_number: null,
            ...payload,
          })
          .select()
          .single()
      }

      if (result.error) throw result.error
      setPredictions(prev => ({ ...prev, [question_key]: result.data }))
    } catch (e) {
      setError(e.message ?? 'No se pudo guardar el pronóstico.')
    } finally {
      setSavingKey(null)
    }
  }

  // ── Handlers por tipo ────────────────────────────────────────────────
  function handleSelectChoice(question_key, value) {
    // Para choice: el guardado es inmediato al tocar.
    if (predictions[question_key]?.answer_choice === value) return
    upsert(question_key, {
      answer_choice: value,
      answer_player: null,
      answer_number: null,
    })
  }

  function handleSaveDraft(question_key, kind) {
    const d = drafts[question_key] ?? ''
    if (kind === 'player') {
      const v = d.trim()
      if (!v) return
      upsert(question_key, {
        answer_choice: null,
        answer_player: v,
        answer_number: null,
      })
    } else if (kind === 'number') {
      const n = parseInt(d, 10)
      if (!Number.isFinite(n) || n < 0) return
      upsert(question_key, {
        answer_choice: null,
        answer_player: null,
        answer_number: n,
      })
    }
  }

  function setDraft(question_key, value) {
    setDrafts(prev => ({ ...prev, [question_key]: value }))
  }

  // ── Resumen de progreso ──────────────────────────────────────────────
  const answeredCount = useMemo(
    () => questions.filter(q => {
      const p = predictions[q.key]
      return p && (p.answer_choice != null || (p.answer_player ?? '').trim() !== '' || p.answer_number != null)
    }).length,
    [questions, predictions]
  )
  const totalPoints = useMemo(
    () => questions.reduce((s, q) => s + q.points, 0),
    [questions]
  )

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
  }

  if (!activeLeague) {
    return (
      <div className="card p-6 sm:p-8 text-center space-y-2">
        <span className="text-3xl sm:text-4xl">🎲</span>
        <h2 className="text-base sm:text-lg font-bold text-stone-900">Únete a una liga primero</h2>
        <p className="text-stone-500 text-xs sm:text-sm">
          Las preguntas extra están vinculadas a tu liga (o al modo global).
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Hero */}
      <section className="card p-3 sm:p-5">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <span className="text-xl sm:text-3xl">🎲</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-stone-900">Preguntas extra</h1>
            <p className="text-[11px] sm:text-sm text-stone-500 mt-0.5">
              Predicciones a largo plazo. Cierran <strong>1h antes del primer partido</strong>.
            </p>
          </div>
        </div>

        {/* Cutoff + progreso */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-stone-500">Cierre:</span>
            {cutoffTime
              ? <CutoffCountdown cutoffTime={cutoffTime} />
              : <span className="text-stone-400">—</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-stone-500">Respondidas:</span>
            <span className="font-semibold tabular-nums text-stone-800">
              {answeredCount} / {questions.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-stone-500">Máx puntos:</span>
            <span className="font-bold text-amber-600">+{totalPoints}</span>
          </div>
        </div>

        {locked && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-stone-100 text-stone-600 text-xs">
            🔒 El plazo ha cerrado. No se pueden modificar las respuestas.
          </div>
        )}
      </section>

      {/* Error */}
      {error && (
        <div className="card p-3 text-sm text-red-600 bg-red-50 border-red-200">
          {error}
        </div>
      )}

      {/* Questions */}
      <div className="space-y-3">
        {questions.map(q => (
          <QuestionCard
            key={q.key}
            question={q}
            prediction={predictions[q.key]}
            draft={drafts[q.key]}
            onDraft={(v)    => setDraft(q.key, v)}
            onSelect={(v)   => handleSelectChoice(q.key, v)}
            onSave={()      => handleSaveDraft(q.key, q.kind)}
            locked={locked || savingKey === q.key}
            saving={savingKey === q.key}
          />
        ))}
      </div>
    </div>
  )
}
