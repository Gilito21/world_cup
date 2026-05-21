import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, setMatchCache } from '../lib/matchCache'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import Spinner from '../components/Spinner'
import { ExtrasSkeleton } from '../components/Skeleton'
import LeagueModal from '../components/LeagueModal'
import PaymentModal from '../components/PaymentModal'
import LeagueCreatedModal from '../components/LeagueCreatedModal'
import { EditorialBand } from '../components/Editorial'

// ── Questions cache (localStorage, 2 h) — static per tournament ───────────
const QS_LS_KEY = 'porra-extras-questions'
const QS_TTL    = 2 * 60 * 60 * 1000
function readCachedQuestions() {
  try {
    const raw = localStorage.getItem(QS_LS_KEY)
    if (!raw) return null
    const { data, at } = JSON.parse(raw)
    return data && Date.now() - at < QS_TTL ? data : null
  } catch { return null }
}
function writeCachedQuestions(qs) {
  try { localStorage.setItem(QS_LS_KEY, JSON.stringify({ data: qs, at: Date.now() })) } catch {}
}

// ── Personalized predictions cache (localStorage, 5 min) ──────────────────
const PREDS_TTL = 5 * 60 * 1000
function predsCacheKey(userId, leagueKey) { return `porra-extras-preds:${userId}:${leagueKey}` }
function readCachedExtrasPreds(userId, leagueKey) {
  try {
    const raw = localStorage.getItem(predsCacheKey(userId, leagueKey))
    if (!raw) return null
    const { data, at } = JSON.parse(raw)
    return data && Date.now() - at < PREDS_TTL ? data : null
  } catch { return null }
}
function writeCachedExtrasPreds(userId, leagueKey, data) {
  try { localStorage.setItem(predsCacheKey(userId, leagueKey), JSON.stringify({ data, at: Date.now() })) } catch {}
}

function cutoffFromMatches(matches) {
  if (!matches?.length) return null
  const first = matches.find(m => m.stage === 'group') ?? matches[0]
  return first ? new Date(first.match_date).getTime() - 60 * 60 * 1000 : null
}

// Twemoji CDN URL for any emoji string (works on all browsers/OS)
function emojiSrc(emoji) {
  const pts = [...emoji].map(c => c.codePointAt(0).toString(16)).join('-')
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${pts}.svg`
}
function EmojiImg({ emoji, alt = '', className = 'w-6 h-6' }) {
  return <img src={emojiSrc(emoji)} alt={alt} className={`inline-block ${className}`} loading="lazy" />
}

// Twemoji CDN URL for a 2-letter ISO country code (works on all browsers/OS)
function flagSrc(cc) {
  const pts = [...cc.toUpperCase()].map(c => (c.codePointAt(0) + 0x1F1A5).toString(16))
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${pts.join('-')}.svg`
}
function FlagImg({ cc, className = 'w-4 h-4' }) {
  return <img src={flagSrc(cc)} alt={cc} className={`inline-block ${className}`} loading="lazy" />
}

// Candidatos al MVP como atajos visuales (el usuario puede escribir libre).
const MVP_SUGGESTIONS = [
  { name: 'Kylian Mbappé',     cc: 'FR' },
  { name: 'Lamine Yamal',      cc: 'ES' },
  { name: 'Jude Bellingham',   cc: 'GB' },
  { name: 'Vinícius Jr',       cc: 'BR' },
  { name: 'Rodri',             cc: 'ES' },
  { name: 'Pedri',             cc: 'ES' },
  { name: 'Lionel Messi',      cc: 'AR' },
  { name: 'Cristiano Ronaldo', cc: 'PT' },
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
  const { t } = useLang()
  const [left, setLeft] = useState(() => getTimeLeft(cutoffTime))
  useEffect(() => {
    const timer = setInterval(() => setLeft(getTimeLeft(cutoffTime)), 1000)
    return () => clearInterval(timer)
  }, [cutoffTime])
  if (!left) return <span className="font-semibold text-red-500">{t('extras.closedLabel')}</span>
  const { days, hours, minutes, seconds } = left
  return (
    <span className="font-mono font-semibold text-ink/80">
      {days > 0 && <>{days}d </>}
      {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}m {String(seconds).padStart(2, '0')}s
    </span>
  )
}

