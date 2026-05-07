import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import LeagueModal from '../components/LeagueModal'
import Spinner from '../components/Spinner'

const MEDALS = ['🥇', '🥈', '🥉']

function StatBadge({ label, value, color }) {
  return (
    <div className="text-center px-3 py-1.5 rounded-lg bg-stone-100 border border-stone-300">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  )
}

function ModeBadge({ mode }) {
  return mode === 'per_league'
    ? <span className="text-xs text-amber-600/80 bg-amber-600/10 border border-amber-600/20 px-1.5 py-0.5 rounded-full">🏆 propia</span>
    : <span className="text-xs text-stone-500 bg-stone-100 border border-stone-300 px-1.5 py-0.5 rounded-full">🌐 global</span>
}

export default function Clasificacion() {
  const { user }                                   = useAuth()
  const { activeLeague, leagues, setPredictionMode } = useLeague()
  const [standings, setStandings]  = useState([])
  const [myStats, setMyStats]      = useState({ exact: 0, correct: 0, total: 0 })
  const [loading, setLoading]      = useState(true)
  const [showModal, setShowModal]  = useState(false)

  useEffect(() => {
    loadStandings()
  }, [activeLeague])

  async function loadStandings() {
    setLoading(true)

    if (!activeLeague) {
      // Sin liga activa: clasificación global de todos los usuarios
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, total_points')
        .order('total_points', { ascending: false })

      if (profiles) {
        setStandings(profiles.map((p, i) => ({
          ...p,
          position:        i + 1,
          role:            null,
          prediction_mode: 'global',
          league_points:   p.total_points ?? 0,
          stats:           { exact: 0, correct: 0, total: 0 },
        })))
      }
      setLoading(false)
      return
    }

    // ── Con liga activa ──────────────────────────────────────────────────────

    // 1. Miembros de la liga (con su modo de pronósticos)
    const { data: members } = await supabase
      .from('league_members')
      .select('user_id, role, prediction_mode')
      .eq('league_id', activeLeague.id)

    if (!members || members.length === 0) {
      setStandings([])
      setLoading(false)
      return
    }

    const memberIds          = members.map(m => m.user_id)
    const perLeagueUserIds   = members.filter(m => m.prediction_mode === 'per_league').map(m => m.user_id)
    const globalUserIds      = members.filter(m => m.prediction_mode !== 'per_league').map(m => m.user_id)

    // 2. Perfiles (para total_points de usuarios en modo global)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, total_points')
      .in('id', memberIds)

    // 3. Predicciones por-liga para quienes están en modo per_league
    let perLeaguePointsMap = {}
    let perLeagueStatsMap  = {}
    if (perLeagueUserIds.length > 0) {
      const { data: leaguePreds } = await supabase
        .from('predictions')
        .select('user_id, points_earned')
        .eq('league_id', activeLeague.id)
        .in('user_id', perLeagueUserIds)

      ;(leaguePreds ?? []).forEach(p => {
        perLeaguePointsMap[p.user_id] = (perLeaguePointsMap[p.user_id] ?? 0) + (p.points_earned ?? 0)
        if (!perLeagueStatsMap[p.user_id]) perLeagueStatsMap[p.user_id] = { exact: 0, correct: 0, total: 0 }
        perLeagueStatsMap[p.user_id].total++
        if (p.points_earned === 3) perLeagueStatsMap[p.user_id].exact++
        else if (p.points_earned === 1) perLeagueStatsMap[p.user_id].correct++
      })
    }

    // 4. Stats de predicciones globales para quienes están en modo global
    let globalStatsMap = {}
    if (globalUserIds.length > 0) {
      const { data: globalPreds } = await supabase
        .from('predictions')
        .select('user_id, points_earned')
        .is('league_id', null)
        .in('user_id', globalUserIds)

      ;(globalPreds ?? []).forEach(p => {
        if (!globalStatsMap[p.user_id]) globalStatsMap[p.user_id] = { exact: 0, correct: 0, total: 0 }
        globalStatsMap[p.user_id].total++
        if (p.points_earned === 3) globalStatsMap[p.user_id].exact++
        else if (p.points_earned === 1) globalStatsMap[p.user_id].correct++
      })
    }

    // 5. Combinar y ordenar
    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    const roleMap    = Object.fromEntries(members.map(m => [m.user_id, m]))

    const result = members.map(member => {
      const profile  = profileMap[member.user_id] ?? {}
      const isPerLeague = member.prediction_mode === 'per_league'
      const points   = isPerLeague
        ? (perLeaguePointsMap[member.user_id] ?? 0)
        : (profile.total_points ?? 0)
      const stats    = isPerLeague
        ? (perLeagueStatsMap[member.user_id] ?? { exact: 0, correct: 0, total: 0 })
        : (globalStatsMap[member.user_id] ?? { exact: 0, correct: 0, total: 0 })

      return {
        id:              member.user_id,
        username:        profile.username,
        role:            member.role,
        prediction_mode: member.prediction_mode ?? 'global',
        league_points:   points,
        stats,
      }
    })
    .sort((a, b) => b.league_points - a.league_points)
    .map((entry, i) => ({ ...entry, position: i + 1 }))

    setStandings(result)

    // Stats del usuario actual para el card de "mi posición"
    const me = result.find(r => r.id === user.id)
    if (me) setMyStats(me.stats)

    setLoading(false)
  }

  const myEntry = standings.find(s => s.id === user.id)

  if (!loading && leagues.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-stone-900">Clasificación</h2>
        <div className="card p-10 text-center space-y-4">
          <div className="text-4xl">🏆</div>
          <p className="text-stone-700 font-medium">Únete a una liga para competir</p>
          <p className="text-stone-500 text-sm">La clasificación muestra el ranking dentro de tu liga.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Crear o unirme a una liga</button>
        </div>
        {showModal && <LeagueModal onClose={() => setShowModal(false)} />}
      </div>
    )
  }

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Clasificación</h2>
          <p className="text-stone-400 text-sm mt-1">
            {activeLeague
              ? `${activeLeague.name} · ${standings.length} participante${standings.length !== 1 ? 's' : ''}`
              : 'Clasificación global'}
            {' '}· Exacto = 3 pts · Correcto = 1 pt
          </p>
        </div>

        {activeLeague?.role === 'admin' && (
          <div className="flex-shrink-0 card p-3 text-center min-w-[140px]">
            <p className="text-xs text-stone-500 mb-1">Código para invitar</p>
            <p className="font-mono font-bold text-amber-400 tracking-widest text-lg">{activeLeague.invite_code}</p>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-stone-900">{myEntry.username}</span>
                  <span className="text-xs text-amber-500/70 bg-amber-500/10 px-1.5 rounded">Tú</span>
                  {myEntry.role === 'admin' && (
                    <span className="text-xs text-amber-600/80 bg-amber-600/10 px-1.5 rounded">👑 Admin</span>
                  )}
                  {activeLeague && <ModeBadge mode={myEntry.prediction_mode} />}
                </div>
                <div className="text-sm text-stone-400">Posición #{myEntry.position}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-400">{myEntry.league_points}</div>
              <div className="text-xs text-stone-500">puntos</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <StatBadge label="Exactos"     value={myStats.exact}   color="text-amber-400" />
            <StatBadge label="Correctos"   value={myStats.correct} color="text-blue-400" />
            <StatBadge label="Pronósticos" value={myStats.total}   color="text-stone-700" />
          </div>
        </div>
      )}

      {standings.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-stone-400">Nadie ha puntuado todavía. ¡Los partidos empiezan el 11 de junio!</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,5rem)_5rem] gap-2 px-4 py-3 border-b border-stone-200 text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <div>#</div>
            <div>Jugador</div>
            <div className="hidden sm:block text-center">Exactos</div>
            <div className="hidden sm:block text-center">Correct.</div>
            <div className="hidden sm:block text-center">Total</div>
            <div className="text-right">Puntos</div>
          </div>

          <div className="divide-y divide-stone-200">
            {standings.map((entry) => {
              const isMe  = entry.id === user.id
              const isTop = entry.position <= 3

              return (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,5rem)_5rem] gap-2 px-4 py-3.5 items-center transition-colors ${
                    isMe ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-stone-100/60'
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
                        : 'bg-stone-100 border border-stone-300 text-stone-700'
                    }`}>
                      {entry.username?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {entry.role === 'admin' && <span className="text-xs flex-shrink-0">👑</span>}
                        <span className={`font-medium truncate ${isMe ? 'text-amber-500' : 'text-stone-900'}`}>
                          {entry.username}
                        </span>
                        {isMe && <span className="text-xs text-amber-500/60 flex-shrink-0">Tú</span>}
                      </div>
                      {activeLeague && (
                        <div className="mt-0.5">
                          <ModeBadge mode={entry.prediction_mode} />
                        </div>
                      )}
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
                    <span className={`text-lg font-bold ${isTop ? 'text-amber-400' : 'text-stone-900'}`}>
                      {entry.league_points}
                    </span>
                    <span className="text-stone-400 text-xs ml-0.5">pts</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeLeague && (
        <p className="text-center text-stone-400 text-xs">
          Los puntos se calculan de los pronósticos activos de cada jugador en esta liga
        </p>
      )}
    </div>
  )
}
