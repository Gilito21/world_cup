import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import LeagueModal from '../components/LeagueModal'
import Spinner from '../components/Spinner'

const MEDALS = ['🥇', '🥈', '🥉']

function StatBadge({ label, value, color }) {
  return (
    <div className="text-center px-3 py-1.5 rounded-lg bg-stone-800 border border-stone-700">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  )
}

export default function Clasificacion() {
  const { user }                                    = useAuth()
  const { activeLeague, leagues, setActiveLeague }  = useLeague()
  const [standings, setStandings]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)

  useEffect(() => {
    loadStandings()
  }, [activeLeague])

  async function loadStandings() {
    setLoading(true)

    let memberIds = null

    if (activeLeague) {
      // Obtener IDs de miembros de la liga activa
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', activeLeague.id)

      memberIds = (members ?? []).map(m => m.user_id)
      if (memberIds.length === 0) { setStandings([]); setLoading(false); return }
    }

    // Obtener perfiles (filtrar por liga si hay activa)
    let query = supabase
      .from('profiles')
      .select('id, username, total_points')
      .order('total_points', { ascending: false })

    if (memberIds) {
      query = query.in('id', memberIds)
    }

    const { data: profiles } = await query

    if (!profiles) { setLoading(false); return }

    // Stats de pronósticos por usuario
    let predQuery = supabase
      .from('predictions')
      .select('user_id, points_earned')
      .gt('points_earned', -1) // sólo las procesadas

    if (memberIds) {
      predQuery = predQuery.in('user_id', memberIds)
    }

    const { data: predStats } = await predQuery

    const statsMap = {}
    ;(predStats ?? []).forEach(p => {
      if (!statsMap[p.user_id]) statsMap[p.user_id] = { exact: 0, correct: 0, total: 0 }
      statsMap[p.user_id].total++
      if (p.points_earned === 3) statsMap[p.user_id].exact++
      else if (p.points_earned === 1) statsMap[p.user_id].correct++
    })

    // También obtener info de rol en la liga activa
    const roleMap = {}
    if (activeLeague) {
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id, role')
        .eq('league_id', activeLeague.id)
      ;(members ?? []).forEach(m => { roleMap[m.user_id] = m.role })
    }

    setStandings(profiles.map((p, i) => ({
      ...p,
      position: i + 1,
      role:     roleMap[p.id] ?? 'member',
      stats:    statsMap[p.id] ?? { exact: 0, correct: 0, total: 0 },
    })))

    setLoading(false)
  }

  const myEntry = standings.find(s => s.id === user.id)

  // Sin liga activa y sin ligas en absoluto
  if (!loading && leagues.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-100">Clasificación</h2>
        </div>
        <div className="card p-10 text-center space-y-4">
          <div className="text-4xl">🏆</div>
          <p className="text-stone-300 font-medium">Únete a una liga para ver la clasificación</p>
          <p className="text-stone-500 text-sm">La clasificación muestra el ranking de los miembros de tu liga.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mx-auto">
            Crear o unirme a una liga
          </button>
        </div>
        {showModal && <LeagueModal onClose={() => setShowModal(false)} />}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-100">Clasificación</h2>
          <p className="text-stone-400 text-sm mt-1">
            {activeLeague
              ? `Liga: ${activeLeague.name} · ${standings.length} participante${standings.length !== 1 ? 's' : ''}`
              : 'Clasificación global'}
            {' '}· Exacto = 3 pts · Correcto = 1 pt
          </p>
        </div>

        {/* Código de invitación para admins */}
        {activeLeague?.role === 'admin' && (
          <div className="flex-shrink-0 card p-3 text-center min-w-[140px]">
            <p className="text-xs text-stone-500 mb-1">Código para invitar</p>
            <p className="font-mono font-bold text-amber-400 tracking-widest text-lg">
              {activeLeague.invite_code}
            </p>
          </div>
        )}
      </div>

      {/* Mi posición */}
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
                  {myEntry.role === 'admin' && (
                    <span className="text-xs text-amber-600/80 bg-amber-600/10 px-1.5 rounded">👑 Admin</span>
                  )}
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
            <StatBadge label="Exactos"     value={myEntry.stats.exact}   color="text-amber-400" />
            <StatBadge label="Correctos"   value={myEntry.stats.correct} color="text-blue-400" />
            <StatBadge label="Pronósticos" value={myEntry.stats.total}   color="text-stone-300" />
          </div>
        </div>
      )}

      {standings.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-stone-400">Nadie ha puntuado todavía. ¡Los partidos empezarán el 11 de junio!</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Cabecera */}
          <div className="grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,5rem)_5rem] gap-2 px-4 py-3 border-b border-stone-800 text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <div>#</div>
            <div>Jugador</div>
            <div className="hidden sm:block text-center">Exactos</div>
            <div className="hidden sm:block text-center">Correct.</div>
            <div className="hidden sm:block text-center">Total</div>
            <div className="text-right">Puntos</div>
          </div>

          {/* Filas */}
          <div className="divide-y divide-stone-800/50">
            {standings.map((entry) => {
              const isMe  = entry.id === user.id
              const isTop = entry.position <= 3

              return (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,5rem)_5rem] gap-2 px-4 py-3.5 items-center transition-colors ${
                    isMe ? 'bg-amber-500/5 hover:bg-amber-500/8' : 'hover:bg-stone-800/30'
                  }`}
                >
                  <div className="font-bold text-base">
                    {isTop
                      ? MEDALS[entry.position - 1]
                      : <span className="text-stone-500 text-sm">#{entry.position}</span>
                    }
                  </div>

                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      isMe
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                        : 'bg-stone-800 border border-stone-700 text-stone-300'
                    }`}>
                      {entry.username?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {entry.role === 'admin' && <span className="text-xs">👑</span>}
                        <span className={`font-medium truncate block ${isMe ? 'text-amber-300' : 'text-stone-100'}`}>
                          {entry.username}
                        </span>
                        {isMe && <span className="text-xs text-amber-500/60 flex-shrink-0">Tú</span>}
                      </div>
                    </div>
                  </div>

                  <div className="hidden sm:block text-center text-amber-400 font-semibold text-sm">
                    {entry.stats.exact}
                  </div>
                  <div className="hidden sm:block text-center text-blue-400 font-medium text-sm">
                    {entry.stats.correct}
                  </div>
                  <div className="hidden sm:block text-center text-stone-400 text-sm">
                    {entry.stats.total}
                  </div>

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
    </div>
  )
}
