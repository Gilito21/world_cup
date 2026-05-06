import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

const MEDALS = ['🥇', '🥈', '🥉']

function StatBadge({ label, value, color }) {
  return (
    <div className={`text-center px-3 py-1.5 rounded-lg bg-stone-800 border border-stone-700`}>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  )
}

export default function Clasificacion() {
  const { user } = useAuth()
  const [standings, setStandings] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    loadStandings()
  }, [])

  async function loadStandings() {
    // Get profiles with points
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, total_points')
      .order('total_points', { ascending: false })

    if (!profiles) { setLoading(false); return }

    // Get prediction stats per user
    const { data: predStats } = await supabase
      .from('predictions')
      .select('user_id, points_earned')

    const statsMap = {}
    if (predStats) {
      predStats.forEach(p => {
        if (!statsMap[p.user_id]) statsMap[p.user_id] = { exact: 0, correct: 0, total: 0 }
        statsMap[p.user_id].total++
        if (p.points_earned === 3) statsMap[p.user_id].exact++
        else if (p.points_earned === 1) statsMap[p.user_id].correct++
      })
    }

    setStandings(profiles.map((p, i) => ({
      ...p,
      position: i + 1,
      stats: statsMap[p.id] ?? { exact: 0, correct: 0, total: 0 },
    })))
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const myEntry = standings.find(s => s.id === user.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-100">Clasificación</h2>
        <p className="text-stone-400 text-sm mt-1">
          Marcador exacto = 3 pts · Resultado correcto = 1 pt
        </p>
      </div>

      {/* My position card */}
      {myEntry && (
        <div className="card p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center text-amber-400 font-bold">
                {myEntry.username?.[0]?.toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-100">{myEntry.username}</span>
                  <span className="text-xs text-amber-500/70 bg-amber-500/10 px-1.5 rounded">Tú</span>
                </div>
                <div className="text-sm text-stone-400">Posición #{myEntry.position}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-400">{myEntry.total_points ?? 0}</div>
              <div className="text-xs text-stone-500">puntos</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <StatBadge label="Exactos" value={myEntry.stats.exact} color="text-amber-400" />
            <StatBadge label="Correctos" value={myEntry.stats.correct} color="text-blue-400" />
            <StatBadge label="Pronósticos" value={myEntry.stats.total} color="text-stone-300" />
          </div>
        </div>
      )}

      {standings.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-stone-400">Nadie ha puntuado todavía. ¡Empieza a pronosticar!</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,_5rem)_5rem] gap-2 px-4 py-3 border-b border-stone-800 text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <div>#</div>
            <div>Jugador</div>
            <div className="hidden sm:block text-center">Exactos</div>
            <div className="hidden sm:block text-center">Correct.</div>
            <div className="hidden sm:block text-center">Total</div>
            <div className="text-right">Puntos</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-stone-800/50">
            {standings.map((entry) => {
              const isMe  = entry.id === user.id
              const isTop = entry.position <= 3

              return (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,_5rem)_5rem] gap-2 px-4 py-3.5 items-center transition-colors
                    ${isMe ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-stone-800/30'}`}
                >
                  {/* Position */}
                  <div className="font-bold text-base">
                    {isTop ? MEDALS[entry.position - 1] : (
                      <span className="text-stone-500 text-sm">#{entry.position}</span>
                    )}
                  </div>

                  {/* User */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                      ${isMe
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                        : 'bg-stone-800 border border-stone-700 text-stone-300'
                      }`}>
                      {entry.username?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className={`font-medium truncate block ${isMe ? 'text-amber-300' : 'text-stone-100'}`}>
                        {entry.username}
                      </span>
                      {isMe && <span className="text-xs text-amber-500/60">Tú</span>}
                    </div>
                  </div>

                  {/* Stats (hidden on mobile) */}
                  <div className="hidden sm:block text-center text-amber-400 font-semibold text-sm">
                    {entry.stats.exact}
                  </div>
                  <div className="hidden sm:block text-center text-blue-400 font-medium text-sm">
                    {entry.stats.correct}
                  </div>
                  <div className="hidden sm:block text-center text-stone-400 text-sm">
                    {entry.stats.total}
                  </div>

                  {/* Points */}
                  <div className="text-right">
                    <span className={`text-lg font-bold ${isTop ? 'text-amber-400' : 'text-stone-100'}`}>
                      {entry.total_points ?? 0}
                    </span>
                    <span className="text-stone-600 text-xs ml-0.5">pts</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-center text-stone-600 text-xs">
        Clasificación actualizada en tiempo real · {standings.length} participante{standings.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
