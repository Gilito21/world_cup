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

// When a browser tab is in the background, Chrome throttles WebSocket / fetch
// activity. The Supabase auth client can be left in a state where the next
// query hangs until the JWT is refreshed. Proactively refreshing the session
// the moment the tab becomes visible again avoids this.
let lastHiddenAt = 0
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenAt = Date.now()
      return
    }
    // Only refresh if the tab was actually away for a while (>20s).
    // Brief alt-tabs don't need a refresh and would just add latency.
    if (Date.now() - lastHiddenAt < 20_000) return
    // Fire-and-forget: refreshSession resolves quickly with the new token,
    // unblocking any subsequent queries that would otherwise hang.
    supabase.auth.refreshSession().catch(() => {})
  })
}
