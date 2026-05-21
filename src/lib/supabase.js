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
// 15s: when the access token is expired, Supabase JS queues all queries until the
// refresh network call completes (~8s). With 8s we were timing out before the
// refresh finished; 15s gives the refresh time to complete and the query to execute.
// The UI is never blocked waiting for this (caches serve data instantly), so the
// longer timeout only affects background refresh quality, not perceived performance.
export function sq(query, ms = 15000) {
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
