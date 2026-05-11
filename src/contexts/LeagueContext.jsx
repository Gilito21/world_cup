import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase, sq } from '../lib/supabase'
import { useAuth } from './AuthContext'

const LeagueContext = createContext({})

const dlog = (...args) => console.log('[DEBUG][League]', new Date().toISOString().slice(11, 23), ...args)

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function LeagueProvider({ children }) {
  const { user }  = useAuth()
  const [leagues, setLeagues]           = useState([])
  const [activeLeague, setActiveLeagueState] = useState(null)
  const [loading, setLoading]           = useState(true)
  const loadingRef = useRef(true)

  useEffect(() => { loadingRef.current = loading }, [loading])

  const loadLeagues = useCallback(async () => {
    dlog('loadLeagues START user=', user?.id ?? null)
    if (!user) { dlog('no user → wipe'); setLeagues([]); setActiveLeagueState(null); setLoading(false); return }

    try {
      const { data } = await sq(
        supabase
          .from('league_members')
          .select('role, prediction_mode, leagues(id, name, invite_code, created_by)')
          .eq('user_id', user.id)
      )

      dlog('loadLeagues data?', !!data, 'count=', data?.length ?? null)
      // On timeout data is null — keep whatever was already loaded rather than wiping leagues
      if (!data) return

      const list = data.map(m => ({ ...m.leagues, role: m.role, prediction_mode: m.prediction_mode ?? 'global' }))
      setLeagues(list)

      const savedId = localStorage.getItem(`porra-league-${user.id}`)
      const saved   = list.find(l => l.id === savedId)
      setActiveLeagueState(prev => {
        if (prev && list.find(l => l.id === prev.id)) return list.find(l => l.id === prev.id)
        return saved ?? list[0] ?? null
      })
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    dlog('useEffect[loadLeagues] FIRED → setLoading(true)')
    setLoading(true)
    loadLeagues()
  }, [loadLeagues])

  // Safety: force-unblock league loading when the user returns to the tab,
  // in case a background network call was throttled or suspended by Chrome.
  useEffect(() => {
    const handleVisibility = () => {
      dlog('visibility →', document.visibilityState, 'loadingRef=', loadingRef.current)
      if (document.visibilityState === 'visible' && loadingRef.current) {
        setTimeout(() => { if (loadingRef.current) { dlog('safety 5s → setLoading(false)'); setLoading(false) } }, 5000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Join pending league from invite link after login/register
  useEffect(() => {
    if (!user) return
    const pendingCode = sessionStorage.getItem('porra-invite-code')
    if (!pendingCode) return
    sessionStorage.removeItem('porra-invite-code')
    async function joinPending() {
      try {
        const { data: league } = await supabase
          .from('leagues').select('*').eq('invite_code', pendingCode).single()
        if (!league) return
        await supabase.from('league_members')
          .insert({ league_id: league.id, user_id: user.id, role: 'member' })
        await loadLeagues()
      } catch { /* already member or invalid code — silently ignore */ }
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

    if (error || !league) throw new Error('Código de liga inválido o no encontrado.')

    // Comprobar si ya es miembro
    const already = leagues.find(l => l.id === league.id)
    if (already) throw new Error('Ya eres miembro de esta liga.')

    const { error: memberError } = await supabase
      .from('league_members')
      .insert({ league_id: league.id, user_id: user.id, role: 'member' })

    if (memberError) {
      if (memberError.code === '23505') throw new Error('Ya eres miembro de esta liga.')
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
