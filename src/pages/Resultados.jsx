import { useEffect, useState } from 'react'
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

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function getWinner(home, away) {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function PredictionResult({ prediction, match }) {
  if (!prediction) {
    return <span className="text-stone-600 text-xs italic">Sin pronóstico</span>
  }

  const pts = prediction.points_earned ?? 0
  const predWinner = getWinner(prediction.home_score, prediction.away_score)
  const realWinner = getWinner(match.home_score, match.away_score)
  const exact      = prediction.home_score === match.home_score && prediction.away_score === match.away_score

  return (
    <div className="flex items-center gap-2">
      <span className="text-stone-400 text-sm">
        {prediction.home_score} - {prediction.away_score}
      </span>
      {exact ? (
        <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
          🎯 +3
        </span>
      ) : predWinner === realWinner ? (
        <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
          ✓ +1
        </span>
      ) : (
        <span className="text-xs font-bold text-stone-500 bg-stone-800 border border-stone-700 px-2 py-0.5 rounded-full">
          ✗ 0
        </span>
      )}
    </div>
  )
}

function FinishedMatchCard({ match, prediction }) {
  const winner = getWinner(match.home_score, match.away_score)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 capitalize">{formatDate(match.match_date)}</span>
          {match.group_name && (
            <span className="text-xs text-stone-600 bg-stone-800 px-1.5 py-0.5 rounded">
              Grupo {match.group_name}
            </span>
          )}
        </div>
        <span className="text-xs text-stone-600 bg-stone-800 px-2 py-0.5 rounded-full border border-stone-700">
          {STAGES[match.stage] ?? match.stage}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className={`flex-1 flex items-center justify-end gap-2 min-w-0 ${winner === 'home' ? 'opacity-100' : 'opacity-60'}`}>
          <span className={`text-sm font-semibold truncate text-right ${winner === 'home' ? 'text-stone-100' : 'text-stone-400'}`}>
            {match.home_team}
          </span>
          <span className="text-xl flex-shrink-0">{match.home_flag}</span>
        </div>

        {/* Score */}
        <div className="flex-shrink-0 flex items-center gap-2 bg-stone-800 rounded-xl px-4 py-2 border border-stone-700">
          <span className={`text-xl font-bold ${winner === 'home' ? 'text-amber-400' : 'text-stone-300'}`}>
            {match.home_score}
          </span>
          <span className="text-stone-600 text-sm">-</span>
          <span className={`text-xl font-bold ${winner === 'away' ? 'text-amber-400' : 'text-stone-300'}`}>
            {match.away_score}
          </span>
        </div>

        {/* Away team */}
        <div className={`flex-1 flex items-center justify-start gap-2 min-w-0 ${winner === 'away' ? 'opacity-100' : 'opacity-60'}`}>
          <span className="text-xl flex-shrink-0">{match.away_flag}</span>
          <span className={`text-sm font-semibold truncate ${winner === 'away' ? 'text-stone-100' : 'text-stone-400'}`}>
            {match.away_team}
          </span>
        </div>
      </div>

      {/* My prediction */}
      <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between">
        <span className="text-xs text-stone-500">Tu pronóstico</span>
        <PredictionResult prediction={prediction} match={match} />
      </div>

      {match.venue && (
        <div className="mt-1 text-center text-xs text-stone-700">📍 {match.venue}</div>
      )}
    </div>
  )
}

export default function Resultados() {
  const { user } = useAuth()
  const [matches, setMatches]         = useState([])
  const [predictions, setPredictions] = useState({})
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState('all')

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    const [{ data: matchData }, { data: predData }] = await Promise.all([
      supabase
        .from('matches')
        .select('*')
        .eq('status', 'finished')
        .order('match_date', { ascending: false }),
      supabase
        .from('predictions')
        .select('*')
        .eq('user_id', user.id),
    ])

    if (matchData) setMatches(matchData)
    if (predData) {
      const map = {}
      predData.forEach(p => { map[p.match_id] = p })
      setPredictions(map)
    }
    setLoading(false)
  }

  // Stats summary
  const stats = matches.reduce(
    (acc, m) => {
      const p = predictions[m.id]
      if (!p) return acc
      acc.total++
      if (p.points_earned === 3) acc.exact++
      else if (p.points_earned === 1) acc.correct++
      else acc.wrong++
      acc.points += p.points_earned ?? 0
      return acc
    },
    { total: 0, exact: 0, correct: 0, wrong: 0, points: 0 }
  )

  const filtered = filter === 'all'
    ? matches
    : filter === 'predicted'
    ? matches.filter(m => predictions[m.id])
    : matches.filter(m => !predictions[m.id])

  // Group by stage
  const grouped = filtered.reduce((acc, m) => {
    const key = STAGES[m.stage] ?? m.stage
    ;(acc[key] = acc[key] ?? []).push(m)
    return acc
  }, {})

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
        <h2 className="text-2xl font-bold text-stone-100">Resultados</h2>
        <p className="text-stone-400 text-sm mt-1">Partidos finalizados y tu puntuación en cada uno</p>
      </div>

      {/* Stats summary */}
      {matches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Puntos obtenidos', value: stats.points, color: 'text-amber-400', icon: '⭐' },
            { label: 'Exactos (×3pts)',  value: stats.exact,  color: 'text-amber-300', icon: '🎯' },
            { label: 'Correctos (×1pt)', value: stats.correct, color: 'text-blue-400', icon: '✓' },
            { label: 'Fallados',         value: stats.wrong,   color: 'text-stone-400', icon: '✗' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="card p-4 text-center">
              <div className="text-lg mb-0.5">{icon}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-stone-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-stone-400">Aún no hay partidos finalizados.</p>
          <p className="text-stone-600 text-sm mt-1">El Mundial empieza el 11 de junio de 2026. ¡Prepara tus pronósticos!</p>
        </div>
      ) : (
        <>
          {/* Filter buttons */}
          <div className="flex gap-2">
            {[
              { key: 'all', label: `Todos (${matches.length})` },
              { key: 'predicted', label: `Con pronóstico (${matches.filter(m => predictions[m.id]).length})` },
              { key: 'unpredicted', label: `Sin pronóstico (${matches.filter(m => !predictions[m.id]).length})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === key
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Results grouped by stage */}
          {Object.entries(grouped).map(([stage, stageMatches]) => (
            <div key={stage}>
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
                {stage} · {stageMatches.length} partido{stageMatches.length !== 1 ? 's' : ''}
              </h3>
              <div className="space-y-3">
                {stageMatches.map(m => (
                  <FinishedMatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions[m.id]}
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
