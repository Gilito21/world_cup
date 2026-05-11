import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const TIMEOUT_ERROR = { message: 'Request timeout', code: 'TIMEOUT' }

// Wraps a Supabase query with a safety timeout. Returns a proper error on timeout
// so callers can distinguish "timed out" from "success with null data".
// 8s is long enough for slow networks but short enough that a hung query
// (e.g. after the tab was throttled by Chrome) doesn't keep the UI in a spinner.
export function sq(query, ms = 8000) {
  return Promise.race([
    query,
    new Promise(resolve => setTimeout(() => resolve({ data: null, error: TIMEOUT_ERROR }), ms)),
  ])
}

// NOTE: Antes hacíamos un refreshSession() agresivo en visibilitychange para
// "despertar" la auth tras throttling de Chrome. Pero si esa llamada fallaba
// (red lenta, token de refresco caducado…), Supabase dispara SIGNED_OUT
// internamente y se carga la sesión → el usuario aparecía sin ligas al
// volver a la pestaña. Con autoRefreshToken=true y persistSession=true,
// Supabase ya gestiona los refrescos por sí mismo cuando hace falta. Si
// alguna query queda colgada por throttling, el wrapper sq() la corta a
// los 8s y preserva el estado existente.

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    console.log('[DEBUG][SB]', new Date().toISOString().slice(11, 23), 'visibility →', document.visibilityState)
  })
}
