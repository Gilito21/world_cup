import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const LeagueContext = createContext({})

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function LeagueProvider({ children }) {
  const { user }  = useAuth()
  const [leagues, setLeagues]           = useState([])
  const [activeLeague, setActiveLeagueState] = useState(null)
  const [loading, setLoading]           = useState(true)

  const loadLeagues = useCallback(async () => {
    if (!user) { setLeagues([]); setActiveLeagueState(null); setLoading(false); return }

    const { data } = await supabase
      .from('league_members')
      .select('role, prediction_mode, leagues(id, name, invite_code, created_by)')
      .eq('user_id', user.id)

    const list = (data ?? []).map(m => ({ ...m.leagues, role: m.role, prediction_mode: m.prediction_mode ?? 'global' }))
    setLeagues(list)

    // Restaurar liga activa desde localStorage
    const savedId = localStorage.getItem(`porra-league-${user.id}`)
    const saved   = list.find(l => l.id === savedId)
    setActiveLeagueState(prev => {
      // Si la actual sigue en la lista, mantenerla
      if (prev && list.find(l => l.id === prev.id)) return list.find(l => l.id === prev.id)
      return saved ?? list[0] ?? null
    })
    setLoading(false)
  }, [user])

  useEffect(() => {
    setLoading(true)
    loadLeagues()
  }, [loadLeagues])

  function setActiveLeague(league) {
    setActiveLeagueState(league)
    if (league && user) {
      localStorage.setItem(`porra-league-${user.id}`, league.id)
    }
  }

  async function createLeague(name) {
    const code = generateCode()
    const { data: league, error } = await supabase
      .from('leagues')
      .insert({ name: name.trim(), invite_code: code, created_by: user.id })
      .select()
      .single()
    if (error) throw error

    await supabase
      .from('league_members')
      .insert({ league_id: league.id, user_id: user.id, role: 'admin' })

    await loadLeagues()
    // Activar la liga recién creada
    const newLeague = { ...league, role: 'admin' }
    setActiveLeague(newLeague)
    return newLeague
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
      createLeague,
      joinLeague,
      setPredictionMode,
      reloadLeagues: loadLeagues,
    }}>
      {children}
    </LeagueContext.Provider>
  )
}

export const useLeague = () => useContext(LeagueContext)
