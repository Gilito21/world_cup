import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase, sq } from '../lib/supabase'
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


export default function Clasificacion() {
  const { user }                                      = useAuth()
  const { activeLeague, leagues, setActiveLeague }    = useLeague()
  const [tab, setTab]                   = useState('global')
  const [globalStandings, setGlobalStandings]   = useState([])
  const [leagueStandings, setLeagueStandings]   = useState([])
  const [companyStandings, setCompanyStandings] = useState([])
  const [myLeagueStats, setMyLeagueStats]       = useState({ exact: 0, correct: 0, total: 0 })
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)

  useEffect(() => { if (tab === 'global')    loadGlobal()    }, [tab])
  useEffect(() => { if (tab === 'league')    loadLeague()    }, [tab, activeLeague?.id])
  useEffect(() => { if (tab === 'companies') loadCompanies() }, [tab])

  // ── Global ───────────────────────────────────────────────────────────────

  async function loadGlobal() {
    setLoading(true)
    try {
      const { data: profiles } = await sq(
        supabase.from('profiles').select('id, username, total_points').order('total_points', { ascending: false })
      )

      setGlobalStandings(
        (profiles ?? []).map((p, i) => ({
          ...p,
          position:      i + 1,
          league_points: p.total_points ?? 0,
          stats:         { exact: 0, correct: 0, total: 0 },
        }))
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Liga ─────────────────────────────────────────────────────────────────

  async function loadLeague() {
    if (!activeLeague) { setLeagueStandings([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data: members } = await sq(
        supabase.from('league_members').select('user_id, role').eq('league_id', activeLeague.id)
      )

      if (!members || members.length === 0) {
        setLeagueStandings([])
        return
      }

      const memberIds = members.map(m => m.user_id)

      const [{ data: profiles }, { data: leaguePreds }] = await Promise.all([
        sq(supabase.from('profiles').select('id, username').in('id', memberIds)),
        sq(supabase.from('predictions').select('user_id, points_earned')
          .eq('league_id', activeLeague.id).in('user_id', memberIds)),
      ])

      const pointsMap = {}
      const statsMap  = {}
      ;(leaguePreds ?? []).forEach(p => {
        pointsMap[p.user_id] = (pointsMap[p.user_id] ?? 0) + (p.points_earned ?? 0)
        if (!statsMap[p.user_id]) statsMap[p.user_id] = { exact: 0, correct: 0, total: 0 }
        statsMap[p.user_id].total++
        if (p.points_earned === 3)      statsMap[p.user_id].exact++
        else if (p.points_earned === 1) statsMap[p.user_id].correct++
      })

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

      const result = members
        .map(member => {
          const profile = profileMap[member.user_id] ?? {}
          return {
            id:            member.user_id,
            username:      profile.username,
            role:          member.role,
            league_points: pointsMap[member.user_id] ?? 0,
            stats:         statsMap[member.user_id] ?? { exact: 0, correct: 0, total: 0 },
          }
        })
        .sort((a, b) => b.league_points - a.league_points)
        .map((entry, i) => ({ ...entry, position: i + 1 }))

      setLeagueStandings(result)
      const me = result.find(r => r.id === user.id)
      if (me) setMyLeagueStats(me.stats)
    } finally {
      setLoading(false)
    }
  }

  // ── Empresas ─────────────────────────────────────────────────────────────

  async function loadCompanies() {
    setLoading(true)
    try {
      const { data: profiles } = await sq(
        supabase.from('profiles').select('id, username, company, total_points')
          .not('company', 'is', null).neq('company', '')
      )

      const companyMap = {}
      for (const p of profiles ?? []) {
        if (!companyMap[p.company]) companyMap[p.company] = []
        companyMap[p.company].push(p)
      }

      const result = Object.entries(companyMap)
        .map(([name, members]) => {
          const sorted  = [...members].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
          const avg     = members.reduce((s, m) => s + (m.total_points ?? 0), 0) / members.length
          const hasMe   = members.some(m => m.id === user.id)
          return { name, count: members.length, avg, top: sorted[0], hasMe }
        })
        .sort((a, b) => b.avg - a.avg)
        .map((c, i) => ({ ...c, position: i + 1 }))

      setCompanyStandings(result)
    } finally {
      setLoading(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function handleTabChange(newTab) {
    setTab(newTab)
  }

  const tabs = [
    { id: 'global',    label: 'Global',   icon: '🌐' },
    { id: 'league',    label: 'Mi Liga',  icon: '🏆' },
    { id: 'companies', label: 'Empresas', icon: '🏢' },
  ]

  // ── Shared table header ───────────────────────────────────────────────────

  const IndividualTable = useCallback(({ standings, showStats = false }) => {
    const myEntry = standings.find(s => s.id === user.id)

    return (
      <>
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
                  </div>
                  <div className="text-sm text-stone-400">Posición #{myEntry.position}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-amber-400">{myEntry.league_points}</div>
                <div className="text-xs text-stone-500">puntos</div>
              </div>
            </div>
            {showStats && (
              <div className="flex gap-2 mt-3">
                <StatBadge label="Exactos"     value={myLeagueStats.exact}   color="text-amber-400" />
                <StatBadge label="Correctos"   value={myLeagueStats.correct} color="text-blue-400" />
                <StatBadge label="Pronósticos" value={myLeagueStats.total}   color="text-stone-700" />
              </div>
            )}
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
              {standings.map(entry => {
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
      </>
    )
  }, [user.id, myLeagueStats])

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">Clasificación</h2>
          <p className="text-stone-400 text-sm mt-1">
            Exacto = 3 pts · Correcto = 1 pt
          </p>
        </div>
        {tab === 'league' && activeLeague?.role === 'admin' && (
          <div className="flex-shrink-0 card p-3 text-center min-w-[140px]">
            <p className="text-xs text-stone-500 mb-1">Código para invitar</p>
            <p className="font-mono font-bold text-amber-400 tracking-widest text-lg">{activeLeague.invite_code}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden bg-stone-100 p-1">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 ${
              tab === id
                ? 'bg-amber-500 text-stone-950 shadow-sm'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* ── Global ── */}
          {tab === 'global' && (
            <>
              <p className="text-stone-400 text-sm -mt-2">
                {globalStandings.length} participante{globalStandings.length !== 1 ? 's' : ''} en total
              </p>
              <IndividualTable standings={globalStandings} />
            </>
          )}

          {/* ── Mi Liga ── */}
          {tab === 'league' && (
            <>
              {leagues.length === 0 ? (
                <div className="card p-10 text-center space-y-4">
                  <div className="text-4xl">🏆</div>
                  <p className="text-stone-700 font-medium">No estás en ninguna liga</p>
                  <p className="text-stone-500 text-sm">Crea o únete a una liga para ver su clasificación.</p>
                  <button onClick={() => setShowModal(true)} className="btn-primary">Crear o unirme a una liga</button>
                </div>
              ) : (
                <>
                  {/* Selector de liga si hay más de una */}
                  {leagues.length > 1 && (
                    <div className="flex gap-2 flex-wrap -mt-2">
                      {leagues.map(l => (
                        <button
                          key={l.id}
                          onClick={() => setActiveLeague(l)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            activeLeague?.id === l.id
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-stone-100 text-stone-500 hover:bg-stone-200 border border-stone-300'
                          }`}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-stone-400 text-sm -mt-2">
                    {activeLeague?.name} · {leagueStandings.length} participante{leagueStandings.length !== 1 ? 's' : ''}
                  </p>
                  <IndividualTable standings={leagueStandings} showStats />
                  <p className="text-center text-stone-400 text-xs">
                    Los puntos se calculan de los pronósticos de cada jugador en esta liga
                  </p>
                </>
              )}
            </>
          )}

          {/* ── Empresas ── */}
          {tab === 'companies' && (
            <>
              <p className="text-stone-400 text-sm -mt-2">
                Media de puntos por empleado · {companyStandings.length} empresa{companyStandings.length !== 1 ? 's' : ''}
              </p>
              {companyStandings.length === 0 ? (
                <div className="card p-10 text-center">
                  <div className="text-4xl mb-3">🏢</div>
                  <p className="text-stone-400">Ningún usuario ha indicado su empresa todavía.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="grid grid-cols-[3rem_1fr_6rem_5rem] gap-2 px-4 py-3 border-b border-stone-200 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    <div>#</div>
                    <div>Empresa</div>
                    <div className="text-center">Miembros</div>
                    <div className="text-right">Media pts</div>
                  </div>
                  <div className="divide-y divide-stone-200">
                    {companyStandings.map(entry => {
                      const isTop  = entry.position <= 3
                      const isMyCompany = entry.hasMe
                      return (
                        <div
                          key={entry.name}
                          className={`grid grid-cols-[3rem_1fr_6rem_5rem] gap-2 px-4 py-3.5 items-center transition-colors ${
                            isMyCompany ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-stone-100/60'
                          }`}
                        >
                          <div className="font-bold text-base">
                            {isTop
                              ? MEDALS[entry.position - 1]
                              : <span className="text-stone-500 text-sm">#{entry.position}</span>
                            }
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-medium truncate ${isMyCompany ? 'text-amber-500' : 'text-stone-900'}`}>
                                {entry.name}
                              </span>
                              {isMyCompany && (
                                <span className="text-xs text-amber-500/70 bg-amber-500/10 px-1.5 rounded flex-shrink-0">Tu empresa</span>
                              )}
                            </div>
                            <div className="text-xs text-stone-400 mt-0.5 truncate">
                              Mejor: {entry.top?.username ?? '—'}
                              {(entry.top?.total_points ?? 0) > 0 && ` · ${entry.top.total_points} pts`}
                            </div>
                          </div>
                          <div className="text-center text-stone-500 text-sm">
                            {entry.count} {entry.count === 1 ? 'persona' : 'personas'}
                          </div>
                          <div className="text-right">
                            <span className={`text-lg font-bold ${isTop ? 'text-amber-400' : 'text-stone-900'}`}>
                              {entry.avg % 1 === 0 ? entry.avg : entry.avg.toFixed(1)}
                            </span>
                            <span className="text-stone-400 text-xs ml-0.5">pts</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <p className="text-center text-stone-400 text-xs">
                Puntuación = media de todos los miembros de la empresa
              </p>
            </>
          )}
        </>
      )}

      {showModal && createPortal(<LeagueModal onClose={() => setShowModal(false)} />, document.body)}
    </div>
  )
}
