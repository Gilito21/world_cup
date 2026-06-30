/**
 * update-results.js
 * Actualiza resultados de partidos en curso/recientes desde football-data.org
 * Ejecutar como cron job en Render cada 5 minutos durante el Mundial.
 * El trigger de Supabase recalcula automáticamente los puntos de los pronósticos.
 *
 * Requiere en variables de entorno (Render):
 *   FOOTBALL_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { computeAndStoreAdvancePoints } from './compute-advance-points.js'

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY
const SUPABASE_URL     = process.env.SUPABASE_URL
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const WC_2026_ID       = 'WC'

function mapStatus(status) {
  const map = {
    'SCHEDULED':  'scheduled',
    'TIMED':      'scheduled',
    'IN_PLAY':    'live',
    'PAUSED':     'live',
    'FINISHED':   'finished',
    'AWARDED':    'finished',
  }
  return map[status] ?? 'scheduled'
}

async function fetchRecentMatches() {
  // Pedir partidos de una ventana de ±3 días para no gastar llamadas API
  const now   = new Date()
  const from  = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const to    = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const url = `https://api.football-data.org/v4/competitions/${WC_2026_ID}/matches?dateFrom=${from}&dateTo=${to}`
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Error API (${res.status}): ${body}`)
  }

  const { matches } = await res.json()
  return matches
}

async function updateMatches(matches) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  let updated = 0
  let errors  = 0

  for (const m of matches) {
    const newStatus    = mapStatus(m.status)
    // Scores are always the 90-minute result; predictions are based on regulation time.
    // For ET/penalty matches, football-data.org puts the 90-min score in `regularTime`
    // and the cumulative ET score in `fullTime`. Fall back to fullTime for regular matches.
    const newHomeScore = m.score?.regularTime?.home ?? m.score?.fullTime?.home ?? null
    const newAwayScore = m.score?.regularTime?.away ?? m.score?.fullTime?.away ?? null
    // winner reflects who actually advanced (including ET and penalties for knockout matches).
    const rawWinner    = m.score?.winner  // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
    const newWinner    = rawWinner === 'HOME_TEAM' ? 'home' : rawWinner === 'AWAY_TEAM' ? 'away' : null

    // Solo actualizar si hay datos relevantes que cambiar
    if (newStatus === 'scheduled' && newHomeScore === null) continue

    const { error } = await supabase
      .from('matches')
      .update({
        status:     newStatus,
        home_score: newHomeScore,
        away_score: newAwayScore,
        winner:     newWinner,
        updated_at: new Date().toISOString(),
      })
      .eq('external_id', m.id)

    if (error) {
      console.error(`Error actualizando partido ${m.id}:`, error.message)
      errors++
    } else {
      updated++
    }
  }

  return { updated, errors }
}

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] Actualizando resultados...`)

  if (!FOOTBALL_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Variables de entorno incompletas')
    process.exit(1)
  }

  try {
    const matches = await fetchRecentMatches()
    console.log(`📡 ${matches.length} partidos en la ventana temporal`)

    const { updated, errors } = await updateMatches(matches)
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)

    console.log(`✅ ${updated} actualizados · ${errors} errores · ${elapsed}s`)

    // Recalcula el bonus de avance (puntos por acertar que un equipo pasa de
    // ronda). Va aparte y no debe tumbar el cron si falla.
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
      const r = await computeAndStoreAdvancePoints(supabase)
      console.log(`🏅 advance_points: ${r.rows} filas en ${r.scopes} ámbitos`)
    } catch (e) {
      console.error('⚠️ advance_points falló (no crítico):', e.message)
    }
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

main()
