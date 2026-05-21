import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase, sq } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useLang } from './LangContext'

const LeagueContext = createContext({})

function readCachedLeagues(userId) {
  try {
    const raw = localStorage.getItem(`porra-leagues-cache:${userId}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function writeCachedLeagues(userId, list) {
  try { localStorage.setItem(`porra-leagues-cache:${userId}`, JSON.stringify(list)) } catch {}
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function LeagueProvider({ children }) {
  const { user }  = useAuth()
  const { t }     = useLang()
  const [leagues, setLeagues]           = useState([])
  const [activeLeague, setActiveLeagueState] = useState(null)
  const [loading, setLoading]           = useState(true)
  // True once leagues have been confirmed for the current user (cache or network).
  // Stays false during the window where auth has resolved but leagues haven't
  // loaded yet — prevents consumers from running with stale activeLeague=null.
  const [ready, setReady]               = useState(false)
  const loadingRef = useRef(true)

  useEffect(() => { loadingRef.current = loading }, [loading])

  const loadLeagues = useCallback(async () => {
    if (!user) {
      console.log('[porra:league] loadLeagues → no user, skip')
      setLeagues([]); setActiveLeagueState(null); setLoading(false); return
      // Note: don't setReady(true) here — no-user state is not "ready for this user"
    }

    // Desbloquear la UI con datos en cache antes de ir a la red
    const cachedList = readCachedLeagues(user.id)
    if (cachedList) {
      console.log('[porra:league] loadLeagues → cache HIT', cachedList.length, 'leagues')
      setLeagues(cachedList)
      const savedId = localStorage.getItem(`porra-league-${user.id}`)
      const saved   = cachedList.find(l => l.id === savedId)
      setActiveLeagueState(prev => {
        if (prev && cachedList.find(l => l.id === prev.id)) return cachedList.find(l => l.id === prev.id)
        return saved ?? cachedList[0] ?? null
      })
      setLoading(false)
      setReady(true)  // leagues confirmed from cache — unblock consumers immediately
    } else {
      console.log('[porra:league] loadLeagues → cache MISS, waiting for network…')
    }

    const t0 = Date.now()
    try {
      const { data } = await sq(
        supabase
          .from('league_members')
          .select('role, prediction_mode, leagues(id, name, invite_code, created_by)')
          .eq('user_id', user.id)
      )
      console.log(`[porra:league] loadLeagues network done in ${Date.now() - t0}ms —`, data ? `${data.length} rows` : 'TIMEOUT/null')

      // On timeout data is null — keep whatever was already loaded rather than wiping leagues
      if (!data) return

      const list = data.map(m => ({ ...m.leagues, role: m.role, prediction_mode: m.prediction_mode ?? 'global' }))
      setLeagues(list)
      writeCachedLeagues(user.id, list)

      const savedId = localStorage.getItem(`porra-league-${user.id}`)
      const saved   = list.find(l => l.id === savedId)
      setActiveLeagueState(prev => {
        if (prev && list.find(l => l.id === prev.id)) return list.find(l => l.id === prev.id)
        return saved ?? list[0] ?? null
      })
    } finally {
      setLoading(false)
      setReady(true)  // leagues confirmed from network (or timed out — unblock either way)
    }
  }, [user?.id])

  useEffect(() => {
    setReady(false)  // reset for new user before leagues load
    setLoading(true)
    loadLeagues()
  }, [loadLeagues])

  // Safety: force-unblock league loading when the user returns to the tab,
  // in case a background network call was throttled or suspended by Chrome.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && loadingRef.current) {
        setTimeout(() => { if (loadingRef.current) setLoading(false) }, 5000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Join pending league from invite link after login/register
  useEffect(() => {
    if (!user) return
    const pendingCode = localStorage.getItem('porra-invite-code')
    if (!pendingCode) return
    localStorage.removeItem('porra-invite-code')
    async function joinPending() {
      try {
        const { data: league } = await supabase
          .from('leagues').select('*').eq('invite_code', pendingCode).single()
        if (!league) return
        const { count } = await supabase
          .from('league_members')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', league.id)
        if (count >= 40) return // liga llena — no se puede unir
        const { error } = await supabase.from('league_members')
          .insert({ league_id: league.id, user_id: user.id, role: 'member' })
        if (error && error.code !== '23505') return // 23505 = ya es miembro
        await loadLeagues()
      } catch { /* código inválido — ignorar */ }
    }
    joinPending()
  }, [user?.id])

  function setActiveLeague(league) {
    setActiveLeagueState(league)
    if (league && user) {
      localStorage.setItem(`porra-league-${user.id}`, league.id)
    }
  }

  // Llamado por PaymentModal después de que la edge function haya creado
  // la liga server-side. Refresca el contexto y deja la nueva como activa.
  async function onLeagueCreated(league) {
    await loadLeagues()
    setActiveLeague({ ...league, role: 'admin' })
    return league
  }

  async function setPredictionMode(mode) {
    if (!activeLeague || !user) return
    const { error } = await supabase
      .from('league_members')
      .update({ prediction_mode: mode })
      .eq('league_id', activeLeague.id)
      .eq('user_id', user.id)
    if (error) throw error

    const updated = { ...activeLeague, prediction_mode: mode }
    setLeagues(prev => prev.map(l => l.id === activeLeague.id ? updated : l))
    setActiveLeagueState(updated)
  }

  async function joinLeague(code) {
    const { data: league, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('invite_code', code.toUpperCase().trim())
      .single()

    if (error || !league) throw new Error(t('league.invalidCode'))

    // Comprobar si ya es miembro
    const already = leagues.find(l => l.id === league.id)
    if (already) { const e = new Error(t('league.alreadyMember')); e.code = 'already_member'; throw e }

    // Comprobar aforo antes de insertar
    const { count } = await supabase
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id)
    if (count >= 40) { const e = new Error(t('league.full')); e.code = 'league_full'; throw e }

    const { error: memberError } = await supabase
      .from('league_members')
      .insert({ league_id: league.id, user_id: user.id, role: 'member' })

    if (memberError) {
      if (memberError.code === '23505')  { const e = new Error(t('league.alreadyMember')); e.code = 'already_member'; throw e }
      if (memberError.message?.includes('league_full')) { const e = new Error(t('league.full')); e.code = 'league_full'; throw e }
      throw memberError
    }

    await loadLeagues()
    const joined = { ...league, role: 'member' }
    setActiveLeague(joined)
    return joined
  }

  return (
    <LeagueContext.Provider value={{
      leagues,
      activeLeague,
      loading,
      leaguesReady: ready,
      setActiveLeague,
      onLeagueCreated,
      joinLeague,
      setPredictionMode,
      reloadLeagues: loadLeagues,
    }}>
      {children}
    </LeagueContext.Provider>
  )
}

export const useLeague = () => useContext(LeagueContext)