// ─── Panel de envío ────────────────────────────────────────────────────────
function SubmitPanel({ answeredCount, totalCount, cutoffTime, isSubmitted, submittedAt, onSubmit, submitting }) {
  const { t, dateLocale } = useLang()
  const [, force] = useState(0)
  useEffect(() => {
    if (!cutoffTime) return
    const timer = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(timer)
  }, [cutoffTime])

  const isPastCutoff = !!(cutoffTime && Date.now() >= cutoffTime)
  const isComplete   = answeredCount === totalCount && totalCount > 0
  const canSubmit    = isComplete && !isPastCutoff && !isSubmitted
  const pct          = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0

  if (isSubmitted) {
    return (
      <div className="card p-3 sm:p-4 bg-green-50/80 border-green-200 flex items-center gap-3">
        <span className="text-2xl sm:text-3xl flex-shrink-0">✅</span>
        <div className="min-w-0">
          <p className="font-bold text-green-700 text-sm sm:text-base">{t('extras.submitted')}</p>
          <p className="text-[11px] sm:text-xs text-green-600 mt-0.5">
            {submittedAt
              ? new Date(submittedAt).toLocaleDateString(dateLocale, {
                  day: 'numeric', month: 'short',
                  hour: '2-digit', minute: '2-digit',
                })
              : ''}
            {' · '}{t('extras.submittedDesc', { n: totalCount })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-3 sm:p-4 space-y-2.5 sm:space-y-3">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1.5 gap-2">
          <span className="text-ink/60 font-medium">{t('extras.progressLabel')}</span>
          <span className={`font-bold tabular-nums flex-shrink-0 ${isComplete ? 'text-green-500' : 'text-ink/70'}`}>
            {answeredCount} / {totalCount}
          </span>
        </div>
        <div className="h-2.5 bg-paper rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-grass-500' : 'bg-ink/70'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {cutoffTime && !isPastCutoff && (
        <p className="text-xs text-ink/50 flex items-center gap-1.5 flex-wrap">
          <span>{t('extras.cutoffNote')}</span>
          <CutoffCountdown cutoffTime={cutoffTime} />
        </p>
      )}

      {isPastCutoff && (
        <div className="rounded-none bg-red-50 border border-red-200 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
            <span>🔒</span>{t('extras.closedMsg')}
          </p>
          <p className="text-xs text-red-500">
            {answeredCount > 0
              ? t('extras.missedDeadlinePartial', { n: answeredCount, total: totalCount })
              : t('extras.missedDeadline')}
          </p>
        </div>
      )}

      {!isPastCutoff && (
        <button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3"
        >
          {submitting ? <Spinner size="sm" /> : <span>🎲</span>}
          {isComplete
            ? t('extras.submitBtn')
            : t('extras.pendingBtn', { n: totalCount - answeredCount !== 1 ? 'n' : '', count: totalCount - answeredCount, s: totalCount - answeredCount !== 1 ? 's' : '' })}
        </button>
      )}

      {!isComplete && !isPastCutoff && (
        <p className="text-xs text-center text-ink/50">
          {t('extras.allRequired')}
        </p>
      )}
    </div>
  )
}

