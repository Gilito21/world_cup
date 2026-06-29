/**
 * reconcile-bracket.js
 * Asigna matches.bracket_match_id y recoloca las predicciones de cada ronda KO
 * EN CUANTO se conocen sus equipos reales (tras el reseed). Así el cuadro de
 * cada usuario sigue siendo fiel a lo que pronosticó, sin remapeos manuales.
 *
 * Se llama al final de seed-matches.js (que es quien trae los equipos reales).
 * Es idempotente: solo toca rondas con equipos reales y bracket_match_id NULL.
 * Si una ronda no se puede resolver limpiamente contra la plantilla (los
 * equipos no cuadran, p.ej. terceros distintos), ABORTA esa ronda sin escribir
 * nada y avisa por consola — nunca corrompe a medias.
 *
 * El remapeo atómico lo hace la función SQL apply_bracket_round_remap (mig 050).
 */

import {
  computeAllStandings, filterCompleteGroups, buildRoundOf32,
  advanceKnockoutRound, STAGE_BRACKET_IDS,
} from '../src/utils/tournament.js'

const KO_STAGES = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final']
const isTbd = t => !t || t === 'TBD' || t === 'TBA' || t === 'Por determinar'

async function fetchAll(query) {
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

export async function reconcileBracketSlots(supabase) {
  const matches = await fetchAll(
    supabase.from('matches').select('id, stage, group_name, home_team, away_team, home_score, away_score, status, winner, match_date, bracket_match_id')
  )

  // Equipos reales por hueco: R32 desde la clasificación; rondas siguientes
  // propagando los resultados de partidos KO que YA tienen bracket_match_id.
  const realStand = filterCompleteGroups(computeAllStandings(matches), matches)
  const realR32 = buildRoundOf32(realStand)
  const finishedAssigned = matches
    .filter(m => m.stage !== 'group' && m.bracket_match_id && m.home_score != null && m.away_score != null)
    .map(m => ({ ...m, id: m.bracket_match_id }))
  const advSlots = advanceKnockoutRound(finishedAssigned)

  const realTeamsForSlot = {}
  for (const s of realR32) if (!isTbd(s.homeTeam) && !isTbd(s.awayTeam)) realTeamsForSlot[s.id] = { home: s.homeTeam, away: s.awayTeam }
  for (const [sid, t] of Object.entries(advSlots)) if (t.home && t.away) realTeamsForSlot[sid] = { home: t.home, away: t.away }

  let roundsDone = 0
  for (const stage of KO_STAGES) {
    const st = matches.filter(m => m.stage === stage)
    if (!st.length) continue
    if (st.every(m => m.bracket_match_id)) continue                          // ronda ya asignada
    if (st.some(m => isTbd(m.home_team) || isTbd(m.away_team))) continue      // sin equipos reales todavía

    const slotIds = STAGE_BRACKET_IDS[stage] ?? []
    const used = new Set()
    const assign = {}                 // slotId -> { match, sameOrient }
    let ok = slotIds.length === st.length
    for (const sid of slotIds) {
      const rt = realTeamsForSlot[sid]
      if (!rt || isTbd(rt.home) || isTbd(rt.away)) { ok = false; break }
      const m = st.find(x => !used.has(x.id) &&
        ((x.home_team === rt.home && x.away_team === rt.away) ||
         (x.home_team === rt.away && x.away_team === rt.home)))
      if (!m) { ok = false; break }
      used.add(m.id)
      assign[sid] = { match: m, sameOrient: m.home_team === rt.home }
    }
    if (!ok || Object.keys(assign).length !== slotIds.length) {
      console.warn(`⚠️ reconcile: ${stage} no cuadra con la plantilla (terceros/empates distintos). Lo dejo para revisión manual.`)
      continue
    }

    // Orden por fecha = cómo los usuarios metieron sus picks (display histórico).
    const dateOrder = [...st].sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
    const pMap = slotIds.map((sid, i) => ({
      slot:   sid,
      target: assign[sid].match.id,
      source: dateOrder[i].id,
      swap:   !assign[sid].sameOrient,
    }))

    const { error } = await supabase.rpc('apply_bracket_round_remap', { p_map: pMap })
    if (error) { console.error(`❌ reconcile ${stage}:`, error.message); continue }
    console.log(`🔗 reconcile: ${stage} → bracket_match_id fijado y predicciones recolocadas (${slotIds.length} huecos)`)
    roundsDone++
  }

  if (roundsDone === 0) console.log('🔗 reconcile: nada nuevo que asignar')
  return roundsDone
}
