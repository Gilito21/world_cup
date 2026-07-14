/**
 * resolve-prizes.js
 * Calcula y persiste ganadores de premios por liga.
 * Corre automáticamente tras update-results (vía workflow_run).
 *
 * Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[prize] faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Stages acumulados para triggers de "líder al finalizar X fase"
const CUMUL = {
  after_groups_1st: ['group'],
  after_groups_2nd: ['group'],
  after_r32_1st:    ['group', 'round_of_32'],
  after_r16_1st:    ['group', 'round_of_32', 'round_of_16'],
  after_qf_1st:     ['group', 'round_of_32', 'round_of_16', 'quarter_final'],
  after_sf_1st:     ['group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final'],
}

// Qué stage debe completarse para marcar el resultado como definitivo (locked)
const LOCK_AT = {
  after_groups_1st:    'group',
  after_groups_2nd:    'group',
  best_groups_only:    'group',
  after_r32_1st:       'round_of_32',
  after_r16_1st:       'round_of_16',
  after_qf_1st:        'quarter_final',
  after_sf_1st:        'semi_final',
  final_1st:           'final',
  final_2nd:           'final',
  final_last:          'final',
  final_3rd:           'third_place',
  final_4th:           'third_place',
  best_knockouts_only: 'final',
  most_exact:          'final',
  most_correct:        'final',
  most_submitted:      'final',
  best_extras:         'final',
  predicted_winner:    'final',
  predicted_topscorer: 'final',
}

const KNOCKOUT = new Set(['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final', 'third_place'])

// Triggers de "puesto en la clasificación final": los resolvemos con el mismo
// ranking que ve el usuario (RPC league_standings), no recalculando aquí, para
// que el premio "Nº clasificado" nunca diverja de la clasificación.
const FINAL_TRIGGERS = new Set(['final_1st', 'final_2nd', 'final_3rd', 'final_4th', 'final_last'])

// Ganador(es) de un superlativo en la posición `pos` (0 = líder, 1 = segundo).
// Orden idéntico al de la clasificación: métrica desc, puntos de la clasificación
// desc y, como último recurso, username asc. El reparto a medias solo entra
// cuando queda un empate REAL —misma métrica Y mismos puntos— que ninguno de los
// desempates previos rompe: entonces devolvemos a TODOS los empatados en vez de
// quedarnos con el alfabéticamente primero. Con métricas/puntos distintos
// devuelve un único id, como antes.
const superlativeWinners = (map, pointsById, nameById, pos = 0) => {
  const ordered = Object.entries(map)
    .map(([id, metric]) => ({ id, metric, pts: pointsById.get(id) ?? -Infinity }))
    .sort((a, b) =>
      b.metric - a.metric ||
      b.pts - a.pts ||
      (nameById.get(a.id) ?? '').localeCompare(nameById.get(b.id) ?? ''))
  const anchor = ordered[pos]
  if (!anchor) return []
  return ordered
    .filter(o => o.metric === anchor.metric && o.pts === anchor.pts)
    .map(o => o.id)
}

// PostgREST tope implícito de 1000 filas. Sin paginar, una liga con muchas
// predicciones (26 miembros × decenas de partidos > 1000) se truncaba en
// silencio y los premios salían sobre datos parciales. Iteramos hasta agotar.
async function fetchAllPages(build) {
  const PAGE = 1000
  const all = []
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) return all
  }
  throw new Error('[prize] fetchAllPages superó 50 páginas')
}

// Ganador(es) del puesto N en la clasificación final. `ranked` viene ordenado
// igual que la pantalla (puntos desc, username asc) e incluye advance_points.
// El único criterio real de un puesto es la puntuación: si varios empatan en
// puntos con el que ocupa ese puesto, se reparte entre todos (el username, que
// hoy decide, deja de desempatar). Con puntos distintos devuelve un solo id.
function finalWinners(trigger, ranked) {
  if (!ranked.length) return []
  const idx = trigger === 'final_last'
    ? ranked.length - 1
    : { final_1st: 0, final_2nd: 1, final_3rd: 2, final_4th: 3 }[trigger]
  const anchor = ranked[idx]
  if (!anchor) return []
  return ranked.filter(r => r.points === anchor.points).map(r => r.id)
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { data: matches } = await supabase.from('matches').select('id, stage, status')
  if (!matches) { console.error('[prize] no se pudieron cargar partidos'); return }

  const byStage = {}
  for (const m of matches) (byStage[m.stage] ??= []).push(m)
  const done = Object.fromEntries(
    Object.entries(byStage).map(([s, ms]) => [s, ms.length > 0 && ms.every(m => m.status === 'finished')])
  )
  const matchStage = Object.fromEntries(matches.map(m => [m.id, m.stage]))
  console.log('[prize] fases completas:', Object.keys(done).filter(k => done[k]).join(', ') || 'ninguna')

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, prize_rules')
    .not('prize_rules', 'eq', '[]')

  if (!leagues?.length) { console.log('[prize] ninguna liga con bote'); return }
  console.log(`[prize] procesando ${leagues.length} liga(s)`)

  for (const league of leagues) {
    const rules = (Array.isArray(league.prize_rules) ? league.prize_rules : [])
      .filter(r => r.trigger && r.trigger !== 'custom')
    if (!rules.length) continue

    const { data: existing } = await supabase
      .from('league_prize_results')
      .select('rule_id, locked')
      .eq('league_id', league.id)

    const lockedIds = new Set((existing ?? []).filter(r => r.locked).map(r => r.rule_id))
    const pending   = rules.filter(r => !lockedIds.has(r.id))
    if (!pending.length) continue

    await processLeague(league.id, pending, matchStage, done)
  }
  console.log('[prize] done')
}

// ─── per-league ────────────────────────────────────────────────────────────────

async function processLeague(leagueId, rules, matchStage, done) {
  const { data: members } = await supabase
    .from('league_members').select('user_id, prediction_mode').eq('league_id', leagueId)
  if (!members?.length) return

  // prediction_mode: null/'global' → predicciones globales (league_id IS NULL)
  //                  cualquier otro valor → predicciones de la liga
  const globalIds = members.filter(m => !m.prediction_mode || m.prediction_mode === 'global').map(m => m.user_id)
  const leagueIds = members.filter(m => m.prediction_mode && m.prediction_mode !== 'global').map(m => m.user_id)
  const allIds    = members.map(m => m.user_id)

  // Usernames para desempate estable (mismo criterio que Clasificacion.jsx).
  const nameById = await loadUsernames(allIds)

  // Ranking de puesto idéntico al que ve el usuario: el RPC league_standings
  // suma predictions + special_predictions + advance_points en el ámbito
  // correcto. Lo ordenamos igual que la pantalla (puntos desc, username asc).
  const { data: standings } = await supabase.rpc('league_standings', { p_league_id: leagueId })
  const ranked = (standings ?? [])
    .map(s => ({ id: s.user_id, points: s.points ?? 0 }))
    .sort((a, b) => b.points - a.points || (nameById.get(a.id) ?? '').localeCompare(nameById.get(b.id) ?? ''))
  // Puntos de la clasificación por usuario: desempatan los superlativos (mismo
  // criterio que la pantalla) y definen los puestos finales.
  const pointsById = new Map(ranked.map(r => [r.id, r.points]))

  const preds    = (await loadPreds(globalIds, leagueIds, leagueId)).map(p => ({ ...p, stage: matchStage[p.match_id] }))
  const specials = await loadSpecials(globalIds, leagueIds, leagueId)

  const extrasPts = {}
  for (const sp of specials) extrasPts[sp.user_id] = (extrasPts[sp.user_id] ?? 0) + (sp.points_earned ?? 0)

  const upserts = []
  for (const rule of rules) {
    const winners = FINAL_TRIGGERS.has(rule.trigger)
      ? finalWinners(rule.trigger, ranked)
      : computeWinners(rule.trigger, allIds, preds, extrasPts, specials, pointsById, nameById)
    if (!winners.length) continue
    // Orden estable de los ganadores (por username) para que winner_id/winner_ids
    // no bailen entre runs cuando hay reparto.
    const ordered = [...new Set(winners)].sort((a, b) =>
      (nameById.get(a) ?? '').localeCompare(nameById.get(b) ?? ''))
    upserts.push({
      league_id:   leagueId,
      rule_id:     rule.id,
      trigger_key: rule.trigger,
      winner_id:   ordered[0],
      winner_ids:  ordered,
      locked:      done[LOCK_AT[rule.trigger]] ?? false,
      resolved_at: new Date().toISOString(),
    })
  }

  if (!upserts.length) return
  const { error } = await supabase
    .from('league_prize_results')
    .upsert(upserts, { onConflict: 'league_id,rule_id' })
  if (error) console.error(`[prize] liga ${leagueId} error:`, error.message)
  else console.log(`[prize] liga ${leagueId}: ${upserts.length} resultado(s)`)
}

async function loadUsernames(ids) {
  if (!ids.length) return new Map()
  const { data } = await supabase.from('profiles').select('id, username').in('id', ids)
  return new Map((data ?? []).map(p => [p.id, p.username ?? '']))
}

async function loadPreds(globalIds, leagueIds, leagueId) {
  const cols = 'id, user_id, match_id, points_earned, home_score, away_score'
  const res = []
  if (globalIds.length) {
    res.push(...await fetchAllPages(() => supabase.from('predictions')
      .select(cols).in('user_id', globalIds).is('league_id', null).order('id')))
  }
  if (leagueIds.length) {
    res.push(...await fetchAllPages(() => supabase.from('predictions')
      .select(cols).in('user_id', leagueIds).eq('league_id', leagueId).order('id')))
  }
  return res
}

async function loadSpecials(globalIds, leagueIds, leagueId) {
  const cols = 'id, user_id, question_key, points_earned'
  const res = []
  if (globalIds.length) {
    res.push(...await fetchAllPages(() => supabase.from('special_predictions')
      .select(cols).in('user_id', globalIds).is('league_id', null).order('id')))
  }
  if (leagueIds.length) {
    res.push(...await fetchAllPages(() => supabase.from('special_predictions')
      .select(cols).in('user_id', leagueIds).eq('league_id', leagueId).order('id')))
  }
  return res
}

// ─── lógica de cálculo ────────────────────────────────────────────────────────

// Triggers que NO son puesto-en-clasificación (esos van por finalWinners).
// Devuelve un array de ganadores: uno normalmente, varios cuando hay empate real.
function computeWinners(trigger, allIds, preds, extrasPts, specials, pointsById, nameById) {
  const score = Object.fromEntries(allIds.map(id => [id, 0]))

  if (CUMUL[trigger]) {
    const stages = new Set(CUMUL[trigger])
    for (const p of preds) if (stages.has(p.stage)) score[p.user_id] += p.points_earned ?? 0
    return superlativeWinners(score, pointsById, nameById, trigger.endsWith('_2nd') ? 1 : 0)
  }

  switch (trigger) {
    case 'best_groups_only': {
      for (const p of preds) if (p.stage === 'group') score[p.user_id] += p.points_earned ?? 0
      return superlativeWinners(score, pointsById, nameById)
    }
    case 'best_knockouts_only': {
      for (const p of preds) if (KNOCKOUT.has(p.stage)) score[p.user_id] += p.points_earned ?? 0
      return superlativeWinners(score, pointsById, nameById)
    }
    case 'most_exact': {
      for (const p of preds) if (p.points_earned === 3) score[p.user_id]++
      return superlativeWinners(score, pointsById, nameById)
    }
    case 'most_correct': {
      for (const p of preds) if (p.points_earned === 1) score[p.user_id]++
      return superlativeWinners(score, pointsById, nameById)
    }
    case 'most_submitted': {
      for (const p of preds) if (p.home_score !== null && p.away_score !== null) score[p.user_id]++
      return superlativeWinners(score, pointsById, nameById)
    }
    case 'best_extras': {
      for (const [id, pts] of Object.entries(extrasPts)) score[id] = pts
      return superlativeWinners(score, pointsById, nameById)
    }
    // "Predijo el campeón / máximo goleador" no es un ranking: gana cualquiera
    // que acertase. Si varios acertaron, todos reparten.
    case 'predicted_winner': {
      return specials
        .filter(sp => sp.question_key?.toLowerCase().includes('winner') && (sp.points_earned ?? 0) > 0)
        .map(sp => sp.user_id)
    }
    case 'predicted_topscorer': {
      return specials
        .filter(sp =>
          (sp.question_key?.toLowerCase().includes('scorer')    ||
           sp.question_key?.toLowerCase().includes('goleador')  ||
           sp.question_key?.toLowerCase().includes('topscorer')) &&
          (sp.points_earned ?? 0) > 0)
        .map(sp => sp.user_id)
    }
    default: return []
  }
}

main().catch(e => { console.error('[prize] ERROR:', e); process.exit(1) })
