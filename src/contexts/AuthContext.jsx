import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase, sq } from '../lib/supabase'
import { appUrl } from '../lib/appUrl'
import { invalidateCache } from '../lib/dataCache'
import { setMatchCache } from '../lib/matchCache'

const PROFILE_CACHE_KEY = 'porra-profile-cache'

function readCachedProfile(userId) {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    return obj?.id === userId ? obj : null
  } catch { return null }
}

function writeCachedProfile(profile) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)) } catch {}
}

const AuthContext = createContext({})

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

  useEffect(() => { loadingRef.current = loading }, [loading])

  useEffect(() => {
    // Timeout de seguridad: si Supabase no responde en 15s, desbloquear la UI
    const timeout = setTimeout(() => setLoading(false), 15000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      const nextId = session?.user?.id ?? null
      if (userIdRef.current === nextId) {
        // Ya nos enteramos antes por onAuthStateChange (Supabase dispara
        // SIGNED_IN restaurando la sesión de localStorage casi al instante).
        if (!session?.user) setLoading(false)
        return
      }
      userIdRef.current = nextId
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else setLoading(false)
    }).catch(() => {
      clearTimeout(timeout)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION duplicates what getSession() already handles above
      if (event === 'INITIAL_SESSION') return
      // TOKEN_REFRESHED solo renueva el JWT — el user es el mismo.
      if (event === 'TOKEN_REFRESHED') return

      const nextUser = session?.user ?? null
      const nextId   = nextUser?.id ?? null

      // Supabase dispara SIGNED_IN en cada visibilitychange aunque el user
      // sea el mismo que ya teníamos. Si el id coincide no refetcheamos —
      // eso es lo que provocaba que cada return de pestaña tardase 8s y se
      // viera spinner / "no estás en ninguna liga".
      if (userIdRef.current === nextId) return

      userIdRef.current = nextId
      setUser(nextUser)

      if (nextUser) {
        await fetchProfile(nextUser.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    // Safety: si por lo que sea loading sigue en true cuando vuelves a la
    // pestaña, desbloquear tras 5s para evitar spinner infinito.
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
    // Evita fetches concurrentes (e.g. getSession + onAuthStateChange a la vez)
    if (fetchingRef.current) return
    fetchingRef.current = true
    // Desbloquear la UI inmediatamente si hay datos en cache, sin esperar la red.
    // Esto cubre el path donde onAuthStateChange (SIGNED_IN) se dispara antes
    // de que resuelva getSession() y no tendría acceso al cache de otro modo.
    const cached = readCachedProfile(userId)
    if (cached) { setProfile(cached); setLoading(false) }
    try {
      const { data } = await sq(
        supabase.from('profiles').select('*').eq('id', userId).single()
      )
      if (data) { setProfile(data); writeCachedProfile(data) }
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }

  async function signUp(email, password, username, company) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, company: company || null },
        emailRedirectTo: appUrl(),
      },
    })
    if (error) throw error
    // El email al admin (notify-new-user) ya no se dispara aquí — un trigger
    // postgres (sync_email_confirmed) lo invoca vía pg_net cuando el usuario
    // confirma su email. Esto evita notificaciones por signups fake con
    // emails inventados que nunca se llegan a verificar.
    return data
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    // Limpia TODO el estado que sobrevive a un signOut y podría filtrar
    // datos / intenciones del User A al User B en el mismo navegador:
    //  - PROFILE_CACHE_KEY    : avatar/username/total_points
    //  - porra-pending-league-create / porra-invite-code : intenciones
    //    pendientes que dispararían PaymentModal o auto-join para el
    //    siguiente usuario que entre en este dispositivo
    //  - dataCache (módulo)   : preds:<uid>, sub:<uid>, lb:*, feed:*,
    //                           postmortem:*
    //  - matchCache (módulo)  : lista de partidos (pública, pero por
    //                           higiene)
    try {
      localStorage.removeItem(PROFILE_CACHE_KEY)
      localStorage.removeItem('porra-pending-league-create')
      localStorage.removeItem('porra-invite-code')
      if (user?.id) localStorage.removeItem(`porra-leagues-cache:${user.id}`)
    } catch {}
    invalidateCache()
    setMatchCache(null)
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile: () => fetchProfile(user?.id) }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