// ─── Modal de confirmación ─────────────────────────────────────────────────
function ConfirmModal({ onConfirm, onCancel, submitting }) {
  const { t } = useLang()
  return (
    <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-paper rounded-none shadow-xl max-w-sm w-full p-6 space-y-4 animate-slide-up">
        <h3 className="text-xl font-bold text-ink">{t('extras.confirmTitle')}</h3>
        <p className="text-ink/60 text-sm leading-relaxed">
          {t('extras.confirmBody')}
        </p>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 btn-secondary text-sm"
          >
            {t('extras.review')}
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
          >
            {submitting && <Spinner size="sm" />}
            {t('extras.sendFinal')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pregunta tipo "choice" ────────────────────────────────────────────────
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
            className={`relative rounded-none sm:rounded-none border-2 p-3 sm:p-5 text-left transition-all active:scale-[0.98] disabled:active:scale-100 ${
              isActive
                ? 'border-ink bg-paper shadow-md shadow-ink/15'
                : 'border-ink/20 bg-paper hover:border-ink/30'
            } ${locked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex flex-col items-center gap-1.5 sm:gap-2">
              <EmojiImg emoji={opt.emoji} alt={opt.label} className="w-12 h-12 sm:w-20 sm:h-20" />
              <div className="text-center min-w-0 w-full">
                <div className={`font-bold text-sm sm:text-lg truncate ${isActive ? 'text-ink font-bold' : 'text-ink/80'}`}>
                  {opt.label}
                </div>
                {opt.team && (
                  <div className="text-[11px] sm:text-xs text-ink/60 mt-0.5">{opt.team}</div>
                )}
              </div>
            </div>
            {isActive && (
              <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-ink text-cream flex items-center justify-center text-[10px] sm:text-xs font-bold">
                ✓
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Pregunta tipo "player" ────────────────────────────────────────────────
function PlayerQuestion({ value, draft, onDraft, onSave, locked }) {
  const { t } = useLang()
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
          placeholder={t('extras.playerPlaceholder')}
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
          {value && !isDirty ? '✓' : t('extras.saveBtn')}
        </button>
      </div>

      {!locked && (
        <div>
          <p className="text-xs text-ink/60 mb-2">{t('extras.suggestions')}</p>
          <div className="flex flex-wrap gap-1.5">
            {MVP_SUGGESTIONS.map(s => {
              const isCurrent = (value ?? '').trim().toLowerCase() === s.name.toLowerCase()
              return (
                <button
                  key={s.name}
                  onClick={() => { onDraft(s.name) }}
                  className={`flex items-center gap-1.5 text-xs sm:text-sm px-2.5 py-1.5 rounded-full border transition-colors ${
                    isCurrent
                      ? 'bg-ink border-ink text-cream font-semibold'
                      : 'bg-paper border-ink/20 text-ink/80 hover:bg-paper-200'
                  }`}
                >
                  <FlagImg cc={s.cc} />
                  <span>{s.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {value && !isDirty && (
        <p className="text-xs text-green-600">{t('extras.draftSaved', { val: value })}</p>
      )}
    </div>
  )
}

// ─── Pregunta tipo "number" ────────────────────────────────────────────────
function NumberQuestion({ value, draft, onDraft, onSave, locked }) {
  const { t } = useLang()
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
          {value != null && !isDirty ? '✓' : t('extras.saveBtn')}
        </button>
      </div>

      {!locked && (
        <p className="text-xs text-ink/60 leading-relaxed">
          {t('extras.referenceNote')}
        </p>
      )}

      {value != null && !isDirty && (
        <p className="text-xs text-green-600">{t('extras.draftSaved', { val: value })}</p>
      )}
    </div>
  )
}

// ─── Card de una pregunta ──────────────────────────────────────────────────
function QuestionCard({ question, answer, draft, onDraft, onSelect, onSave, locked }) {
  const value =
    question.kind === 'choice' ? answer?.answer_choice
    : question.kind === 'player' ? answer?.answer_player
    : answer?.answer_number

  return (
    <article className="card p-3 sm:p-5 space-y-3 sm:space-y-4">
      <header className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm sm:text-lg font-bold text-ink leading-tight">
              {question.prompt}
            </h3>
            <span className="text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-paper-200 text-ink/80 border border-ink/20 flex-shrink-0">
              +{question.points} pts
            </span>
          </div>
          {question.description && (
            <p className="text-[11px] sm:text-sm text-ink/60 mt-1 leading-relaxed">
              {question.description}
            </p>
          )}
        </div>
      </header>

      {question.kind === 'choice' && (
        <ChoiceQuestion question={question} value={value} onSelect={onSelect} locked={locked} />
      )}
      {question.kind === 'player' && (
        <PlayerQuestion value={value} draft={draft} onDraft={onDraft} onSave={onSave} locked={locked} />
      )}
      {question.kind === 'number' && (
        <NumberQuestion value={value} draft={draft} onDraft={onDraft} onSave={onSave} locked={locked} />
      )}
    </article>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────
export default function Extras() {
  const { user }         = useAuth()
  const { activeLeague, leagues, loading: leagueLoading, onLeagueCreated } = useLeague()
  const { t, dateLocale } = useLang()
  const predictionMode   = activeLeague?.prediction_mode ?? 'global'
  const leagueIdForPred  = predictionMode === 'per_league' ? activeLeague?.id ?? null : null
  const leagueKey        = leagueIdForPred ?? 'global'

  // Serve from cache so the page renders instantly on nav/refresh
  const cachedQsAtMount    = readCachedQuestions()
  const cachedPredsAtMount = user ? readCachedExtrasPreds(user.id, leagueKey) : null

  const [questions,    setQuestions]    = useState(() => cachedQsAtMount ?? [])
  const [answers,      setAnswers]      = useState(() => cachedPredsAtMount?.answers ?? {})
  const [textDrafts,   setTextDrafts]   = useState(() => cachedPredsAtMount?.textDrafts ?? {})
  const [loading,      setLoading]      = useState(() => !(cachedQsAtMount?.length > 0))
  const [cutoffTime,   setCutoffTime]   = useState(() => cutoffFromMatches(getMatchCache()))
  const [isSubmitted,  setIsSubmitted]  = useState(() => cachedPredsAtMount?.isSubmitted ?? false)
  const [submittedAt,  setSubmittedAt]  = useState(() => cachedPredsAtMount?.submittedAt ?? null)
  const [submitting,   setSubmitting]   = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState('')

  // No-league join modal state
  const [showLeagueModal, setShowLeagueModal] = useState(false)
  const [paymentName,     setPaymentName]     = useState(null)
  const [createdLeague,   setCreatedLeague]   = useState(null)

  // ── Fetch all data ──────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!user || leagueLoading) {
      console.log('[porra:extras] fetchAll → skip (user:', !!user, 'leagueLoading:', leagueLoading, ')')
      return
    }
    console.log('[porra:extras] fetchAll START — leagueKey:', leagueKey)
    setError('')

    // Serve from cache immediately (avoids skeleton on nav/refresh)
    const cachedQs    = readCachedQuestions()
    const cachedPreds = readCachedExtrasPreds(user.id, leagueKey)
    if (cachedQs) {
      console.log('[porra:extras] questions cache HIT', cachedQs.length)
      setQuestions(cachedQs)
    } else {
      console.log('[porra:extras] questions cache MISS, waiting for network…')
    }
    if (cachedPreds) {
      console.log('[porra:extras] preds cache HIT')
      setAnswers(cachedPreds.answers)
      setTextDrafts(cachedPreds.textDrafts)
      setIsSubmitted(cachedPreds.isSubmitted)
      setSubmittedAt(cachedPreds.submittedAt)
    } else {
      console.log('[porra:extras] preds cache MISS, waiting for network…')
    }
    setLoading(!(cachedQs?.length > 0))

    const cachedMatches = getMatchCache()
    if (cachedMatches?.length) setCutoffTime(cutoffFromMatches(cachedMatches))

    const t0 = Date.now()
    try {
      const matchesPromise = cachedMatches
        ? Promise.resolve({ data: cachedMatches })
        : sq(supabase.from('matches').select('match_date, stage').order('match_date'))

      const qPromise = cachedQs
        ? Promise.resolve({ data: cachedQs })
        : sq(supabase.from('special_questions').select('*').order('display_order'))

      const predQuery = leagueIdForPred
        ? supabase.from('special_predictions').select('*').eq('user_id', user.id).eq('league_id', leagueIdForPred)
        : supabase.from('special_predictions').select('*').eq('user_id', user.id).is('league_id', null)

      const subQuery = leagueIdForPred
        ? supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).eq('league_id', leagueIdForPred).eq('source', 'extras').maybeSingle()
        : supabase.from('prediction_submissions').select('submitted_at').eq('user_id', user.id).is('league_id', null).eq('source', 'extras').maybeSingle()

      const [matchRes, qRes, pRes, subRes] = await Promise.all([
        matchesPromise, qPromise, sq(predQuery), sq(subQuery),
      ])
      console.log(`[porra:extras] network done in ${Date.now() - t0}ms — qs:${qRes?.data?.length} preds:${pRes?.data?.length} sub:${subRes?.data ? 'yes' : 'no'}`)

      if (matchRes?.data?.length && !cachedMatches) {
        setMatchCache(matchRes.data)
        setCutoffTime(cutoffFromMatches(matchRes.data))
      }

      if (qRes?.data && !cachedQs) {
        setQuestions(qRes.data)
        writeCachedQuestions(qRes.data)
      }

      if (pRes?.data) {
        const answerMap     = {}
        const initialDrafts = {}
        pRes.data.forEach(p => {
          answerMap[p.question_key] = {
            answer_choice: p.answer_choice,
            answer_player: p.answer_player,
            answer_number: p.answer_number,
          }
          if (p.answer_player != null) initialDrafts[p.question_key] = p.answer_player
          if (p.answer_number != null) initialDrafts[p.question_key] = String(p.answer_number)
        })
        const nowSubmitted = !!(subRes?.data)
        setAnswers(answerMap)
        setTextDrafts(initialDrafts)
        setIsSubmitted(nowSubmitted)
        setSubmittedAt(subRes?.data?.submitted_at ?? null)
        writeCachedExtrasPreds(user.id, leagueKey, {
          answers: answerMap,
          textDrafts: initialDrafts,
          isSubmitted: nowSubmitted,
          submittedAt: subRes?.data?.submitted_at ?? null,
        })
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id, leagueIdForPred, leagueLoading])

  useEffect(() => { fetchAll() }, [fetchAll])

  const locked = isSubmitted || !!(cutoffTime && Date.now() >= cutoffTime)

  // ── Handlers de borrador (solo actualizan estado local, sin BD) ─────
  function handleSelectChoice(key, val) {
    if (locked) return
    setAnswers(prev => ({
      ...prev,
      [key]: { answer_choice: val, answer_player: null, answer_number: null },
    }))
  }

  function handleSaveDraft(key, kind) {
    if (locked) return
    const d = textDrafts[key] ?? ''
    if (kind === 'player') {
      const v = d.trim()
      if (!v) return
      setAnswers(prev => ({
        ...prev,
        [key]: { answer_choice: null, answer_player: v, answer_number: null },
      }))
    } else if (kind === 'number') {
      const n = parseInt(d, 10)
      if (!Number.isFinite(n) || n < 0) return
      setAnswers(prev => ({
        ...prev,
        [key]: { answer_choice: null, answer_player: null, answer_number: n },
      }))
    }
  }

  function setTextDraft(key, val) {
    setTextDrafts(prev => ({ ...prev, [key]: val }))
  }

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

  // ── Envío definitivo: escribe todo en BD de una vez ─────────────────
  async function handleSubmit() {
    if (locked || submitting) return
    setSubmitting(true)
    setError('')
    try {
      // Upsert all answers in one atomic call so we never end up in a
      // half-deleted state if the request fails mid-flight. The DB has
      // a UNIQUE (user_id, league_id, question_key) NULLS NOT DISTINCT
      // index so existing rows are updated in place.
      const rows = questions
        .filter(q => answers[q.key])
        .map(q => ({
          user_id:       user.id,
          league_id:     leagueIdForPred,
          question_key:  q.key,
          answer_choice: answers[q.key]?.answer_choice ?? null,
          answer_player: answers[q.key]?.answer_player ?? null,
          answer_number: answers[q.key]?.answer_number ?? null,
          updated_at:    new Date().toISOString(),
        }))

      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from('special_predictions')
          .upsert(rows, { onConflict: 'user_id,league_id,question_key' })
        if (upErr) throw upErr
      }

      // 2. Registrar el envío
      const { error: subErr } = await supabase
        .from('prediction_submissions')
        .insert({ user_id: user.id, league_id: leagueIdForPred, source: 'extras' })
      if (subErr) throw subErr

      const now = new Date().toISOString()
      setIsSubmitted(true)
      setSubmittedAt(now)
      setShowConfirm(false)
      writeCachedExtrasPreds(user.id, leagueKey, {
        answers,
        textDrafts,
        isSubmitted: true,
        submittedAt: now,
      })
    } catch (e) {
      setError(e.message ?? t('extras.errSend'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Progreso ────────────────────────────────────────────────────────
  const answeredCount = useMemo(
    () => questions.filter(q => {
      const a = answers[q.key]
      if (!a) return false
      return a.answer_choice != null
        || (a.answer_player ?? '').trim() !== ''
        || a.answer_number != null
    }).length,
    [questions, answers]
  )

  const totalPoints = useMemo(() => questions.reduce((s, q) => s + q.points, 0), [questions])

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        <ExtrasSkeleton count={4} />
      </div>
    )
  }

  if (!leagueLoading && leagues.length === 0) {
    return (
      <>
        <div className="card p-5 border-ink/20 bg-cream flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-3xl flex-shrink-0">🎲</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-ink text-sm sm:text-base">{t('extras.noLeague')}</p>
            <p className="text-ink/60 text-xs sm:text-sm mt-0.5">{t('extras.noLeagueDesc')}</p>
          </div>
          <button
            onClick={() => setShowLeagueModal(true)}
            className="btn-primary text-sm px-4 py-2 flex-shrink-0 w-full sm:w-auto"
          >
            {t('extras.noLeagueCta')}
          </button>
        </div>
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
      </>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="card p-3 sm:p-5">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <span className="text-xl sm:text-3xl">🎲</span>
          <div className="flex-1 min-w-0">
            <span className="ed-mono text-terracotta text-[10px] block mb-1.5">// {t('extras.chapter')}</span>
            <h1 className="font-display text-xl sm:text-2xl text-ink leading-none">{t('extras.title')}</h1>
            <p className="text-[11px] sm:text-sm text-ink/60 mt-0.5">
              {t('extras.subtitle')}
            </p>
            <EditorialBand items={['BONUS', 'PREGUNTAS EXTRA', 'EDICIÓN 2026']} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-ink/60">{t('extras.deadlineLabel')}</span>
            {cutoffTime
              ? <CutoffCountdown cutoffTime={cutoffTime} />
              : <span className="text-ink/50">—</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ink/60">{t('extras.maxPtsLabel')}</span>
            <span className="font-bold text-ink">+{totalPoints}</span>
          </div>
        </div>
      </section>

      {/* ── Submit panel ──────────────────────────────────────── */}
      <SubmitPanel
        answeredCount={answeredCount}
        totalCount={questions.length}
        cutoffTime={cutoffTime}
        isSubmitted={isSubmitted}
        submittedAt={submittedAt}
        onSubmit={() => setShowConfirm(true)}
        submitting={submitting}
      />

      {/* ── Error ─────────────────────────────────────────────── */}
      {error && (
        <div className="card p-3 text-sm text-red-600 bg-red-50 border-red-200">
          {error}
        </div>
      )}

      {/* ── Questions ─────────────────────────────────────────── */}
      <div className="space-y-3">
        {questions.map(q => (
          <QuestionCard
            key={q.key}
            question={q}
            answer={answers[q.key]}
            draft={textDrafts[q.key]}
            onDraft={v   => setTextDraft(q.key, v)}
            onSelect={v  => handleSelectChoice(q.key, v)}
            onSave={() => handleSaveDraft(q.key, q.kind)}
            locked={locked}
          />
        ))}
      </div>

      {/* ── Confirm modal ─────────────────────────────────────── */}
      {showConfirm && (
        <ConfirmModal
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}
    </div>
  )
}
