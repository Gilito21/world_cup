/**
 * scoreKnockout.js
 * Lógica de puntuación de eliminatorias + bonus de avance, compartida por:
 *   • scripts/compute-advance-points.js  (Node, GitHub Action horaria / seed)
 *   • supabase/functions/update-results   (Deno, edge function cada minuto)
 *
 * Solo depende de tournament.js (funciones puras). No importa createClient ni
 * usa APIs de Node/Deno concretas: recibe el cliente supabase ya construido,
 * así el mismo código corre en ambos entornos.
 *
 * Recalcula (refresco completo, idempotente):
 *   • advance_points: bonus por acertar que un equipo pasa de ronda.
 *   • predictions.points_earned de los partidos de eliminatoria, comprobando
 *     que los equipos predichos para el cruce coincidan con los reales (regla
 *     team-aware) antes de dar puntos.
 *   • total_points de los usuarios globales afectados.
 */

import { computeAdvanceRows, computePredictedKnockout } from './tournament.js'

function calculatePoints(predHome, predAway, realHome, realAway) {
  if (predHome == null || predAway == null) return 0
  if (predHome === realHome && predAway === realAway) return 3
  const pw = predHome > predAway ? 'H' : predAway > predHome ? 'A' : 'D'
  const rw = realHome > realAway ? 'H' : realAway > realHome ? 'A' : 'D'
  return pw === rw ? 1 : 0
}

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

  // ── Real knockout overlay: equipos reales por partido de eliminatoria ─────────
  // Construye el cascade usando los resultados reales como si fueran predicciones.
  const realPredMap = {}
  for (const m of matches) {
    if (m.home_score != null && m.away_score != null) {
      realPredMap[m.id] = { home_score: m.home_score, away_score: m.away_score, tiebreaker: m.winner ?? null }
    }
  }
  const realKOOverlay = computePredictedKnockout(matches, realPredMap)

  const finishedKnockout = matches.filter(
    m => m.stage !== 'group' && m.status === 'finished' && m.home_score != null && m.away_score != null
  )
  const koMatches = matches.filter(m => m.stage !== 'group')

  // ── Calcula filas de advance_points + puntuación de eliminatorias ─────────────
  const apRows = []
  const predUpdates = []
  const cruceRows = []            // cache de cruces pronosticados (para el trigger)
  const affectedGlobalUsers = new Set()

  for (const s of scopes.values()) {
    // Advance points (bonus de avance de ronda)
    for (const r of computeAdvanceRows(matches, s.predMap)) {
      apRows.push({
        user_id:    s.user_id,
        league_id:  s.league_id,
        team:       r.team,
        stage:      r.stage,
        points:     r.points,
        decided_on: r.decided_on,
      })
    }

    const userKO = computePredictedKnockout(matches, s.predMap)

    // Cachea el cruce que este usuario espera en cada partido KO (lo consume el
    // trigger on_match_finished para puntuar al instante). Solo cuando tiene
    // ambos equipos resueltos en su cuadro.
    for (const km of koMatches) {
      const u = userKO[km.id]
      if (u?.homeTeam && u?.awayTeam) {
        cruceRows.push({ user_id: s.user_id, league_id: s.league_id, match_id: km.id, home_team: u.homeTeam, away_team: u.awayTeam })
      }
    }

    // Puntuación de pronósticos de eliminatoria
    for (const m of finishedKnockout) {
      const pred = s.predMap[m.id]
      if (!pred) continue
      const real = realKOOverlay[m.id]
      const user = userKO[m.id]
      // Solo puntúa si los equipos predichos coinciden con los reales.
      const teamsMatch = real?.homeTeam && user?.homeTeam &&
        real.homeTeam === user.homeTeam && real.awayTeam === user.awayTeam
      const pts = teamsMatch
        ? calculatePoints(pred.home_score, pred.away_score, m.home_score, m.away_score)
        : 0
      predUpdates.push({ match_id: m.id, user_id: s.user_id, league_id: s.league_id, pts })
      if (s.league_id === null) affectedGlobalUsers.add(s.user_id)
    }
  }

  // ── Refresco completo de advance_points ───────────────────────────────────────
  const { error: delErr } = await supabase.from('advance_points').delete().not('id', 'is', null)
  if (delErr) throw delErr
  for (let i = 0; i < apRows.length; i += 500) {
    const { error } = await supabase.from('advance_points').insert(apRows.slice(i, i + 500))
    if (error) throw error
  }

  // ── Refresco completo de predicted_ko_cruces (cache para el trigger) ──────────
  const { error: delCruceErr } = await supabase.from('predicted_ko_cruces').delete().not('match_id', 'is', null)
  if (delCruceErr) throw delCruceErr
  for (let i = 0; i < cruceRows.length; i += 500) {
    const { error } = await supabase.from('predicted_ko_cruces').insert(cruceRows.slice(i, i + 500))
    if (error) throw error
  }

  // ── Actualiza points_earned de pronósticos de eliminatoria ───────────────────
  let predOk = 0, predErr = 0
  for (const u of predUpdates) {
    const q = supabase.from('predictions')
      .update({ points_earned: u.pts, updated_at: new Date().toISOString() })
      .eq('match_id', u.match_id)
      .eq('user_id', u.user_id)
    const { error } = u.league_id === null
      ? await q.is('league_id', null)
      : await q.eq('league_id', u.league_id)
    if (error) { console.error(`pred update (${u.user_id}/${u.match_id}):`, error.message); predErr++ }
    else predOk++
  }

  // ── Recalcula total_points para usuarios globales afectados ───────────────────
  let usersRecalculated = 0
  if (affectedGlobalUsers.size > 0) {
    const userIds = [...affectedGlobalUsers]
    const { error } = await supabase.rpc('recalc_total_points_for_users', { user_ids: userIds })
    if (error) console.error('recalc_total_points_for_users:', error.message)
    else usersRecalculated = userIds.length
  }

  return { scopes: scopes.size, rows: apRows.length, cruces: cruceRows.length, predOk, predErr, usersRecalculated }
}
