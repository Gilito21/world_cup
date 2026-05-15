import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase, sq } from '../lib/supabase'
import { getCache, setCache } from '../lib/dataCache'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import LeagueModal from '../components/LeagueModal'
import Spinner from '../components/Spinner'
import { StandingsSkeleton } from '../components/Skeleton'

const MEDALS = ['🥇', '🥈', '🥉']

// ─── STAT BADGE ──────────────────────────────────────────────────────────────

function StatBadge({ label, value, color }) {
  return (
    <div className="text-center px-3 py-1.5 rounded-lg bg-stone-100 border border-stone-300">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  )
}

// ─── AVATAR ──────────────────────────────────────────────────────────────────

function Avatar({ url, username, size = 'md', isMe = false }) {
  const sz = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-16 h-16 text-2xl',
  }[size] ?? 'w-8 h-8 text-sm'

  if (url) {
    return (
      <img
        src={url}
        alt={username}
        className={`${sz} rounded-full object-cover flex-shrink-0 ${
          isMe ? 'border-2 border-amber-500/50' : 'border border-stone-200'
        }`}
      />
    )
  }
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
      isMe
        ? 'bg-amber-500/20 border-2 border-amber-500/50 text-amber-400'
        : 'bg-stone-100 border border-stone-300 text-stone-700'
    }`}>
      {username?.[0]?.toUpperCase()}
    </div>
  )
}

// ─── PROFILE MODAL ───────────────────────────────────────────────────────────

function ProfileModal({ profile, currentUserId, onClose }) {
  const { t } = useLang()
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const isMe = profile.id === currentUserId

  useEffect(() => {
    async function loadBestLeagueStats() {
      const { data: preds } = await sq(
        supabase.from('predictions')
          .select('league_id, points_earned')
          .eq('user_id', profile.id)
      )

      if (!preds || preds.length === 0) {
        setStats({ points: 0, exact: 0, correct: 0, total: 0, leagueName: null })
        setLoading(false)
        return
      }

      // Group predictions by league context
      const groups = {}
      for (const p of preds) {
        const key = p.league_id ?? '__global__'
        if (!groups[key]) groups[key] = []
        groups[key].push(p)
      }

      // Find the league with highest total points
      let bestKey    = '__global__'
      let bestPoints = -1
      for (const [key, group] of Object.entries(groups)) {
        const pts = group.reduce((s, p) => s + (p.points_earned ?? 0), 0)
        if (pts > bestPoints) { bestPoints = pts; bestKey = key }
      }

      const bestGroup = groups[bestKey] ?? []
      const exact   = bestGroup.filter(p => p.points_earned === 3).length
      const correct = bestGroup.filter(p => p.points_earned === 1).length

      let leagueName = null
      if (bestKey !== '__global__') {
        const { data: league } = await sq(
          supabase.from('leagues').select('name').eq('id', bestKey).maybeSingle()
        )
        leagueName = league?.name ?? null
      }

      setStats({ points: bestPoints, exact, correct, total: bestGroup.length, leagueName })
      setLoading(false)
    }

    loadBestLeagueStats()
  }, [profile.id])

  return (
    <div
      className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card p-5 sm:p-6 max-w-sm w-full space-y-4 sm:space-y-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <Avatar url={profile.avatar_url} username={profile.username} size="xl" isMe={isMe} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-stone-900 truncate">{profile.username}</h3>
                {isMe && (
                  <span className="text-xs text-amber-500/70 bg-amber-500/10 px-1.5 rounded flex-shrink-0">{t('common.you')}</span>
                )}
              </div>
              {profile.company && (
                <p className="text-sm text-stone-500 mt-0.5 truncate">🏢 {profile.company}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors text-2xl leading-none flex-shrink-0 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Best league stats */}
        <div>
          <p className="text-xs text-stone-400 mb-3 font-medium uppercase tracking-wider">
            {loading
              ? t('clasificacion.loading')
              : stats?.leagueName
                ? t('clasificacion.bestLeague', { name: stats.leagueName })
                : t('clasificacion.globalPreds')}
          </p>
          {loading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              <StatBadge label={t('clasificacion.statPoints')}  value={stats.points}  color="text-amber-400" />
              <StatBadge label={t('clasificacion.statExact')}   value={stats.exact}   color="text-amber-400" />
              <StatBadge label={t('clasificacion.statCorrect')} value={stats.correct} color="text-blue-400" />
              <StatBadge label={t('clasificacion.statTotal')}   value={stats.total}   color="text-stone-600" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Clasificacion() {
  const { user }                                   = useAuth()
  const { activeLeague, leagues, setActiveLeague } = useLeague()
  const { t }                                      = useLang()
  const [tab, setTab]                   = useState('global')
  const [globalStandings, setGlobalStandings]   = useState(() => getCache('lb:global') ?? [])
  const [leagueStandings, setLeagueStandings]   = useState([])
  const [companyStandings, setCompanyStandings] = useState(() => getCache('lb:companies') ?? [])
  const [myLeagueStats, setMyLeagueStats]       = useState({ exact: 0, correct: 0, total: 0 })
  const [loading, setLoading]           = useState(false)
  const [loadError, setLoadError]       = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)

  useEffect(() => { if (tab === 'global')    loadGlobal()    }, [tab])
  useEffect(() => { if (tab === 'league')    loadLeague()    }, [tab, activeLeague?.id])
  useEffect(() => { if (tab === 'companies') loadCompanies() }, [tab])

  // ── Global ───────────────────────────────────────────────────────────────

  async function loadGlobal() {
    const cached = getCache('lb:global')
    if (cached) setGlobalStandings(cached)
    else setLoading(true)
    setLoadError('')
    try {
      const { data: profiles, error } = await sq(
        supabase.from('profiles')
          .select('id, username, total_points, avatar_url, company')
          .order('total_points', { ascending: false })
      )

      if (profiles) {
        const next = profiles.map((p, i) => ({
          ...p,
          position:      i + 1,
          league_points: p.total_points ?? 0,
          stats:         { exact: 0, correct: 0, total: 0 },
        }))
        setGlobalStandings(next)
        setCache('lb:global', next)
      } else if (error && !cached) {
        setLoadError(t('clasificacion.loadError'))
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Liga ─────────────────────────────────────────────────────────────────

  async function loadLeague() {
    if (!activeLeague) { setLeagueStandings([]); setLoading(false); return }
    const cacheKey = `lb:league:${activeLeague.id}`
    const cached = getCache(cacheKey)
    if (cached) {
      setLeagueStandings(cached.standings)
      setMyLeagueStats(cached.myStats ?? { exact: 0, correct: 0, total: 0 })
    } else {
      setLoading(true)
    }
    setLoadError('')
    try {
      const { data: members } = await sq(
        supabase.from('league_members').select('user_id, role').eq('league_id', activeLeague.id)
      )

      // Timeout — keep whatever was already rendered (cache or stale state),
      // but surface an error if we had nothing cached to fall back on.
      if (members === null) {
        if (!cached) setLoadError(t('clasificacion.loadError'))
        return
      }

      if (members.length === 0) {
        setLeagueStandings([])
        return
      }

      const memberIds = members.map(m => m.user_id)

      const [{ data: profiles }, { data: leaguePreds }] = await Promise.all([
        sq(supabase.from('profiles').select('id, username, avatar_url, company').in('id', memberIds)),
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
            avatar_url:    profile.avatar_url ?? null,
            company:       profile.company ?? null,
            role:          member.role,
            league_points: pointsMap[member.user_id] ?? 0,
            stats:         statsMap[member.user_id] ?? { exact: 0, correct: 0, total: 0 },
          }
        })
        .sort((a, b) => b.league_points - a.league_points)
        .map((entry, i) => ({ ...entry, position: i + 1 }))

      setLeagueStandings(result)
      const me = result.find(r => r.id === user.id)
      const myStats = me?.stats ?? { exact: 0, correct: 0, total: 0 }
      if (me) setMyLeagueStats(myStats)
      setCache(cacheKey, { standings: result, myStats })
    } finally {
      setLoading(false)
    }
  }

  // ── Empresas ─────────────────────────────────────────────────────────────

  async function loadCompanies() {
    const cached = getCache('lb:companies')
    if (cached) setCompanyStandings(cached)
    else setLoading(true)
    setLoadError('')
    try {
      const { data: profiles } = await sq(
        supabase.from('profiles').select('id, username, company, total_points, avatar_url')
          .not('company', 'is', null).neq('company', '')
      )

      if (!profiles) {
        if (!cached) setLoadError(t('clasificacion.loadError'))
        return
      }

      const companyMap = {}
      for (const p of profiles) {
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
      setCache('lb:companies', result)
    } finally {
      setLoading(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function handleTabChange(newTab) { setTab(newTab) }

  const tabs = [
    { id: 'global',    label: t('clasificacion.tabGlobal'),    icon: '🌐' },
    { id: 'league',    label: t('clasificacion.tabLeague'),    icon: '🏆' },
    { id: 'companies', label: t('clasificacion.tabCompanies'), icon: '🏢' },
  ]

  // ── Individual table ──────────────────────────────────────────────────────

  const IndividualTable = useCallback(({ standings, showStats = false }) => {
    const myEntry = standings.find(s => s.id === user.id)

    return (
      <>
        {myEntry && (
          <div
            className="card p-3 sm:p-4 border-amber-500/30 bg-amber-500/5 cursor-pointer hover:border-amber-500/50 transition-colors"
            onClick={() => setSelectedProfile(myEntry)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Avatar url={myEntry.avatar_url} username={myEntry.username} size="lg" isMe />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-stone-900 truncate">{myEntry.username}</span>
                    <span className="text-[10px] sm:text-xs text-amber-500/70 bg-amber-500/10 px-1.5 rounded">{t('common.you')}</span>
                    {myEntry.role === 'admin' && (
                      <span className="text-[10px] sm:text-xs text-amber-600/80 bg-amber-600/10 px-1.5 rounded">👑</span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm text-stone-400">{t('clasificacion.positionLabel', { n: myEntry.position })}</div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xl sm:text-2xl font-bold text-amber-400">{myEntry.league_points}</div>
                <div className="text-[10px] sm:text-xs text-stone-500">{t('common.pts')}</div>
              </div>
            </div>
            {showStats && (
              <div className="flex gap-2 mt-3">
                <StatBadge label={t('clasificacion.statExact')}   value={myLeagueStats.exact}   color="text-amber-400" />
                <StatBadge label={t('clasificacion.statCorrect')} value={myLeagueStats.correct} color="text-blue-400" />
                <StatBadge label={t('clasificacion.statTotal')}   value={myLeagueStats.total}   color="text-stone-700" />
              </div>
            )}
          </div>
        )}

        {standings.length === 0 ? (
          <div className="card p-6 sm:p-10 text-center">
            <div className="text-3xl sm:text-4xl mb-3">🏆</div>
            <p className="text-stone-400 text-sm">{t('clasificacion.noPointsYet')}</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,5rem)_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-stone-200 text-[11px] sm:text-xs font-semibold text-stone-500 uppercase tracking-wider">
              <div>#</div>
              <div>{t('clasificacion.colPlayer')}</div>
              <div className="hidden sm:block text-center">{t('clasificacion.colExact')}</div>
              <div className="hidden sm:block text-center">{t('clasificacion.colCorrect')}</div>
              <div className="hidden sm:block text-center">{t('clasificacion.colTotal')}</div>
              <div className="text-right">{t('clasificacion.colPts')}</div>
            </div>
            <div className="divide-y divide-stone-200">
              {standings.map(entry => {
                const isMe  = entry.id === user.id
                const isTop = entry.position <= 3
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedProfile(entry)}
                    className={`grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(3,5rem)_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 items-center transition-colors cursor-pointer ${
                      isMe ? 'bg-amber-500/5 hover:bg-amber-500/10 active:bg-amber-500/15' : 'hover:bg-stone-100/60 active:bg-stone-100'
                    }`}
                  >
                    <div className="font-bold text-base">
                      {isTop
                        ? MEDALS[entry.position - 1]
                        : <span className="text-stone-500 text-sm">#{entry.position}</span>
                      }
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar url={entry.avatar_url} username={entry.username} size="md" isMe={isMe} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {entry.role === 'admin' && <span className="text-xs flex-shrink-0">👑</span>}
                          <span className={`font-medium truncate ${isMe ? 'text-amber-500' : 'text-stone-900'}`}>
                            {entry.username}
                          </span>
                          {isMe && <span className="text-xs text-amber-500/60 flex-shrink-0">{t('common.you')}</span>}
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
                      <span className="text-stone-400 text-xs ml-0.5">{t('common.pts')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </>
    )
  }, [user.id, myLeagueStats, setSelectedProfile, t])

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900">{t('clasificacion.title')}</h2>
          <p className="text-stone-400 text-xs sm:text-sm mt-0.5 sm:mt-1">
            {t('clasificacion.subtitle')}
          </p>
        </div>
        {tab === 'league' && activeLeague?.role === 'admin' && (
          <div className="flex-shrink-0 card p-2.5 sm:p-3 text-center min-w-[110px] sm:min-w-[140px]">
            <p className="text-[10px] sm:text-xs text-stone-500 mb-0.5 sm:mb-1">{t('league.leagueCodeLabel')}</p>
            <p className="font-mono font-bold text-amber-400 tracking-widest text-sm sm:text-lg">{activeLeague.invite_code}</p>
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

      {loadError && (
        <div className="card p-4 bg-red-50 border-red-200 text-center space-y-2">
          <p className="text-red-700 text-sm font-medium">⚠️ {loadError}</p>
          <button
            onClick={() => { tab === 'global' ? loadGlobal() : tab === 'league' ? loadLeague() : loadCompanies() }}
            className="btn-secondary text-sm"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {loading ? (
        <StandingsSkeleton />
      ) : (
        <>
          {/* ── Global ── */}
          {tab === 'global' && (
            <>
              <p className="text-stone-400 text-sm -mt-2">
                {t('clasificacion.nParticipants', { n: globalStandings.length, s: globalStandings.length !== 1 ? 's' : '' })}
              </p>
              <IndividualTable standings={globalStandings} />
            </>
          )}

          {/* ── Mi Liga ── */}
          {tab === 'league' && (
            <>
              {leagues.length === 0 ? (
                <div className="card p-6 sm:p-10 text-center space-y-3 sm:space-y-4">
                  <div className="text-3xl sm:text-4xl">🏆</div>
                  <p className="text-stone-700 font-medium text-sm sm:text-base">{t('clasificacion.noLeague')}</p>
                  <p className="text-stone-500 text-xs sm:text-sm">{t('clasificacion.noLeagueDesc')}</p>
                  <button onClick={() => setShowModal(true)} className="btn-primary">{t('clasificacion.createOrJoinBtn')}</button>
                </div>
              ) : (
                <>
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
                    {t('clasificacion.nParticipantsLeague', { name: activeLeague?.name, n: leagueStandings.length, s: leagueStandings.length !== 1 ? 's' : '' })}
                  </p>
                  <IndividualTable standings={leagueStandings} showStats />
                  <p className="text-center text-stone-400 text-xs">
                    {t('clasificacion.leaguePointsNote')}
                  </p>
                </>
              )}
            </>
          )}

          {/* ── Empresas ── */}
          {tab === 'companies' && (
            <>
              <p className="text-stone-400 text-sm -mt-2">
                {t('clasificacion.companiesSubtitle', { n: companyStandings.length, s: companyStandings.length !== 1 ? 's' : '' })}
              </p>
              {companyStandings.length === 0 ? (
                <div className="card p-6 sm:p-10 text-center">
                  <div className="text-3xl sm:text-4xl mb-3">🏢</div>
                  <p className="text-stone-400 text-sm">{t('clasificacion.noCompanies')}</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem] sm:grid-cols-[3rem_1fr_6rem_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-stone-200 text-[11px] sm:text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    <div>#</div>
                    <div>{t('clasificacion.colCompany')}</div>
                    <div className="text-center">{t('clasificacion.colMembers')}</div>
                    <div className="text-right">{t('clasificacion.colAvg')}</div>
                  </div>
                  <div className="divide-y divide-stone-200">
                    {companyStandings.map(entry => {
                      const isTop       = entry.position <= 3
                      const isMyCompany = entry.hasMe
                      return (
                        <div
                          key={entry.name}
                          className={`grid grid-cols-[2rem_1fr_3.5rem_3.5rem] sm:grid-cols-[3rem_1fr_6rem_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 items-center transition-colors ${
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-medium truncate text-sm ${isMyCompany ? 'text-amber-500' : 'text-stone-900'}`}>
                                {entry.name}
                              </span>
                              {isMyCompany && (
                                <span className="text-[10px] sm:text-xs text-amber-500/70 bg-amber-500/10 px-1.5 rounded flex-shrink-0">{t('clasificacion.yourCompany')}</span>
                              )}
                            </div>
                            <div className="text-[11px] sm:text-xs text-stone-400 mt-0.5 truncate">
                              {t('clasificacion.topPlayer', { name: entry.top?.username ?? '—' })}
                              {(entry.top?.total_points ?? 0) > 0 && ` · ${entry.top.total_points} ${t('common.pts')}`}
                            </div>
                          </div>
                          <div className="text-center text-stone-500 text-xs sm:text-sm tabular-nums">
                            {entry.count}
                          </div>
                          <div className="text-right">
                            <span className={`text-base sm:text-lg font-bold ${isTop ? 'text-amber-400' : 'text-stone-900'}`}>
                              {entry.avg % 1 === 0 ? entry.avg : entry.avg.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <p className="text-center text-stone-400 text-xs">
                {t('clasificacion.companyScoreNote')}
              </p>
            </>
          )}
        </>
      )}

      {showModal && createPortal(<LeagueModal onClose={() => setShowModal(false)} />, document.body)}

      {selectedProfile && createPortal(
        <ProfileModal
          profile={selectedProfile}
          currentUserId={user.id}
          onClose={() => setSelectedProfile(null)}
        />,
        document.body
      )}
    </div>
  )
}
