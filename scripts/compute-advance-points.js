/**
 * compute-advance-points.js
 * Recalcula el bonus de avance (puntos por acertar que un equipo pasa de ronda)
 * y lo persiste en `advance_points`. Reusa el motor puro de src/utils/tournament.js
 * (el bracket predicho de cada usuario solo se puede calcular en JS).
 *
 * Idempotente: refresca la tabla entera en cada pasada. Se invoca al final de
 * update-results.js (cron) y también puede correrse a mano:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/compute-advance-points.js
 *
 * Ámbito por fila = igual que predictions: league_id NULL (global) o league_id=X.
 */

import { createClient } from '@supabase/supabase-js'
import { computeAdvanceRows } from '../src/utils/tournament.js'

async function fetchAll(query) {
  // Pagina en bloques de 1000 (límite por defecto de PostgREST).
  const out = []
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return out
}

export async function computeAndStoreAdvancePoints(supabase) {
  const matches = await fetchAll(
    supabase.from('matches').select('id, stage, group_name, home_team, away_team, home_score, away_score, status, winner, match_date')
  )
  const preds = await fetchAll(
    supabase.from('predictions').select('user_id, match_id, home_score, away_score, tiebreaker, league_id')
  )

  // Agrupa por ámbito (user_id, league_id) → predMap por match_id.
  const scopes = new Map() // key → { user_id, league_id, predMap }
  for (const p of preds) {
    const key = `${p.user_id}|${p.league_id ?? 'null'}`
    let s = scopes.get(key)
    if (!s) { s = { user_id: p.user_id, league_id: p.league_id ?? null, predMap: {} }; scopes.set(key, s) }
    s.predMap[p.match_id] = { home_score: p.home_score, away_score: p.away_score, tiebreaker: p.tiebreaker ?? null }
  }

  // Calcula filas por ámbito.
  const rows = []
  for (const s of scopes.values()) {
    for (const r of computeAdvanceRows(matches, s.predMap)) {
      rows.push({
        user_id:    s.user_id,
        league_id:  s.league_id,
        team:       r.team,
        stage:      r.stage,
        points:     r.points,
        decided_on: r.decided_on,
      })
    }
  }

  // Refresco completo: borra todo y reinserta (la tabla es 100% derivada).
  const { error: delErr } = await supabase.from('advance_points').delete().not('id', 'is', null)
  if (delErr) throw delErr

  for (let i = 0; i < rows.length; i += 500) {
    const { error: insErr } = await supabase.from('advance_points').insert(rows.slice(i, i + 500))
    if (insErr) throw insErr
  }

  return { scopes: scopes.size, rows: rows.length }
}

// ── Standalone ────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && process.argv[1].endsWith('compute-advance-points.js')
if (isMain) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  computeAndStoreAdvancePoints(supabase)
    .then(r => { console.log(`✅ advance_points: ${r.rows} filas en ${r.scopes} ámbitos`); process.exit(0) })
    .catch(e => { console.error('❌', e.message); process.exit(1) })
}
