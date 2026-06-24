import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase, sq } from '../lib/supabase'
import { getCache, setCache } from '../lib/dataCache'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import usePullRefresh from '../lib/usePullRefresh'
import LeagueModal from '../components/LeagueModal'
import LeagueFeed from '../components/LeagueFeed'
import PrizePotCard from '../components/PrizePotCard'
import Spinner from '../components/Spinner'
import { StandingsSkeleton } from '../components/Skeleton'
import { EditorialBand } from '../components/Editorial'
import { Flag, teamName } from '../utils/teams'
import { ADVANCE_STAGES } from '../utils/tournament'

const ADVANCE_RANK = Object.fromEntries(ADVANCE_STAGES.map((s, i) => [s, i + 1]))

const MEDALS = ['🥇', '🥈', '🥉']
const STANDINGS_LS_TTL = 10 * 60 * 1000 // 10 min

function readLsStandings(leagueId) {
  try {
    const raw = localStorage.getItem(`porra-lb:${leagueId}`)
    if (!raw) return null
    const { d, ts } = JSON.parse(raw)
    return Date.now() - ts < STANDINGS_LS_TTL ? d : null
  } catch { return null }
}

function writeLsStandings(leagueId, data) {
  try { localStorage.setItem(`porra-lb:${leagueId}`, JSON.stringify({ d: data, ts: Date.now() })) } catch {}
}

// ─── STAT BADGE ──────────────────────────────────────────────────────────────

