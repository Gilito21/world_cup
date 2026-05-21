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

const rankDesc = map => Object.entries(map).sort(([, a], [, b]) => b - a).map(([id]) => id)
const rankAsc  = map => Object.entries(map).sort(([, a], [, b]) => a - b).map(([id]) => id)

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

  const preds   = await loadPreds(globalIds, leagueIds, leagueId)
  const staged  = preds.map(p => ({ ...p, stage: matchStage[p.match_id] }))
  const specials = await loadSpecials(globalIds, leagueIds, leagueId)

  const extrasPts = {}
  for (const sp of specials) extrasPts[sp.user_id] = (extrasPts[sp.user_id] ?? 0) + (sp.points_earned ?? 0)

  const upserts = []
  for (const rule of rules) {
    const winner = computeWinner(rule.trigger, allIds, staged, extrasPts, specials)
    if (!winner) continue
    upserts.push({
      league_id:   leagueId,
      rule_id:     rule.id,
      trigger_key: rule.trigger,
      winner_id:   winner,
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

async function loadPreds(globalIds, leagueIds, leagueId) {
  const res = []
  if (globalIds.length) {
    const { data } = await supabase.from('predictions')
      .select('user_id, match_id, points_earned, home_score, away_score')
      .in('user_id', globalIds).is('league_id', null)
    if (data) res.push(...data)
  }
  if (leagueIds.length) {
    const { data } = await supabase.from('predictions')
      .select('user_id, match_id, points_earned, home_score, away_score')
      .in('user_id', leagueIds).eq('league_id', leagueId)
    if (data) res.push(...data)
  }
  return res
}

async function loadSpecials(globalIds, leagueIds, leagueId) {
  const res = []
  if (globalIds.length) {
    const { data } = await supabase.from('special_predictions')
      .select('user_id, question_key, points_earned')
      .in('user_id', globalIds).is('league_id', null)
    if (data) res.push(...data)
  }
  if (leagueIds.length) {
    const { data } = await supabase.from('special_predictions')
      .select('user_id, question_key, points_earned')
      .in('user_id', leagueIds).eq('league_id', leagueId)
    if (data) res.push(...data)
  }
  return res
}

// ─── lógica de cálculo ────────────────────────────────────────────────────────

function computeWinner(trigger, allIds, preds, extrasPts, specials) {
  const score = Object.fromEntries(allIds.map(id => [id, 0]))

  if (CUMUL[trigger]) {
    const stages = new Set(CUMUL[trigger])
    for (const p of preds) if (stages.has(p.stage)) score[p.user_id] += p.points_earned ?? 0
    const ranked = rankDesc(score)
    return ranked[trigger.endsWith('_2nd') ? 1 : 0] ?? null
  }

  switch (trigger) {
    case 'best_groups_only': {
      for (const p of preds) if (p.stage === 'group') score[p.user_id] += p.points_earned ?? 0
      return rankDesc(score)[0] ?? null
    }
    case 'best_knockouts_only': {
      for (const p of preds) if (KNOCKOUT.has(p.stage)) score[p.user_id] += p.points_earned ?? 0
      return rankDesc(score)[0] ?? null
    }
    case 'final_1st': case 'final_2nd': case 'final_3rd': case 'final_4th': case 'final_last': {
      for (const p of preds)   score[p.user_id]  += p.points_earned  ?? 0
      for (const sp of specials) score[sp.user_id] = (score[sp.user_id] ?? 0) + (sp.points_earned ?? 0)
      if (trigger === 'final_last') return rankAsc(score)[0] ?? null
      return rankDesc(score)[{ final_1st: 0, final_2nd: 1, final_3rd: 2, final_4th: 3 }[trigger]] ?? null
    }
    case 'most_exact': {
      for (const p of preds) if (p.points_earned === 3) score[p.user_id]++
      return rankDesc(score)[0] ?? null
    }
    case 'most_correct': {
      for (const p of preds) if (p.points_earned === 1) score[p.user_id]++
      return rankDesc(score)[0] ?? null
    }
    case 'most_submitted': {
      for (const p of preds) if (p.home_score !== null && p.away_score !== null) score[p.user_id]++
      return rankDesc(score)[0] ?? null
    }
    case 'best_extras': {
      for (const [id, pts] of Object.entries(extrasPts)) score[id] = pts
      return rankDesc(score)[0] ?? null
    }
    case 'predicted_winner': {
      const w = specials.filter(sp =>
        sp.question_key?.toLowerCase().includes('winner') && (sp.points_earned ?? 0) > 0
      )
      return w[0]?.user_id ?? null
    }
    case 'predicted_topscorer': {
      const w = specials.filter(sp =>
        (sp.question_key?.toLowerCase().includes('scorer')    ||
         sp.question_key?.toLowerCase().includes('goleador')  ||
         sp.question_key?.toLowerCase().includes('topscorer')) &&
        (sp.points_earned ?? 0) > 0
      )
      return w[0]?.user_id ?? null
    }
    default: return null
  }
}

main().catch(e => { console.error('[prize] ERROR:', e); process.exit(1) })
