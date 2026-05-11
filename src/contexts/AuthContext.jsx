import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, sq } from '../lib/supabase'

const AuthContext = createContext({})

// Helper de logging (visible en DevTools → Console, filtrar por "[DEBUG]")
const dlog = (...args) => console.log('[DEBUG][Auth]', new Date().toISOString().slice(11, 23), ...args)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadingRef   = useRef(true)
  const fetchingRef  = useRef(false)
  // Trackea el último user.id que vimos. onAuthStateChange dispara SIGNED_IN
  // en cada visibilitychange aunque el usuario sea el mismo; usamos esta
  // ref para evitar refetchear profile en cada return de pestaña.
  const userIdRef    = useRef(null)

  useEffect(() => {
    loadingRef.current = loading
    dlog('loading →', loading)
  }, [loading])

  useEffect(() => {
    dlog('mount')
    // Timeout de seguridad: si Supabase no responde en 15s, desbloquear la UI
    const timeout = setTimeout(() => { dlog('15s timeout → setLoading(false)'); setLoading(false) }, 15000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      const nextId = session?.user?.id ?? null
      dlog('getSession resolved, user=', nextId)
      if (userIdRef.current === nextId) {
        // Ya nos enteramos antes por onAuthStateChange (Supabase fire SIGNED_IN
        // restaurando la sesión de localStorage casi al instante). Nada que hacer.
        dlog('getSession → SKIP (already known)')
        if (!session?.user) setLoading(false)
        return
      }
      userIdRef.current = nextId
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    }).catch((err) => {
      clearTimeout(timeout)
      dlog('getSession ERROR', err)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      dlog('onAuthStateChange event=', event, 'user=', session?.user?.id ?? null)
      // INITIAL_SESSION duplicates what getSession() already handles above
      if (event === 'INITIAL_SESSION') return
      // TOKEN_REFRESHED solo renueva el JWT — el user es el mismo. No reemplazar
      // la referencia evita re-renders en toda la app cada vez que Supabase
      // refresca el token (cada ~50 min y también al volver a la pestaña).
      if (event === 'TOKEN_REFRESHED') return

      const nextUser = session?.user ?? null
      const nextId   = nextUser?.id ?? null
      const sameUser = userIdRef.current === nextId

      if (sameUser) {
        // Supabase dispara SIGNED_IN en cada visibilitychange aunque el
        // user sea idéntico al que ya teníamos. No refetcheamos profile
        // — eso es lo que estaba colgando 8s en cada return de pestaña.
        dlog('onAuthStateChange SKIP (same user)')
        return
      }

      dlog('onAuthStateChange USER CHANGED', userIdRef.current, '→', nextId)
      userIdRef.current = nextId
      setUser(nextUser)

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
      dlog('visibility →', document.visibilityState, 'loadingRef=', loadingRef.current)
      if (document.visibilityState === 'visible' && loadingRef.current) {
        setTimeout(() => { if (loadingRef.current) { dlog('safety 5s → setLoading(false)'); setLoading(false) } }, 5000)
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
    if (fetchingRef.current) { dlog('fetchProfile SKIP (already fetching)'); return }
    fetchingRef.current = true
    dlog('fetchProfile START', userId)
    try {
      const { data, error } = await sq(
        supabase.from('profiles').select('*').eq('id', userId).single()
      )
      dlog('fetchProfile END data?', !!data, 'error?', error?.code ?? error?.message ?? null)
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
