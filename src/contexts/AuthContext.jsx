import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, sq } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadingRef   = useRef(true)
  const fetchingRef  = useRef(false)

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
      // TOKEN_REFRESHED solo renueva el JWT — el user es el mismo. No reemplazar
      // la referencia evita re-renders en toda la app cada vez que Supabase
      // refresca el token (cada ~50 min y también al volver a la pestaña).
      if (event === 'TOKEN_REFRESHED') return
      const nextUser = session?.user ?? null
      // Idempotencia: si el id no cambia no tocamos la referencia para no
      // forzar re-renders innecesarios en los consumidores del contexto.
      setUser(prev => (prev?.id === nextUser?.id ? prev : nextUser))
      if (nextUser) {
        await fetchProfile(nextUser.id)
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
        setTimeout(() => { if (loadingRef.current) setLoading(false) }, 5000)
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
    // Prevent concurrent fetches (e.g. getSession + onAuthStateChange firing simultaneously)
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      const { data, error } = await sq(
        supabase.from('profiles').select('*').eq('id', userId).single()
      )
      // Only update profile when we got real data — never reset to null on timeout/error
      if (data) setProfile(data)
    } finally {
      fetchingRef.current = false
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
