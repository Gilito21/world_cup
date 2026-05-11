import { useEffect, useState } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, setMatchCache } from '../lib/matchCache'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import Spinner from '../components/Spinner'

const STAGES = {
  group:         'Fase de grupos',
  round_of_32:  'Ronda de 32',
  round_of_16:  'Octavos de final',
  quarter_final: 'Cuartos de final',
  semi_final:    'Semifinales',
  third_place:   'Tercer puesto',
  final:         'Gran Final',
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

// ── Fila de un pronóstico en la tabla expandida ─────────────────────────────
function PredRow({ entry, realHome, realAway }) {
  const pts        = entry.points_earned ?? 0
  const exact      = entry.home_score === realHome && entry.away_score === realAway
  const realWinner = getWinner(realHome, realAway)
  const predWinner = getWinner(entry.home_score, entry.away_score)
  const correct    = !exact && predWinner === realWinner

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
      exact   ? 'bg-amber-500/10'
      : correct ? 'bg-blue-500/10'
      : 'bg-stone-100'
    }`}>
      {/* Avatar + nombre */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        exact ? 'bg-amber-500/30 text-amber-600' : correct ? 'bg-blue-500/20 text-blue-500' : 'bg-stone-200 text-stone-500'
      }`}>
        {entry.username?.[0]?.toUpperCase()}
      </div>
      <span className="font-medium text-stone-800 truncate flex-1">{entry.username}</span>

      {/* Pronóstico */}
      <span className="font-mono text-stone-700 flex-shrink-0">
        {entry.home_score} - {entry.away_score}
      </span>

      {/* Puntos */}
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
        pts === 3 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
        : pts === 1 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        : 'bg-stone-200 text-stone-500 border-stone-300'
      }`}>
        {pts === 3 ? '🎯 +3' : pts === 1 ? '✓ +1' : '✗ 0'}
      </span>
    </div>
  )
}

// ── Tarjeta de partido finalizado ────────────────────────────────────────────
function FinishedMatchCard({ match, myPrediction, leagueId, predictionMode }) {
  const { user }   = useAuth()
  const winner     = getWinner(match.home_score, match.away_score)
  const [expanded, setExpanded]     = useState(false)
  const [allPreds, setAllPreds]     = useState(null)
  const [loadingPreds, setLoadingPreds] = useState(false)

  async function loadAllPredictions() {
    if (allPreds !== null) { setExpanded(e => !e); return }
    setExpanded(true)
    setLoadingPreds(true)

    // Predicciones del partido según el modo de la liga
    const predQuery = predictionMode === 'per_league' && leagueId
      ? supabase.from('predictions').select('user_id, home_score, away_score, points_earned').eq('match_id', match.id).eq('league_id', leagueId)
      : supabase.from('predictions').select('user_id, home_score, away_score, points_earned').eq('match_id', match.id).is('league_id', null)

    const { data: preds } = await predQuery

    // Perfiles para obtener usernames
    const userIds = [...new Set((preds ?? []).map(p => p.user_id))]
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, username').in('id', userIds)
      : { data: [] }

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    const enriched = (preds ?? [])
      .map(p => ({ ...p, username: profileMap[p.user_id]?.username ?? '?' }))
      .sort((a, b) => (b.points_earned ?? 0) - (a.points_earned ?? 0))

    setAllPreds(enriched)
    setLoadingPreds(false)
  }

  const stats = allPreds
    ? {
        total:   allPreds.length,
        exact:   allPreds.filter(p => p.points_earned === 3).length,
        correct: allPreds.filter(p => p.points_earned === 1).length,
        wrong:   allPreds.filter(p => (p.points_earned ?? 0) === 0).length,
      }
    : null

  return (
    <div className="card overflow-hidden">
      {/* Cabecera del partido */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 capitalize">{formatDate(match.match_date)}</span>
            {match.group_name && (
              <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">Grupo {match.group_name}</span>
            )}
          </div>
          <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-300">
            {STAGES[match.stage] ?? match.stage}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex-1 flex items-center justify-end gap-2 min-w-0 ${winner !== 'home' ? 'opacity-60' : ''}`}>
            <span className={`text-sm font-semibold truncate text-right ${winner === 'home' ? 'text-stone-900' : 'text-stone-400'}`}>
              {match.home_team}
            </span>
            <span className="text-xl flex-shrink-0">{match.home_flag}</span>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2 bg-stone-100 rounded-xl px-4 py-2 border border-stone-300">
            <span className={`text-xl font-bold ${winner === 'home' ? 'text-amber-400' : 'text-stone-700'}`}>{match.home_score}</span>
            <span className="text-stone-400 text-sm">-</span>
            <span className={`text-xl font-bold ${winner === 'away' ? 'text-amber-400' : 'text-stone-700'}`}>{match.away_score}</span>
          </div>

          <div className={`flex-1 flex items-center justify-start gap-2 min-w-0 ${winner !== 'away' ? 'opacity-60' : ''}`}>
            <span className="text-xl flex-shrink-0">{match.away_flag}</span>
            <span className={`text-sm font-semibold truncate ${winner === 'away' ? 'text-stone-900' : 'text-stone-400'}`}>
              {match.away_team}
            </span>
          </div>
        </div>

        {/* Mi pronóstico + botón ver todos */}
        <div className="mt-3 pt-3 border-t border-stone-200 flex items-center justify-between gap-3">
          <div className="text-xs text-stone-500">
            {myPrediction ? (
              <>
                Tu pronóstico:{' '}
                <span className="text-stone-700 font-medium font-mono">
                  {myPrediction.home_score} - {myPrediction.away_score}
                </span>
                {' · '}
                <span className={
                  myPrediction.points_earned === 3 ? 'text-amber-400 font-semibold' :
                  myPrediction.points_earned === 1 ? 'text-blue-400' : 'text-stone-500'
                }>
                  {myPrediction.points_earned === 3 ? '🎯 +3 pts' :
                   myPrediction.points_earned === 1 ? '✓ +1 pt' : '✗ 0 pts'}
                </span>
              </>
            ) : (
              <span className="italic">Sin pronóstico</span>
            )}
          </div>

          <button
            onClick={loadAllPredictions}
            className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors flex-shrink-0"
          >
            <span>{expanded ? '▲' : '▼'}</span>
            <span>{expanded ? 'Ocultar' : 'Ver todos'}</span>
          </button>
        </div>
      </div>

      {/* Panel expandido: pronósticos de todos */}
      {expanded && (
        <div className="border-t border-stone-200 bg-stone-50 px-4 pb-4 pt-3">
          {loadingPreds ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : allPreds && allPreds.length > 0 ? (
            <>
              {/* Resumen rápido */}
              <div className="flex gap-3 mb-3 text-xs text-stone-500">
                <span>{stats.total} pronósticos</span>
                <span className="text-amber-400">🎯 {stats.exact} exactos</span>
                <span className="text-blue-400">✓ {stats.correct} correctos</span>
                <span>✗ {stats.wrong} fallados</span>
              </div>
              {/* Lista de pronósticos */}
              <div className="space-y-1.5">
                {allPreds.map(p => (
                  <PredRow
                    key={p.user_id}
                    entry={p}
                    realHome={match.home_score}
                    realAway={match.away_score}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-stone-500 text-sm text-center py-3 italic">
              Nadie pronosticó este partido.
            </p>
          )}
        </div>
      )}

      {match.venue && (
        <div className="px-4 pb-3 text-center text-xs text-stone-400">📍 {match.venue}</div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Resultados() {
  const { user }                   = useAuth()
  const { activeLeague }           = useLeague()
  const predictionMode             = activeLeague?.prediction_mode ?? 'global'
  const leagueId                   = predictionMode === 'per_league' ? activeLeague?.id : null

  const [matches, setMatches]         = useState([])
  const [predictions, setPredictions] = useState({})
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState('all')

  useEffect(() => {
    loadData()
  }, [user, activeLeague?.id, predictionMode])

  async function loadData() {
    setLoading(true)
    try {
      const cachedMatches = getMatchCache()
      const [{ data: allMatchData }, { data: predData }] = await Promise.all([
        cachedMatches
          ? Promise.resolve({ data: cachedMatches })
          : sq(supabase.from('matches').select('*').order('match_date', { ascending: false })),
        sq(predictionMode === 'per_league' && activeLeague
          ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', activeLeague.id)
          : supabase.from('predictions').select('*').eq('user_id', user.id).is('league_id', null)),
      ])
      if (allMatchData) {
        setMatchCache(allMatchData)
        setMatches(allMatchData.filter(m => m.status === 'finished'))
      }
      if (predData) {
        const map = {}
        predData.forEach(p => { map[p.match_id] = p })
        setPredictions(map)
      }
    } finally {
      setLoading(false)
    }
  }

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

  const grouped = filtered.reduce((acc, m) => {
    const key = STAGES[m.stage] ?? m.stage
    ;(acc[key] = acc[key] ?? []).push(m)
    return acc
  }, {})

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Resultados</h2>
        <p className="text-stone-400 text-sm mt-1">
          Partidos finalizados · Despliega cada partido para ver los pronósticos de todos
        </p>
      </div>

      {matches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Puntos obtenidos', value: stats.points, color: 'text-amber-400', icon: '⭐' },
            { label: 'Exactos (×3pts)',  value: stats.exact,  color: 'text-amber-300', icon: '🎯' },
            { label: 'Correctos (×1pt)', value: stats.correct, color: 'text-blue-400', icon: '✓' },
            { label: 'Fallados',         value: stats.wrong,  color: 'text-stone-400', icon: '✗' },
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
          <p className="text-stone-400 text-sm mt-1">El Mundial empieza el 11 de junio de 2026. ¡Prepara tus pronósticos!</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all',         label: `Todos (${matches.length})` },
              { key: 'predicted',   label: `Con pronóstico (${matches.filter(m => predictions[m.id]).length})` },
              { key: 'unpredicted', label: `Sin pronóstico (${matches.filter(m => !predictions[m.id]).length})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === key ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-400 hover:text-stone-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

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
                    myPrediction={predictions[m.id]}
                    leagueId={leagueId}
                    predictionMode={predictionMode}
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