function StatBadge({ label, value }) {
  return (
    <div className="text-center px-2.5 py-1.5 border border-ink/20">
      <div className="font-display text-base text-ink leading-none tabular-nums">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink/60 mt-1">{label}</div>
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
          isMe ? 'border-2 border-ink/60' : 'border border-ink/20'
        }`}
      />
    )
  }
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
      isMe
        ? 'bg-ink text-cream border-2 border-ink'
        : 'bg-paper border border-ink/30 text-ink/80'
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
      className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
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
                <h3 className="text-lg font-bold text-ink truncate">{profile.username}</h3>
                {isMe && (
                  <span className="text-xs text-ink/80 bg-cream border border-ink/20 px-1.5 rounded flex-shrink-0">{t('common.you')}</span>
                )}
              </div>
              {profile.company && (
                <p className="text-sm text-ink/60 mt-0.5 truncate">🏢 {profile.company}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink/50 hover:text-ink/70 transition-colors text-2xl leading-none flex-shrink-0 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Best league stats */}
        <div>
          <p className="text-xs text-ink/50 mb-3 font-medium uppercase tracking-wider">
            {loading
              ? t('clasificacion.loading')
              : stats?.leagueName
                ? t('clasificacion.bestLeague', { name: stats.leagueName })
                : t('clasificacion.globalPreds')}
          </p>
          {loading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <StatBadge label={t('clasificacion.statPoints')}  value={stats.points}  color="text-ink" />
              <StatBadge label={t('clasificacion.statExact')}   value={stats.exact}   color="text-ink" />
              <StatBadge label={t('clasificacion.statCorrect')} value={stats.correct} color="text-blue-400" />
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
  const [myAdvanceGlobal, setMyAdvanceGlobal]   = useState({})
  const [myAdvanceLeague, setMyAdvanceLeague]   = useState({})
  const [loading, setLoading]           = useState(false)
  const [loadError, setLoadError]       = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [prizeResults, setPrizeResults] = useState([])

  useEffect(() => { if (tab === 'global')    loadGlobal()    }, [tab])
  useEffect(() => { if (tab === 'league')    loadLeague()    }, [tab, activeLeague?.id])
  useEffect(() => { if (tab === 'companies') loadCompanies() }, [tab])

  // Pull-to-refresh: reload whatever tab is currently visible.
  usePullRefresh(useCallback(() => {
    if (tab === 'global')   return loadGlobal()
    if (tab === 'league')   return loadLeague()
    return loadCompanies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeLeague?.id]))

  // Realtime: refresh the current tab when match scores change (drives the
  // points trigger) or when a prediction is upserted (immediately visible
  // to other members of the same league). One subscription per tab keeps
  // things simple — when the tab changes the channel is recreated.
  useEffect(() => {
    function reloadCurrent() {
      if (tab === 'global')   return loadGlobal()
      if (tab === 'league')   return loadLeague()
      return loadCompanies()
    }
    const channel = supabase
      .channel(`clasificacion-${tab}-${activeLeague?.id ?? 'none'}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        reloadCurrent)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'predictions' },
        reloadCurrent)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'special_predictions' },
        reloadCurrent)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'advance_points' },
        reloadCurrent)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activeLeague?.id])

  // ── Global ───────────────────────────────────────────────────────────────

  async function loadGlobal() {
    const cached = getCache('lb:global')
    if (cached) setGlobalStandings(cached)
    else setLoading(true)
    setLoadError('')
    try {
      const [{ data: profiles, error }, { data: advanceRows }, { data: statsRows }] = await Promise.all([
        sq(supabase.from('profiles')
          .select('id, username, total_points, avatar_url, company')
          .eq('email_confirmed', true)
          .order('total_points', { ascending: false })
          // Desempate estable: dos usuarios con los mismos puntos no
          // deben intercambiar posiciones entre realtime refreshes.
          .order('username', { ascending: true })),
        // Bonus de avance del ámbito GLOBAL (league_id NULL). Se suman al
        // total mostrado y obligan a re-ordenar el array por el nuevo total.
        sq(supabase.from('advance_points')
          .select('user_id, team, stage, points')
          .is('league_id', null)),
        // Desglose exactos/aciertos del ámbito global, calculado en servidor
        // (RPC global_standings) para no traerse miles de predicciones.
        sq(supabase.rpc('global_standings')),
      ])

      if (profiles) {
        const advanceByUser = {}
        ;(advanceRows ?? []).forEach(r => {
          advanceByUser[r.user_id] = (advanceByUser[r.user_id] ?? 0) + (r.points ?? 0)
        })

        const statsByUser = Object.fromEntries(
          (statsRows ?? []).map(s => [s.user_id, s])
        )

        // Breakdown por equipo para el usuario logueado (ámbito global).
        const myAdvance = {}
        ;(advanceRows ?? []).forEach(r => {
          if (r.user_id !== user.id) return
          const rank = ADVANCE_RANK[r.stage] ?? 0
          if (!myAdvance[r.team]) myAdvance[r.team] = { points: 0, rank: 0 }
          myAdvance[r.team].points += (r.points ?? 0)
          if (rank > myAdvance[r.team].rank) myAdvance[r.team].rank = rank
        })
        setMyAdvanceGlobal(myAdvance)

        const next = profiles
          .map(p => {
            const total = (p.total_points ?? 0) + (advanceByUser[p.id] ?? 0)
            const st    = statsByUser[p.id] ?? { exact: 0, correct: 0, total: 0 }
            return {
              ...p,
              league_points: total,
              stats: { exact: st.exact ?? 0, correct: st.correct ?? 0, total: st.total ?? 0 },
            }
          })
          .sort((a, b) =>
            b.league_points - a.league_points ||
            (b.stats?.exact ?? 0) - (a.stats?.exact ?? 0) ||
            (a.username ?? '').localeCompare(b.username ?? '')
          )
          .map((p, i) => ({ ...p, position: i + 1 }))
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
    // El listado de standings es público dentro de la liga y se cachea
    // bajo `lb:league:<id>`. `myStats` es PERSONAL: se cachea bajo una
    // clave que incluye user.id para que dos usuarios en la misma liga
    // y mismo navegador no vean las estadísticas del otro (bug detectado
    // por la auditoría de bugs cross-user).
    const cacheKey   = `lb:league:${activeLeague.id}`
    const myStatsKey = `lb:league:${activeLeague.id}:my:${user.id}`
    const cached       = getCache(cacheKey) ?? readLsStandings(activeLeague.id)
    const cachedMyStats = getCache(myStatsKey)
    if (cached) {
      setLeagueStandings(cached)
      setCache(cacheKey, cached)
      const myRow = cached.find(r => r.id === user.id)
      setMyLeagueStats(cachedMyStats ?? myRow?.stats ?? { exact: 0, correct: 0 })
    } else {
      setLoading(true)
    }
    setLoadError('')
    try {
      const { data: members } = await sq(
        supabase.from('league_members').select('user_id, role, prediction_mode').eq('league_id', activeLeague.id)
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
      const myMode    = members.find(m => m.user_id === user.id)?.prediction_mode ?? 'global'

      const [{ data: standings }, { data: profiles }, { data: myPerLigaPred }] = await Promise.all([
        // Ranking calculado en el servidor (función league_standings): una fila
        // por miembro en vez de traer miles de predicciones al navegador. Evita
        // los timeouts de sq() que en móvil dejaban la liga a 0 al abrir la app.
        // La función ya aplica el ámbito correcto (per_league con predicciones
        // en la liga → ámbito liga; resto → global) sin doble conteo.
        sq(supabase.rpc('league_standings', { p_league_id: activeLeague.id })),
        sq(supabase.from('profiles').select('id, username, avatar_url, company').in('id', memberIds)),
        // ¿El usuario logueado tiene predicciones en ámbito liga? Determina el
        // ámbito de su desglose de avance (mismo criterio que la función).
        sq(supabase.from('predictions').select('id')
          .eq('user_id', user.id).eq('league_id', activeLeague.id).limit(1)),
      ])

      // Si el ranking no llegó (timeout), conserva lo que ya se muestra (caché)
      // en vez de pintar ceros y cachearlos.
      if (standings === null) {
        if (!cached) setLoadError(t('clasificacion.loadError'))
        return
      }

      const statsByUser = Object.fromEntries(standings.map(s => [s.user_id, s]))

      // Desglose de puntos de avance del usuario logueado (panel informativo).
      const myScopeLeagueId = (myMode === 'per_league' && (myPerLigaPred ?? []).length > 0)
        ? activeLeague.id : null
      const { data: myAdvanceRows } = await sq(
        supabase.from('advance_points').select('team, stage, points, league_id')
          .or(`league_id.eq.${activeLeague.id},league_id.is.null`)
          .eq('user_id', user.id)
      )
      const myAdvance = {}
      ;(myAdvanceRows ?? []).forEach(r => {
        if ((r.league_id ?? null) !== myScopeLeagueId) return
        const rank = ADVANCE_RANK[r.stage] ?? 0
        if (!myAdvance[r.team]) myAdvance[r.team] = { points: 0, rank: 0 }
        myAdvance[r.team].points += (r.points ?? 0)
        if (rank > myAdvance[r.team].rank) myAdvance[r.team].rank = rank
      })
      setMyAdvanceLeague(myAdvance)

      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

      const result = members
        .map(member => {
          const profile = profileMap[member.user_id] ?? {}
          const st      = statsByUser[member.user_id] ?? { points: 0, exact: 0, correct: 0, total: 0 }
          return {
            id:            member.user_id,
            username:      profile.username,
            avatar_url:    profile.avatar_url ?? null,
            company:       profile.company ?? null,
            role:          member.role,
            league_points: st.points ?? 0,
            stats:         { exact: st.exact ?? 0, correct: st.correct ?? 0, total: st.total ?? 0 },
          }
        })
        // Sort por puntos desc; en empate, más exactos; si sigue igual,
        // desempate estable por username para que la posición no parpadee
        // entre renders al recalcular.
        .sort((a, b) =>
          b.league_points - a.league_points ||
          (b.stats?.exact ?? 0) - (a.stats?.exact ?? 0) ||
          (a.username ?? '').localeCompare(b.username ?? '')
        )
        .map((entry, i) => ({ ...entry, position: i + 1 }))

      setLeagueStandings(result)
      const me = result.find(r => r.id === user.id)
      const myStats = me?.stats ?? { exact: 0, correct: 0, total: 0 }
      if (me) setMyLeagueStats(myStats)
      setCache(cacheKey, result)
      setCache(myStatsKey, myStats)
      writeLsStandings(activeLeague.id, result)

      // Cargar resultados de premios si la liga tiene bote configurado
      if (activeLeague.entry_fee || activeLeague.prize_rules?.length > 0) {
        const { data: prizeData } = await supabase
          .from('league_prize_results')
          .select('rule_id, winner_id, locked')
          .eq('league_id', activeLeague.id)
        if (prizeData?.length) {
          const usernameById = Object.fromEntries(result.map(r => [r.id, r.username]))
          setPrizeResults(prizeData.map(r => ({
            ...r,
            winner_username: usernameById[r.winner_id] ?? null,
          })))
        } else {
          setPrizeResults([])
        }
      }
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
          .eq('email_confirmed', true)
          .not('company', 'is', null).neq('company', '')
      )

      if (!profiles) {
        if (!cached) setLoadError(t('clasificacion.loadError'))
        return
      }

      const companyMap = {}
      for (const p of profiles) {
        const key = p.company.toLowerCase()
        if (!companyMap[key]) companyMap[key] = { displayCounts: {}, members: [] }
        companyMap[key].members.push(p)
        companyMap[key].displayCounts[p.company] = (companyMap[key].displayCounts[p.company] ?? 0) + 1
      }

      const result = Object.values(companyMap)
        .map(({ displayCounts, members }) => {
          const name    = Object.entries(displayCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
          const sorted  = [...members].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
          const avg     = members.reduce((s, m) => s + (m.total_points ?? 0), 0) / members.length
          const hasMe   = members.some(m => m.id === user.id)
          return { name, count: members.length, avg, top: sorted[0], hasMe }
        })
        // Desempate estable por nombre cuando dos empresas tienen la
        // misma media: evita parpadeo de posiciones tras realtime refresh.
        .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name))
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
            className="card px-3 py-2.5 border-ink/30 bg-paper cursor-pointer hover:border-ink/50 transition-colors flex items-center gap-2.5"
            onClick={() => setSelectedProfile(myEntry)}
          >
            <Avatar url={myEntry.avatar_url} username={myEntry.username} size="md" isMe />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-sm text-ink truncate">{myEntry.username}</span>
                <span className="text-[10px] text-ink/70 bg-cream border border-ink/20 px-1 rounded">{t('common.you')}</span>
                {myEntry.role === 'admin' && <span className="text-xs">👑</span>}
              </div>
              <div className="text-[11px] text-ink/40 mt-0.5 flex items-center gap-2">
                <span>{t('clasificacion.positionLabel', { n: myEntry.position })}</span>
                {showStats && (
                  <>
                    <span className="text-ink/20">·</span>
                    <span className="text-ink/60">{myLeagueStats.exact} {t('clasificacion.statExact').toLowerCase()}</span>
                    <span className="text-ink/20">·</span>
                    <span className="text-blue-400">{myLeagueStats.correct} {t('clasificacion.statCorrect').toLowerCase()}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xl font-bold text-ink">{myEntry.league_points}</span>
              <span className="text-[10px] text-ink/50 ml-0.5">{t('common.pts')}</span>
            </div>
          </div>
        )}

        {standings.length === 0 ? (
          <div className="card p-6 sm:p-10 text-center">
            <div className="text-3xl sm:text-4xl mb-3">🏆</div>
            <p className="text-ink/50 text-sm">{t('clasificacion.noPointsYet')}</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(2,5rem)_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-ink/20 text-[11px] sm:text-xs font-semibold text-ink/60 uppercase tracking-wider">
              <div>#</div>
              <div>{t('clasificacion.colPlayer')}</div>
              <div className="hidden sm:block text-center">{t('clasificacion.colExact')}</div>
              <div className="hidden sm:block text-center">{t('clasificacion.colCorrect')}</div>
              <div className="text-right">{t('clasificacion.colPts')}</div>
            </div>
            <div className="divide-y divide-ink/20">
              {standings.map(entry => {
                const isMe  = entry.id === user.id
                const isTop = entry.position <= 3
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedProfile(entry)}
                    className={`grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[3rem_1fr_repeat(2,5rem)_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 items-center transition-colors cursor-pointer ${
                      isMe ? 'bg-paper-200 hover:bg-paper active:bg-cream' : 'hover:bg-paper/60 active:bg-paper'
                    }`}
                  >
                    <div className="font-bold text-base">
                      {isTop
                        ? MEDALS[entry.position - 1]
                        : <span className="text-ink/60 text-sm">#{entry.position}</span>
                      }
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar url={entry.avatar_url} username={entry.username} size="md" isMe={isMe} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {entry.role === 'admin' && <span className="text-xs flex-shrink-0">👑</span>}
                          <span className={`font-medium truncate ${isMe ? 'text-ink font-bold' : 'text-ink/80'}`}>
                            {entry.username}
                          </span>
                          {isMe && <span className="text-xs text-ink/50 flex-shrink-0">{t('common.you')}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="hidden sm:block text-center text-ink font-semibold text-sm">
                      {entry.stats.exact}
                    </div>
                    <div className="hidden sm:block text-center text-blue-400 font-medium text-sm">
                      {entry.stats.correct}
                    </div>
                    <div className="text-right">
                      <span className={`text-lg font-bold ${isTop ? 'text-ink' : 'text-ink'}`}>
                        {entry.league_points}
                      </span>
                      <span className="text-ink/50 text-xs ml-0.5">{t('common.pts')}</span>
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

  // ── Advancement breakdown (puntos de avance del usuario logueado) ──────────

  function AdvanceBreakdown({ advance }) {
    const teams = Object.entries(advance ?? {})
      .map(([team, v]) => ({ team, points: v.points, stage: ADVANCE_STAGES[(v.rank ?? 1) - 1] }))
      .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team))
    if (teams.length === 0) return null
    return (
      <div className="bg-paper border border-ink/20 rounded-none text-ink p-3 sm:p-4 space-y-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/60">
          {t('clasificacion.advanceTitle')}
        </p>
        <div className="space-y-1.5">
          {teams.map(({ team, points, stage }) => (
            <div key={team} className="flex items-center gap-2.5">
              <Flag team={team} />
              <span className="text-sm text-ink/80 truncate flex-1 min-w-0">{teamName(team)}</span>
              <span className="text-xs text-ink/60 tabular-nums whitespace-nowrap">
                +{points} · {t(`clasificacion.reached.${stage}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="ed-mono text-terracotta text-[10px] block mb-1">// {t('clasificacion.chapter')}</span>
          <h2 className="font-display text-base sm:text-lg text-ink leading-none">{t('clasificacion.title')}</h2>
        </div>
        {tab === 'league' && activeLeague?.role === 'admin' && (
          <div className="flex-shrink-0 card px-2.5 py-1.5 text-center">
            <p className="text-[10px] text-ink/50">{t('league.leagueCodeLabel')}</p>
            <p className="font-mono font-bold text-ink tracking-widest text-sm">{activeLeague.invite_code}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-none overflow-hidden bg-paper p-1">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex-1 py-2 text-sm font-medium rounded-none transition-all duration-150 flex items-center justify-center gap-1.5 ${
              tab === id
                ? 'bg-ink text-cream shadow-sm'
                : 'text-ink/60 hover:text-ink'
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
              <p className="text-ink/50 text-sm -mt-2">
                {t('clasificacion.nParticipants', { n: globalStandings.length, s: globalStandings.length !== 1 ? 's' : '' })}
              </p>
              <IndividualTable standings={globalStandings} />
              <AdvanceBreakdown advance={myAdvanceGlobal} />
            </>
          )}

          {/* ── Mi Liga ── */}
          {tab === 'league' && (
            <>
              {leagues.length === 0 ? (
                <div className="card p-6 sm:p-10 text-center space-y-3 sm:space-y-4">
                  <div className="text-3xl sm:text-4xl">🏆</div>
                  <p className="text-ink/80 font-medium text-sm sm:text-base">{t('clasificacion.noLeague')}</p>
                  <p className="text-ink/60 text-xs sm:text-sm">{t('clasificacion.noLeagueDesc')}</p>
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
                              ? 'bg-ink text-cream'
                              : 'bg-paper text-ink/60 hover:bg-paper-200 border border-ink/30'
                          }`}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 -mt-2">
                    <p className="text-ink/50 text-sm">
                      {t('clasificacion.nParticipantsLeague', { name: activeLeague?.name, n: leagueStandings.length, s: leagueStandings.length !== 1 ? 's' : '' })}
                    </p>
                    {activeLeague && (activeLeague.entry_fee || activeLeague.prize_rules?.length > 0) && (
                      <PrizePotCard activeLeague={activeLeague} memberCount={leagueStandings.length} prizeResults={prizeResults} />
                    )}
                  </div>
                  <IndividualTable standings={leagueStandings} showStats />
                  <AdvanceBreakdown advance={myAdvanceLeague} />
                  {activeLeague && <LeagueFeed leagueId={activeLeague.id} />}
                  <p className="text-center text-ink/50 text-xs">
                    {t('clasificacion.leaguePointsNote')}
                  </p>
                </>
              )}
            </>
          )}

          {/* ── Empresas ── */}
          {tab === 'companies' && (
            <>
              <p className="text-ink/50 text-sm -mt-2">
                {t('clasificacion.companiesSubtitle', { n: companyStandings.length, s: companyStandings.length !== 1 ? 's' : '' })}
              </p>
              {companyStandings.length === 0 ? (
                <div className="card p-6 sm:p-10 text-center">
                  <div className="text-3xl sm:text-4xl mb-3">🏢</div>
                  <p className="text-ink/50 text-sm">{t('clasificacion.noCompanies')}</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem] sm:grid-cols-[3rem_1fr_6rem_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-ink/20 text-[11px] sm:text-xs font-semibold text-ink/60 uppercase tracking-wider">
                    <div>#</div>
                    <div>{t('clasificacion.colCompany')}</div>
                    <div className="text-center">{t('clasificacion.colMembers')}</div>
                    <div className="text-right">{t('clasificacion.colAvg')}</div>
                  </div>
                  <div className="divide-y divide-ink/20">
                    {companyStandings.map(entry => {
                      const isTop       = entry.position <= 3
                      const isMyCompany = entry.hasMe
                      return (
                        <div
                          key={entry.name}
                          className={`grid grid-cols-[2rem_1fr_3.5rem_3.5rem] sm:grid-cols-[3rem_1fr_6rem_5rem] gap-2 px-3 sm:px-4 py-2.5 sm:py-3.5 items-center transition-colors ${
                            isMyCompany ? 'bg-paper-200 hover:bg-paper' : 'hover:bg-paper/60'
                          }`}
                        >
                          <div className="font-bold text-base">
                            {isTop
                              ? MEDALS[entry.position - 1]
                              : <span className="text-ink/60 text-sm">#{entry.position}</span>
                            }
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-medium truncate text-sm ${isMyCompany ? 'text-ink font-bold' : 'text-ink/80'}`}>
                                {entry.name}
                              </span>
                              {isMyCompany && (
                                <span className="text-[10px] sm:text-xs text-ink/80 bg-cream border border-ink/20 px-1.5 rounded flex-shrink-0">{t('clasificacion.yourCompany')}</span>
                              )}
                            </div>
                            <div className="text-[11px] sm:text-xs text-ink/50 mt-0.5 truncate">
                              {t('clasificacion.topPlayer', { name: entry.top?.username ?? '—' })}
                              {(entry.top?.total_points ?? 0) > 0 && ` · ${entry.top.total_points} ${t('common.pts')}`}
                            </div>
                          </div>
                          <div className="text-center text-ink/60 text-xs sm:text-sm tabular-nums">
                            {entry.count}
                          </div>
                          <div className="text-right">
                            <span className={`text-base sm:text-lg font-bold ${isTop ? 'text-ink' : 'text-ink'}`}>
                              {entry.avg % 1 === 0 ? entry.avg : entry.avg.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <p className="text-center text-ink/50 text-xs">
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
