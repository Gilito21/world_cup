import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const TIMEOUT_ERROR = { message: 'Request timeout', code: 'TIMEOUT' }

// Wraps a Supabase query with a safety timeout. Returns a proper error on timeout
// so callers can distinguish "timed out" from "success with null data".
export function sq(query, ms = 15000) {
  return Promise.race([
    query,
    new Promise(resolve => setTimeout(() => resolve({ data: null, error: TIMEOUT_ERROR }), ms)),
  ])
}
