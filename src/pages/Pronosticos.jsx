import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import Spinner from '../components/Spinner'
import UpcomingAlert from '../components/UpcomingAlert'

const STAGES = {
  group:         'Fase de grupos',
  round_of_32:  'Ronda de 32',
  round_of_16:  'Octavos de final',
  quarter_final: 'Cuartos de final',
  semi_final:    'Semifinales',
  third_place:   'Tercer puesto',
  final:         'Gran Final',
}

const STATUS_BADGE = {
  scheduled: null,
  live:     { label: 'EN VIVO',    cls: 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' },
  finished: { label: 'Finalizado', cls: 'bg-stone-200 text-stone-500 border-stone-300' },
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
      className="w-12 h-12 text-center text-xl font-bold bg-stone-100 border border-stone-400 rounded-xl text-stone-900
                 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500
                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    />
  )
}

function MatchCard({ match, prediction, onSave }) {
  const isLocked   = match.status !== 'scheduled' || new Date(match.match_date) <= new Date()
  const isFinished = match.status === 'finished'

  const [home, setHome]       = useState(prediction?.home_score ?? '')
  const [away, setAway]       = useState(prediction?.away_score ?? '')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    setHome(prediction?.home_score ?? '')
    setAway(prediction?.away_score ?? '')
    setChanged(false)
    setSaved(false)
  }, [prediction])

  function handleChange(setter) {
    return (val) => { setter(val); setChanged(true); setSaved(false) }
  }

  async function handleSave() {
    if (home === '' || away === '') return
    setSaving(true)
    const ok = await onSave(match.id, Number(home), Number(away))
    setSaving(false)
    if (ok) { setSaved(true); setChanged(false) }
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
    <div className={`card p-4 transition-all duration-200 ${isFinished ? 'opacity-80' : 'hover:border-stone-300'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-500">{formatDate(match.match_date)}</span>
          {match.group_name && (
            <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
              Grupo {match.group_name}
            </span>
          )}
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
          <span className="text-sm font-semibold text-stone-900 truncate text-right">{match.home_team}</span>
          <span className="text-xl flex-shrink-0">{match.home_flag}</span>
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
              <ScoreInput value={home} onChange={handleChange(setHome)} disabled={isLocked} />
              <span className="text-stone-600 font-bold text-sm">-</span>
              <ScoreInput value={away} onChange={handleChange(setAway)} disabled={isLocked} />
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
          <span className="text-xl flex-shrink-0">{match.away_flag}</span>
          <span className="text-sm font-semibold text-stone-900 truncate">{match.away_team}</span>
        </div>
      </div>

      {isFinished && prediction && (
        <div className="mt-3 pt-3 border-t border-stone-200 text-center text-xs text-stone-500">
          Tu pronóstico:{' '}
          <span className="text-stone-700 font-medium">
            {match.home_team.split(' ').pop()} {prediction.home_score} - {prediction.away_score} {match.away_team.split(' ').pop()}
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
          🔒 Pronósticos cerrados
        </div>
      )}
    </div>
  )
}

// ─── Banner de modo de pronósticos ────────────────────────────────────────────
function ModeBanner({ activeLeague, predictionMode, onToggle, toggling }) {
  if (!activeLeague) return null

  return (
    <div className="card p-3 flex flex-col sm:flex-row sm:items-center gap-3 border-stone-300">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800">Modo de pronósticos</p>
        <p className="text-xs text-stone-500 mt-0.5">
          {predictionMode === 'global'
            ? 'Usas los mismos pronósticos en todas tus ligas.'
            : `Pronósticos independientes para "${activeLeague.name}".`}
        </p>
      </div>

      <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 flex-shrink-0">
        <button
          onClick={() => predictionMode !== 'global' && onToggle('global')}
          disabled={toggling}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            predictionMode === 'global'
              ? 'bg-stone-300 text-stone-900 shadow-sm'
              : 'text-stone-400 hover:text-stone-800'
          }`}
        >
          <span>🌐</span>
          <span>Global</span>
        </button>
        <button
          onClick={() => predictionMode !== 'per_league' && onToggle('per_league')}
          disabled={toggling}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            predictionMode === 'per_league'
              ? 'bg-amber-500 text-stone-950 shadow-sm'
              : 'text-stone-400 hover:text-stone-800'
          }`}
        >
          {toggling && predictionMode === 'global' ? <Spinner size="sm" /> : <span>🏆</span>}
          <span className="truncate max-w-[120px]">{activeLeague.name}</span>
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Pronosticos() {
  const { user }                                        = useAuth()
  const { activeLeague, setPredictionMode }            = useLeague()
  const predictionMode = activeLeague?.prediction_mode ?? 'global'

  const [matches, setMatches]         = useState([])
  const [predictions, setPredictions] = useState({})
  const [loading, setLoading]         = useState(true)
  const [toggling, setToggling]       = useState(false)
  const [activeStage, setActiveStage] = useState('group')
  const [error, setError]             = useState('')

  // Recargar predicciones cuando cambia el modo o la liga activa
  useEffect(() => {
    loadData()
  }, [user, activeLeague?.id, predictionMode])

  async function loadData() {
    setLoading(true)

    // Partidos: siempre los mismos
    const matchQuery = supabase.from('matches').select('*').order('match_date')

    // Predicciones: dependen del modo
    const predQuery = predictionMode === 'per_league' && activeLeague
      ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', activeLeague.id)
      : supabase.from('predictions').select('*').eq('user_id', user.id).is('league_id', null)

    const [{ data: matchData }, { data: predData }] = await Promise.all([matchQuery, predQuery])

    if (matchData) setMatches(matchData)
    if (predData) {
      const map = {}
      predData.forEach(p => { map[p.match_id] = p })
      setPredictions(map)
    }
    setLoading(false)
  }

  const handleSave = useCallback(async (matchId, home, away) => {
    setError('')
    const existing = predictions[matchId]
    const leagueId = predictionMode === 'per_league' && activeLeague ? activeLeague.id : null
    const payload  = { user_id: user.id, match_id: matchId, home_score: home, away_score: away, league_id: leagueId }

    const { data, error: err } = existing
      ? await supabase.from('predictions').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('predictions').insert(payload).select().single()

    if (err) {
      const msg = err.message?.includes('partido ya ha comenzado') || err.message?.includes('comenzado o finalizado')
        ? '🔒 El partido ya ha empezado. No se pueden cambiar los pronósticos.'
        : 'Error al guardar el pronóstico.'
      setError(msg)
      return false
    }
    setPredictions(p => ({ ...p, [matchId]: data }))
    return true
  }, [predictions, user.id, predictionMode, activeLeague])

  async function handleToggleMode(newMode) {
    setToggling(true)
    try {
      await setPredictionMode(newMode)
      // loadData se lanzará solo por el useEffect al cambiar predictionMode
    } catch (err) {
      setError('Error al cambiar el modo.')
    } finally {
      setToggling(false)
    }
  }

  const stages   = [...new Set(matches.map(m => m.stage))]
  const filtered = matches.filter(m => m.stage === activeStage)

  const grouped = filtered.reduce((acc, m) => {
    const day = new Date(m.match_date).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    ;(acc[day] = acc[day] ?? []).push(m)
    return acc
  }, {})

  const pendingCount = (stage) =>
    matches.filter(
      m => m.stage === stage &&
           !predictions[m.id] &&
           m.status === 'scheduled' &&
           new Date(m.match_date) > new Date()
    ).length

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Mis pronósticos</h2>
        <p className="text-stone-400 text-sm mt-1">
          Predice el marcador antes de que empiece cada partido · Exacto = 3 pts · Resultado = 1 pt
        </p>
      </div>

      {/* Toggle de modo */}
      <ModeBanner
        activeLeague={activeLeague}
        predictionMode={predictionMode}
        onToggle={handleToggleMode}
        toggling={toggling}
      />

      {/* Alerta de partidos próximos sin pronosticar */}
      <UpcomingAlert predictionMode={predictionMode} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-stone-400">Los partidos se cargarán próximamente.</p>
          <p className="text-stone-600 text-sm mt-1">
            Ejecuta <code className="bg-stone-100 px-1 rounded">npm run seed-matches</code> para importarlos.
          </p>
        </div>
      ) : (
        <>
          {/* Tabs de fase */}
          <div className="flex gap-1 flex-wrap">
            {stages.map(stage => {
              const pending = pendingCount(stage)
              return (
                <button
                  key={stage}
                  onClick={() => setActiveStage(stage)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
                    activeStage === stage
                      ? 'bg-amber-500 text-stone-950'
                      : 'bg-stone-100 text-stone-400 hover:text-stone-900 hover:bg-stone-200'
                  }`}
                >
                  {STAGES[stage] ?? stage}
                  {pending > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      activeStage === stage ? 'bg-stone-950/20' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {pending}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Partidos por fecha */}
          {Object.entries(grouped).map(([day, dayMatches]) => (
            <div key={day}>
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3 capitalize">{day}</h3>
              <div className="space-y-3">
                {dayMatches.map(m => (
                  <MatchCard
                    key={`${m.id}-${predictionMode}-${activeLeague?.id ?? 'global'}`}
                    match={m}
                    prediction={predictions[m.id]}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
