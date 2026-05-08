import { createClient } from '@supabase/supabase-js'

const supabaseUrl    = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Ejecuta una query de Supabase con un timeout de seguridad.
 * Si la query no responde en `ms` ms devuelve { data: null, error: null }
 * para que los finally blocks liberen el spinner en lugar de colgarse.
 */
export function sq(query, ms = 8000) {
  return Promise.race([
    query,
    new Promise(resolve => setTimeout(() => resolve({ data: null, error: null }), ms)),
  ])
}
