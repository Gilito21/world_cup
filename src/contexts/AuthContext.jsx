import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, sq } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(true)

  useEffect(() => { loadingRef.current = loading }, [loading])

  useEffect(() => {
    // Timeout de seguridad: si Supabase no responde en 15s, desbloquear la UI
    const timeout = setTimeout(() => setLoading(false), 15000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    }).catch(() => {
      clearTimeout(timeout)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION duplicates what getSession() already handles above
      if (event === 'INITIAL_SESSION') return
      setUser(session?.user ?? null)
      if (session?.user) {
        // TOKEN_REFRESHED solo renueva el JWT, no hace falta recargar el perfil
        if (event !== 'TOKEN_REFRESHED') {
          await fetchProfile(session.user.id)
        }
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    // Safety: when the user returns to this tab, if loading is somehow still
    // true (e.g. a background network call was throttled by Chrome), unblock
    // after 2s to avoid the infinite spinner.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && loadingRef.current) {
        setTimeout(() => { if (loadingRef.current) setLoading(false) }, 2000)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data } = await sq(
        supabase.from('profiles').select('*').eq('id', userId).single()
      )
      setProfile(data)
    } finally {
      setLoading(false)
    }
  }

  async function signUp(email, password, username, company) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, company: company || null } },
    })
    if (error) throw error
    return data
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile: () => fetchProfile(user?.id) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
