/**
 * compute-advance-points.js
 * Recalcula el bonus de avance (puntos por acertar que un equipo pasa de ronda)
 * y lo persiste en `advance_points`. Reusa el motor puro de src/utils/tournament.js
 * (el bracket predicho de cada usuario solo se puede calcular en JS).
 *
 * Además puntúa los pronósticos de partidos de eliminatoria, comprobando que
 * los equipos predichos para ese cruce coincidan con los reales antes de dar pts.
 *
 * Idempotente: refresca la tabla entera en cada pasada. Se invoca al final de
 * update-results.js (cron) y también puede correrse a mano:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/compute-advance-points.js
 *
 * Ámbito por fila = igual que predictions: league_id NULL (global) o league_id=X.
 */

import { createClient } from '@supabase/supabase-js'
import { computeAndStoreAdvancePoints } from '../src/utils/scoreKnockout.js'

export { computeAndStoreAdvancePoints }

// ── Standalone ────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && process.argv[1].endsWith('compute-advance-points.js')
if (isMain) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  computeAndStoreAdvancePoints(supabase)
    .then(r => {
      console.log(`✅ advance_points: ${r.rows} filas en ${r.scopes} ámbitos`)
      console.log(`✅ knockout preds: ${r.predOk} OK · ${r.predErr} errores · ${r.usersRecalculated} usuarios recalculados`)
      process.exit(0)
    })
    .catch(e => { console.error('❌', e.message); process.exit(1) })
}
