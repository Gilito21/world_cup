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

    console.log('[porra:auth] init — calling getSession()')
    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      const nextId = session?.user?.id ?? null
      console.log('[porra:auth] getSession resolved — user:', nextId ?? 'none', '| userIdRef was:', userIdRef.current ?? 'none')
      if (userIdRef.current === nextId) {
        // Ya nos enteramos antes por onAuthStateChange (Supabase dispara
        // SIGNED_IN restaurando la sesión de localStorage casi al instante).
        console.log('[porra:auth] getSession early-return (already handled by onAuthStateChange)')
        if (!session?.user) setLoading(false)
        return
      }
      userIdRef.current = nextId
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        console.log('[porra:auth] getSession → no session, loading=false')
        setLoading(false)
      }
    }).catch((e) => {
      console.error('[porra:auth] getSession ERROR', e)
      clearTimeout(timeout)
      setLoading(false)
    })

    // OJO: este callback NO debe ser async ni llamar a Supabase directamente.
    // onAuthStateChange se ejecuta MIENTRAS GoTrue tiene cogido el auth lock;
    // si dentro hacemos `await fetchProfile()` (que lanza supabase.from(...)),
    // esa query espera el mismo lock → DEADLOCK hasta el timeout de sq() (15s),
    // y con ella se cuelgan TODAS las demás queries (leagues, preds). Pasaba en
    // cada refresh donde SIGNED_IN ganaba la carrera a getSession(). Fix:
    // callback síncrono + diferir el trabajo con setTimeout(0), que saca
    // fetchProfile del contexto del lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[porra:auth] onAuthStateChange event:', event, '| user:', session?.user?.id ?? 'none')
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
      if (userIdRef.current === nextId) {
        console.log('[porra:auth] onAuthStateChange skipped (same userId)')
        return
      }

      userIdRef.current = nextId
      setUser(nextUser)

      if (nextUser) {
        console.log('[porra:auth] onAuthStateChange → fetchProfile (deferred) for', nextId)
        // Diferido fuera del auth lock — ver comentario sobre el deadlock arriba.
        setTimeout(() => fetchProfile(nextId), 0)
      } else {
        console.log('[porra:auth] onAuthStateChange → signed out')
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
    if (fetchingRef.current) {
      console.log('[porra:auth] fetchProfile skipped (already in-flight)')
      return
    }
    fetchingRef.current = true
    // Desbloquear la UI inmediatamente si hay datos en cache, sin esperar la red.
    // Esto cubre el path donde onAuthStateChange (SIGNED_IN) se dispara antes
    // de que resuelva getSession() y no tendría acceso al cache de otro modo.
    const cached = readCachedProfile(userId)
    if (cached) {
      console.log('[porra:auth] fetchProfile → profile cache HIT → loading=false')
      setProfile(cached)
      setLoading(false)
    } else {
      console.log('[porra:auth] fetchProfile → profile cache MISS, waiting for network…')
    }
    const t0 = Date.now()
    try {
      const { data } = await sq(
        supabase.from('profiles').select('*').eq('id', userId).single()
      )
      console.log(`[porra:auth] fetchProfile network done in ${Date.now() - t0}ms —`, data ? 'OK' : 'TIMEOUT/null')
      if (data) { setProfile(data); writeCachedProfile(data) }
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }

  async function signUp(email, password, username, company, inviteCode) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // invite_code en metadata sobrevive entre dispositivos: si el usuario
        // confirma el email desde otro móvil, LeagueContext aún puede unirlo.
        data: { username, company: company || null, ...(inviteCode ? { invite_code: inviteCode } : {}) },
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
      if (user?.id) {
        localStorage.removeItem(`porra-leagues-cache:${user.id}`)
        // Clear user-scoped extras predictions cache
        const prefix = `porra-extras-preds:${user.id}:`
        const toRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k?.startsWith(prefix)) toRemove.push(k)
        }
        toRemove.forEach(k => localStorage.removeItem(k))
      }
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
