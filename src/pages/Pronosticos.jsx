import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import Spinner from '../components/Spinner'
import UpcomingAlert from '../components/UpcomingAlert'
import { Flag, teamName } from '../utils/teams'

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

const LOCK_MS = 30 * 60 * 1000

function getTimeLeft(dateStr) {
  const diff = new Date(dateStr) - Date.now()
  if (diff <= 0) return null
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000)  / 60000),
    seconds: Math.floor((diff % 60000)    / 1000),
  }
}

function Countdown({ matchDate }) {
  const [left, setLeft] = useState(() => getTimeLeft(matchDate))
  useEffect(() => {
    const t = setInterval(() => setLeft(getTimeLeft(matchDate)), 1000)
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

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

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

function MatchCard({ match, prediction, onSave, draft, onDraftChange }) {
  const isLocked   = match.status !== 'scheduled' || Date.now() >= new Date(match.match_date).getTime() - LOCK_MS
  const isFinished = match.status === 'finished'

  const home = draft?.home ?? ''
  const away = draft?.away ?? ''
  const setHome = (val) => onDraftChange(match.id, val, away)
  const setAway = (val) => onDraftChange(match.id, home, val)

  const changed = home !== '' && away !== '' && (
    !prediction ||
    Number(home) !== prediction.home_score ||
    Number(away) !== prediction.away_score
  )

  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => { setSaved(false) }, [prediction])

  async function handleSave() {
    if (home === '' || away === '') return
    setSaving(true)
    const ok = await onSave(match.id, Number(home), Number(away))
    setSaving(false)
    if (ok) setSaved(true)
  }

  function PointsBadge() {
    if (!isFinished || !prediction) return null
    const pts = prediction.points_earned ?? 0
    const cfg = pts === 3
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : pts === 1
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      : 'bg-stone-200 text-stone-500 border-stone-300'
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg}`}>
        {pts === 3 ? '🎯 +3' : pts === 1 ? '✓ +1' : '✗ 0'} pts
      </span>
    )
  }

  const badge = STATUS_BADGE[match.status]

  return (
    <div className={`card p-4 transition-all duration-200 ${isFinished ? 'opacity-80' : 'hover:border-stone-300 hover:shadow-sm'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-500">{formatDate(match.match_date)}</span>
          {match.group_name && (
            <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
              Grupo {match.group_name}
            </span>
          )}
          {match.status === 'scheduled' && <Countdown matchDate={match.match_date} />}
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          )}
          <PointsBadge />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="text-sm font-semibold text-stone-900 truncate text-right">{teamName(match.home_team)}</span>
          <Flag team={match.home_team} />
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
          <Flag team={match.away_team} />
          <span className="text-sm font-semibold text-stone-900 truncate">{teamName(match.away_team)}</span>
        </div>
      </div>

      {isFinished && prediction && (
        <div className="mt-3 pt-3 border-t border-stone-200 text-center text-xs text-stone-500">
          Tu pronóstico:{' '}
          <span className="text-stone-700 font-medium">
            {teamName(match.home_team)} {prediction.home_score} - {prediction.away_score} {teamName(match.away_team)}
          </span>
        </div>
      )}

      {!isLocked && !isFinished && (
        <div className="mt-3 pt-3 border-t border-stone-200 flex items-center justify-between">
          <span className="text-xs text-stone-500">
            {!prediction ? 'Sin pronóstico' : changed ? 'Cambios sin guardar' : 'Guardado'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || home === '' || away === '' || (!changed && !!prediction)}
            className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
          >
            {saving && <Spinner size="sm" />}
            {saved && !changed ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      )}

      {isLocked && !isFinished && (
        <div className="mt-3 pt-3 border-t border-stone-200 text-center text-xs text-stone-500">
          🔒 Pronósticos cerrados · cierre 30 min antes del partido
        </div>
      )}
    </div>
  )
}

// ─── Sidebar de fases ─────────────────────────────────────────────────────────
function StageSidebar({ stages, activeStage, onSelect, pendingCount }) {
  return (
    <aside className="hidden md:block flex-shrink-0">
      <nav className="sticky top-24 group/nav w-11 hover:w-48 transition-all duration-200 overflow-hidden">
        <div className="space-y-0.5 py-1 pr-1">
          {STAGE_ORDER.map(stage => {
            const info    = STAGE_INFO[stage]
            const hasData = stages.includes(stage)
            const pending = pendingCount(stage)
            const isActive = activeStage === stage

            return (
              <button
                key={stage}
                onClick={() => hasData && onSelect(stage)}
                title={info.full}
                disabled={!hasData}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : hasData
                    ? 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                    : 'text-stone-300 cursor-default'
                }`}
              >
                <span className="text-base flex-shrink-0 leading-none">{info.icon}</span>
                <span className="opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 flex-1 text-left truncate">
                  {info.short}
                </span>
                {pending > 0 && (
                  <span className={`opacity-0 group-hover/nav:opacity-100 transition-opacity duration-150 text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    isActive ? 'bg-stone-950/20 text-stone-950' : 'bg-amber-500/20 text-amber-600'
                  }`}>
                    {pending}
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

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Pronosticos() {
  const { user }                          = useAuth()
  const { activeLeague, leagues }         = useLeague()

  const [matches, setMatches]         = useState([])
  const [predictions, setPredictions] = useState({})
  const [drafts, setDrafts]           = useState({})
  const [loading, setLoading]         = useState(true)
  const [savingAll, setSavingAll]     = useState(false)
  const [copying, setCopying]         = useState(false)
  const [activeStage, setActiveStage] = useState('group')
  const [error, setError]             = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const matchQuery = supabase.from('matches').select('*').order('match_date')
        const predQuery = activeLeague
          ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', activeLeague.id)
          : supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', 'none')

        const [{ data: matchData }, { data: predData }] = await Promise.all([matchQuery, predQuery])

        if (cancelled) return

        if (matchData) {
          setMatches(matchData)
          const available = [...new Set(matchData.map(m => m.stage))]
          setActiveStage(prev => available.includes(prev) ? prev : (STAGE_ORDER.find(s => available.includes(s)) ?? available[0]))
        }
        if (predData) {
          const map = {}
          const initialDrafts = {}
          predData.forEach(p => {
            map[p.match_id] = p
            initialDrafts[p.match_id] = { home: String(p.home_score ?? ''), away: String(p.away_score ?? '') }
          })
          setPredictions(map)
          setDrafts(initialDrafts)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.id, activeLeague?.id])

  const handleSave = useCallback(async (matchId, home, away) => {
    setError('')
    const existing = predictions[matchId]
    const leagueId = activeLeague?.id ?? null
    const payload  = { user_id: user.id, match_id: matchId, home_score: home, away_score: away, league_id: leagueId }

    const { data, error: err } = existing
      ? await supabase.from('predictions').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('predictions').insert(payload).select().single()

    if (err) {
      const msg = err.message?.includes('empieza en menos') || err.message?.includes('comenzado') || err.message?.includes('finalizado')
        ? '🔒 Los pronósticos cierran 30 min antes del partido.'
        : 'Error al guardar el pronóstico.'
      setError(msg)
      return false
    }
    setPredictions(p => ({ ...p, [matchId]: data }))
    setDrafts(d => ({ ...d, [matchId]: { home: String(data.home_score), away: String(data.away_score) } }))
    return true
  }, [predictions, user.id, activeLeague])

  const handleDraftChange = useCallback((matchId, home, away) => {
    setDrafts(d => ({ ...d, [matchId]: { home, away } }))
  }, [])

  const handleSaveAll = useCallback(async () => {
    setSavingAll(true)
    setError('')
    const toSave = matches.filter(m => {
      if (m.status !== 'scheduled') return false
      if (Date.now() >= new Date(m.match_date).getTime() - LOCK_MS) return false
      const d = drafts[m.id]
      if (!d || d.home === '' || d.away === '') return false
      const pred = predictions[m.id]
      if (!pred) return true
      return Number(d.home) !== pred.home_score || Number(d.away) !== pred.away_score
    })
    await Promise.all(toSave.map(m => handleSave(m.id, Number(drafts[m.id].home), Number(drafts[m.id].away))))
    setSavingAll(false)
  }, [matches, drafts, predictions, handleSave])

  const copyFromLeague = useCallback(async (sourceLeagueId) => {
    setCopying(true)
    setError('')
    try {
      const { data: sourcePreds } = await supabase
        .from('predictions')
        .select('match_id, home_score, away_score')
        .eq('user_id', user.id)
        .eq('league_id', sourceLeagueId)

      if (!sourcePreds?.length) {
        setError('Esa liga no tiene pronósticos guardados todavía.')
        return
      }

      const rows = sourcePreds.map(p => ({
        user_id:    user.id,
        match_id:   p.match_id,
        home_score: p.home_score,
        away_score: p.away_score,
        league_id:  activeLeague.id,
      }))

      const { data, error: err } = await supabase
        .from('predictions')
        .upsert(rows, { onConflict: 'user_id,match_id,league_id' })
        .select()

      if (err) throw err

      const map = {}
      const newDrafts = {}
      data.forEach(p => {
        map[p.match_id] = p
        newDrafts[p.match_id] = { home: String(p.home_score ?? ''), away: String(p.away_score ?? '') }
      })
      setPredictions(map)
      setDrafts(newDrafts)
    } catch {
      setError('Error al copiar los pronósticos.')
    } finally {
      setCopying(false)
    }
  }, [user.id, activeLeague])

  const otherLeagues = leagues.filter(l => l.id !== activeLeague?.id)
  const hasPredictions = Object.keys(predictions).length > 0

  const stages = [...new Set(matches.map(m => m.stage))]

  const pendingCount = (stage) =>
    matches.filter(
      m => m.stage === stage &&
           !predictions[m.id] &&
           m.status === 'scheduled' &&
           Date.now() < new Date(m.match_date).getTime() - LOCK_MS
    ).length

  const saveableCount = matches.filter(m => {
    if (m.status !== 'scheduled') return false
    if (Date.now() >= new Date(m.match_date).getTime() - LOCK_MS) return false
    const d = drafts[m.id]
    if (!d || d.home === '' || d.away === '') return false
    const pred = predictions[m.id]
    if (!pred) return true
    return Number(d.home) !== pred.home_score || Number(d.away) !== pred.away_score
  }).length

  const filtered = matches.filter(m => m.stage === activeStage)
  const grouped  = filtered.reduce((acc, m) => {
    const day = new Date(m.match_date).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    ;(acc[day] = acc[day] ?? []).push(m)
    return acc
  }, {})

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Mis pronósticos</h2>
        <p className="text-stone-400 text-sm mt-1">
          Predice el marcador · Exacto = 3 pts · Resultado correcto = 1 pt · Cierre 30 min antes
        </p>
      </div>

      {activeLeague && !hasPredictions && otherLeagues.length > 0 && (
        <div className="card p-4 border-amber-500/20 bg-amber-500/5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-stone-800">¿Reutilizar pronósticos de otra liga?</p>
            <p className="text-xs text-stone-500 mt-0.5">
              Aún no tienes pronósticos en <span className="font-medium text-amber-600">{activeLeague.name}</span>.
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
          {/* Sidebar de fases — desktop */}
          <StageSidebar
            stages={stages}
            activeStage={activeStage}
            onSelect={setActiveStage}
            pendingCount={pendingCount}
          />

          <div className="flex-1 min-w-0 space-y-4">
            {/* Tabs de fase — mobile */}
            <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {STAGE_ORDER.filter(s => stages.includes(s)).map(stage => {
                const info    = STAGE_INFO[stage]
                const pending = pendingCount(stage)
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
                    {pending > 0 && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        activeStage === stage ? 'bg-stone-950/20' : 'bg-amber-500/20 text-amber-600'
                      }`}>
                        {pending}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Cabecera de fase activa */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{STAGE_INFO[activeStage]?.icon}</span>
                <h3 className="text-lg font-bold text-stone-800">{STAGE_INFO[activeStage]?.full}</h3>
                <span className="text-sm text-stone-400">· {filtered.length} partido{filtered.length !== 1 ? 's' : ''}</span>
              </div>
              {saveableCount > 0 && (
                <button
                  onClick={handleSaveAll}
                  disabled={savingAll}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-2 flex-shrink-0"
                >
                  {savingAll ? <Spinner size="sm" /> : '💾'}
                  Guardar todo ({saveableCount})
                </button>
              )}
            </div>

            {/* Partidos por fecha */}
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
