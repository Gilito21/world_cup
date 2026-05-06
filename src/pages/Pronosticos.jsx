import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

const STAGES = {
  group:          'Fase de grupos',
  round_of_32:   'Ronda de 32',
  round_of_16:   'Octavos de final',
  quarter_final:  'Cuartos de final',
  semi_final:     'Semifinales',
  third_place:    'Tercer puesto',
  final:          'Gran Final',
}

const STATUS_BADGE = {
  scheduled: null,
  live:      { label: 'EN VIVO',    cls: 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' },
  finished:  { label: 'Finalizado', cls: 'bg-stone-700/50 text-stone-400 border-stone-600' },
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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
      className="w-12 h-12 text-center text-xl font-bold bg-stone-800 border border-stone-600 rounded-xl text-stone-100
                 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500
                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    />
  )
}

function MatchCard({ match, prediction, onSave }) {
  const isLocked   = match.status !== 'scheduled' || new Date(match.match_date) <= new Date()
  const isFinished = match.status === 'finished'

  const [home, setHome] = useState(prediction?.home_score ?? '')
  const [away, setAway] = useState(prediction?.away_score ?? '')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    setHome(prediction?.home_score ?? '')
    setAway(prediction?.away_score ?? '')
    setChanged(false)
  }, [prediction])

  function handleChange(setter) {
    return (val) => {
      setter(val)
      setChanged(true)
      setSaved(false)
    }
  }

  async function handleSave() {
    if (home === '' || away === '') return
    setSaving(true)
    const ok = await onSave(match.id, Number(home), Number(away))
    setSaving(false)
    if (ok) { setSaved(true); setChanged(false) }
  }

  // Points badge for finished matches
  function PointsBadge() {
    if (!isFinished || !prediction) return null
    const pts = prediction.points_earned ?? 0
    const cfg = pts === 3
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : pts === 1
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      : 'bg-stone-700/50 text-stone-500 border-stone-600'
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg}`}>
        {pts === 3 ? '🎯 +3' : pts === 1 ? '✓ +1' : '✗ 0'} pts
      </span>
    )
  }

  const badge = STATUS_BADGE[match.status]

  return (
    <div className={`card p-4 transition-all duration-200 ${isFinished ? 'opacity-80' : 'hover:border-stone-700'}`}>
      {/* Header: fecha + grupo + badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-500">{formatDate(match.match_date)}</span>
          {match.group_name && (
            <span className="text-xs text-stone-600 bg-stone-800 px-1.5 py-0.5 rounded">
              Grupo {match.group_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          <PointsBadge />
        </div>
      </div>

      {/* Match row */}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="text-sm font-semibold text-stone-100 truncate text-right">{match.home_team}</span>
          <span className="text-xl flex-shrink-0">{match.home_flag}</span>
        </div>

        {/* Scores area */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isFinished ? (
            // Real score
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-2 bg-stone-800 rounded-xl px-3 py-1.5">
                <span className="text-xl font-bold text-stone-100">{match.home_score}</span>
                <span className="text-stone-500">-</span>
                <span className="text-xl font-bold text-stone-100">{match.away_score}</span>
              </div>
            </div>
          ) : match.status === 'live' ? (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5">
              <span className="text-xl font-bold text-red-400">{match.home_score ?? 0}</span>
              <span className="text-red-500/60">-</span>
              <span className="text-xl font-bold text-red-400">{match.away_score ?? 0}</span>
            </div>
          ) : (
            // Prediction inputs
            <div className="flex items-center gap-2">
              <ScoreInput value={home} onChange={handleChange(setHome)} disabled={isLocked} />
              <span className="text-stone-600 font-bold text-sm">-</span>
              <ScoreInput value={away} onChange={handleChange(setAway)} disabled={isLocked} />
            </div>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
          <span className="text-xl flex-shrink-0">{match.away_flag}</span>
          <span className="text-sm font-semibold text-stone-100 truncate">{match.away_team}</span>
        </div>
      </div>

      {/* Prediction vs real (finished + has prediction) */}
      {isFinished && prediction && (
        <div className="mt-3 pt-3 border-t border-stone-800 text-center text-xs text-stone-500">
          Tu pronóstico:{' '}
          <span className="text-stone-300 font-medium">
            {match.home_team.split(' ').pop()} {prediction.home_score} - {prediction.away_score} {match.away_team.split(' ').pop()}
          </span>
        </div>
      )}

      {/* Save button (upcoming + unlocked) */}
      {!isLocked && !isFinished && (
        <div className="mt-3 pt-3 border-t border-stone-800 flex items-center justify-between">
          {prediction && !changed ? (
            <span className="text-xs text-stone-500">Pronóstico guardado</span>
          ) : (
            <span className="text-xs text-stone-500">
              {!prediction ? 'Sin pronóstico' : 'Cambios sin guardar'}
            </span>
          )}
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
        <div className="mt-3 pt-3 border-t border-stone-800 text-center text-xs text-stone-500">
          🔒 Pronósticos cerrados para este partido
        </div>
      )}
    </div>
  )
}

export default function Pronosticos() {
  const { user } = useAuth()
  const [matches, setMatches]         = useState([])
  const [predictions, setPredictions] = useState({})
  const [loading, setLoading]         = useState(true)
  const [activeStage, setActiveStage] = useState('group')
  const [error, setError]             = useState('')

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    setLoading(true)
    const [{ data: matchData }, { data: predData }] = await Promise.all([
      supabase.from('matches').select('*').order('match_date'),
      supabase.from('predictions').select('*').eq('user_id', user.id),
    ])

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
    const payload  = { user_id: user.id, match_id: matchId, home_score: home, away_score: away }

    const { data, error: err } = existing
      ? await supabase.from('predictions').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('predictions').insert(payload).select().single()

    if (err) { setError('Error al guardar el pronóstico.'); return false }

    setPredictions(p => ({ ...p, [matchId]: data }))
    return true
  }, [predictions, user.id])

  const stages = [...new Set(matches.map(m => m.stage))]
  const filtered = matches.filter(m => m.stage === activeStage)

  // Group by date
  const grouped = filtered.reduce((acc, m) => {
    const day = new Date(m.match_date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    ;(acc[day] = acc[day] ?? []).push(m)
    return acc
  }, {})

  const hasPrediction = (id) => predictions[id] !== undefined

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-100">Mis pronósticos</h2>
        <p className="text-stone-400 text-sm mt-1">
          Predice el marcador antes de que empiece cada partido. Exacto = 3pts · Resultado correcto = 1pt
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-stone-400">Los partidos se cargarán próximamente.</p>
          <p className="text-stone-600 text-sm mt-1">Ejecuta el script <code className="bg-stone-800 px-1 rounded">npm run seed-matches</code> para importarlos.</p>
        </div>
      ) : (
        <>
          {/* Stage tabs */}
          <div className="flex gap-1 flex-wrap">
            {stages.map(stage => {
              const count = matches.filter(m => m.stage === stage && !hasPrediction(m.id) && m.status === 'scheduled' && new Date(m.match_date) > new Date()).length
              return (
                <button
                  key={stage}
                  onClick={() => setActiveStage(stage)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 flex items-center gap-1.5 ${
                    activeStage === stage
                      ? 'bg-amber-500 text-stone-950'
                      : 'bg-stone-800 text-stone-400 hover:text-stone-100 hover:bg-stone-700'
                  }`}
                >
                  {STAGES[stage] ?? stage}
                  {count > 0 && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeStage === stage ? 'bg-stone-950/20' : 'bg-amber-500/20 text-amber-400'}`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Match cards grouped by date */}
          {Object.entries(grouped).map(([day, dayMatches]) => (
            <div key={day}>
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3 capitalize">{day}</h3>
              <div className="space-y-3">
                {dayMatches.map(m => (
                  <MatchCard
                    key={m.id}
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
