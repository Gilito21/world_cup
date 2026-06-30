// update-results
//
// Llamado cada 5 min por pg_cron vía pg_net.
// Obtiene partidos ±3 días desde football-data.org y actualiza la tabla
// `matches`. El trigger on_match_finished de Supabase recalcula los
// puntos de pronóstico automáticamente.
//
// Los advance_points (bonus de avance de ronda) siguen calculándose
// aparte en GitHub Actions (compute-advance-points.js), menos frecuente
// pero suficiente (solo cambian al final de cada ronda).
//
// Variables de entorno necesarias (Supabase Dashboard → Edge Functions → Secrets):
//   FOOTBALL_API_KEY   — clave de football-data.org
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY — provistos automáticamente

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const WC_ID = 'WC'

function mapStatus(s: string): string {
  return ({ SCHEDULED: 'scheduled', TIMED: 'scheduled', IN_PLAY: 'live', PAUSED: 'live', FINISHED: 'finished', AWARDED: 'finished' } as Record<string, string>)[s] ?? 'scheduled'
}

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const FOOTBALL_KEY = Deno.env.get('FOOTBALL_API_KEY')
  const SUPA_URL     = Deno.env.get('SUPABASE_URL')
  const SUPA_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!FOOTBALL_KEY || !SUPA_URL || !SUPA_KEY) {
    console.error('Missing env vars: FOOTBALL_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    return json({ error: 'env_not_configured' }, 500)
  }

  const now  = new Date()
  const from = new Date(now.getTime() - 3 * 86400_000).toISOString().slice(0, 10)
  const to   = new Date(now.getTime() + 1 * 86400_000).toISOString().slice(0, 10)

  const apiRes = await fetch(
    `https://api.football-data.org/v4/competitions/${WC_ID}/matches?dateFrom=${from}&dateTo=${to}`,
    { headers: { 'X-Auth-Token': FOOTBALL_KEY } }
  )

  if (!apiRes.ok) {
    const err = await apiRes.text()
    console.error(`football-data ${apiRes.status}: ${err}`)
    return json({ error: `api_${apiRes.status}` }, 502)
  }

  const { matches } = await apiRes.json() as { matches: unknown[] }
  const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

  let updated = 0
  let errors  = 0

  for (const m of matches as Record<string, unknown>[]) {
    const newStatus    = mapStatus(m.status as string)
    const score        = m.score as Record<string, Record<string, number | null>> | null
    // For ET/penalty matches, regularTime holds the 90-min score; fullTime is post-ET.
    const newHomeScore = score?.regularTime?.home ?? score?.fullTime?.home ?? null
    const newAwayScore = score?.regularTime?.away ?? score?.fullTime?.away ?? null
    const rawWinner    = score?.winner as string | null | undefined
    const newWinner    = rawWinner === 'HOME_TEAM' ? 'home' : rawWinner === 'AWAY_TEAM' ? 'away' : null

    if (newStatus === 'scheduled' && newHomeScore === null) continue

    const { error } = await supabase
      .from('matches')
      .update({ status: newStatus, home_score: newHomeScore, away_score: newAwayScore, winner: newWinner, updated_at: now.toISOString() })
      .eq('external_id', m.id)

    if (error) { console.error(`match ${m.id}:`, error.message); errors++ }
    else updated++
  }

  console.log(`[update-results] ${updated} updated · ${errors} errors · ${matches.length} in window`)
  return json({ ok: true, updated, errors, total: matches.length })
})
