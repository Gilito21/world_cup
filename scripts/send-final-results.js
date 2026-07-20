/**
 * send-final-results.js
 * Correo de cierre del Mundial 2026: resumen del torneo, clasificación final
 * de cada usuario en su(s) liga(s) y ganadores de premios. Personalizado.
 *
 * Uso:
 *   node scripts/send-final-results.js --preview jpelaez@bluebullpartners.com
 *   node scripts/send-final-results.js --preview jpelaez@bluebullpartners.com --as anapeman
 *   node scripts/send-final-results.js --dry-run
 *   node scripts/send-final-results.js --send-all
 *
 * Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
 *                       APP_URL, FROM_EMAIL, FROM_NAME.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { brandShell, brandButton, brandHeadline, brandKicker, brandStatTile, escHtml, BRAND } from './_brand-email.js'
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_KEY    = process.env.BREVO_API_KEY
const APP_URL      = (process.env.APP_URL ?? 'https://www.porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL   = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME    = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

const args       = new Set(process.argv.slice(2))
const prevArgIdx = process.argv.indexOf('--preview')
const previewTo  = prevArgIdx >= 0 ? process.argv[prevArgIdx + 1] : null
const asArgIdx   = process.argv.indexOf('--as')
const asUser     = asArgIdx >= 0 ? process.argv[asArgIdx + 1] : null

// ─── Datos fijos del torneo (fuente: actas ESPN FIFA.WORLD, 104 partidos) ──────
const TOURNAMENT = {
  champion:  'España',
  runnerUp:  'Argentina',
  finalScore:'1 – 0',
  third:     'Inglaterra',
  fourth:    'Francia',
  mbappe:    9,
  lamine:    1,
  mvp:       'Rodri',
  topScorer: 'Kylian Mbappé (9)',
  yellow:    267,
  red:       15,
  cards:     297,
}

const ordinal = n => `${n}º`
const fmtEur  = n => (n % 1 === 0 ? `€${n}` : `€${n.toFixed(2)}`)

// ─── Email builder ─────────────────────────────────────────────────────────────

export function buildEmail({ username, leagues }) {
  const subject   = '🏆 Se acabó el Mundial: así ha quedado la porra'
  const preheader = `España campeona, Mbappé bota de oro y tu clasificación final. Mira cómo ha quedado todo.`

  // ── Bloque: tu clasificación en cada liga ────────────────────────────────────
  const standingsBlock = leagues.map(lg => {
    const podiumTag = lg.myRank === 1 ? '🥇' : lg.myRank === 2 ? '🥈' : lg.myRank === 3 ? '🥉' : ''
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background:${BRAND.cream};border:1px solid ${BRAND.ink};margin:0 0 12px;">
      <tr>
        <td style="padding:16px 20px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:${BRAND.ink};opacity:.6;margin:0 0 6px;">${escHtml(lg.name)}</div>
          <div style="font-family:'Instrument Serif',Georgia,serif;font-size:30px;line-height:1;color:${BRAND.ink};">
            ${podiumTag ? `${podiumTag} ` : ''}${ordinal(lg.myRank)} <span style="font-size:16px;opacity:.55;">de ${lg.memberCount}</span>
          </div>
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};opacity:.7;margin-top:6px;">
            ${lg.myPoints} puntos · ${lg.myExact} exactos · ${lg.myCorrect} aciertos de tendencia
          </div>
          ${lg.myPrize ? `
          <div style="margin-top:10px;padding:8px 12px;background:${BRAND.terra};color:${BRAND.cream};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;">
            🎉 ${escHtml(lg.myPrize)}
          </div>` : ''}
        </td>
      </tr>
    </table>`
  }).join('')

  // ── Bloque: premios de cada liga con bote ────────────────────────────────────
  const prizeBlocks = leagues.filter(lg => lg.pot != null && lg.prizes.length).map(lg => {
    const rows = lg.prizes.map(pz => {
      const winners = pz.winners.length ? pz.winners.join(', ') : '—'
      const perTxt  = pz.winners.length > 1 ? `<div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:${BRAND.ink};opacity:.5;">${fmtEur(pz.perWinner)} c/u (a medias)</div>` : ''
      return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};vertical-align:top;">
          <div>${pz.emoji} ${escHtml(pz.label)}</div>
          <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:${BRAND.green};font-weight:700;margin-top:2px;">→ ${escHtml(winners)}</div>
        </td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;vertical-align:top;">
          <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:${BRAND.ink};opacity:.5;">${pz.pct}%</div>
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${BRAND.ink};">${fmtEur(pz.amount)}</div>
          ${perTxt}
        </td>
      </tr>`
    }).join('')
    return `
    <div style="margin:0 0 22px;">
      ${brandKicker(`Premios · ${lg.name}`)}
      <p style="margin:4px 0 8px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND.ink};opacity:.6;">Bote: ${fmtEur(lg.pot)} (${lg.memberCount} × ${fmtEur(lg.entryFee)})</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>
    </div>`
  }).join('')

  const content = `
${brandKicker('Mundial 2026 · Telón')}
${brandHeadline('Se acabó. 🇪🇸 España, campeona del mundo.')}

<p style="margin:0 0 20px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola ${escHtml(username)}, cae el telón del Mundial 2026. <strong>${escHtml(TOURNAMENT.champion)}</strong> se coronó ganando la final a <strong>${escHtml(TOURNAMENT.runnerUp)}</strong> por <strong>${TOURNAMENT.finalScore}</strong>. En el partido por el tercer puesto, ${escHtml(TOURNAMENT.third)} superó a ${escHtml(TOURNAMENT.fourth)}. Ya están sumados los puntos de las <strong>preguntas extra</strong> y cerrada la clasificación. Aquí va tu resumen.
</p>

<div style="margin:0 0 26px;">${brandStatTile({ kicker: 'Campeón del mundo', value: `🇪🇸 ${escHtml(TOURNAMENT.champion)}`, sub: `Final: ${escHtml(TOURNAMENT.champion)} ${TOURNAMENT.finalScore} ${escHtml(TOURNAMENT.runnerUp)} · 3º ${escHtml(TOURNAMENT.third)} · 4º ${escHtml(TOURNAMENT.fourth)}` })}</div>

<!-- Tu clasificación -->
<div style="margin:0 0 26px;">
  ${brandKicker('Tu clasificación final')}
  ${standingsBlock}
</div>

<!-- Extras resueltos -->
<div style="margin:0 0 28px;">
  ${brandKicker('Las preguntas extra, resueltas')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};">⚡ <strong>Mbappé vs Lamine</strong><div style="font-size:11px;opacity:.6;margin-top:2px;">Mbappé ${TOURNAMENT.mbappe} goles · Lamine ${TOURNAMENT.lamine}</div></td>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};text-align:right;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;color:${BRAND.terra};white-space:nowrap;">Gana Mbappé</td>
    </tr>
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};">🏅 <strong>MVP del Mundial</strong></td>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};text-align:right;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;color:${BRAND.terra};white-space:nowrap;">${escHtml(TOURNAMENT.mvp)}</td>
    </tr>
    <tr>
      <td style="padding:10px 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.ink};">🟨 <strong>Total de tarjetas</strong><div style="font-size:11px;opacity:.6;margin-top:2px;">${TOURNAMENT.yellow} amarillas + 2×${TOURNAMENT.red} rojas · gana quien más se acercó en tu liga</div></td>
      <td style="padding:10px 0;text-align:right;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;color:${BRAND.terra};white-space:nowrap;">${TOURNAMENT.cards}</td>
    </tr>
  </table>
</div>

${prizeBlocks}

${brandButton({ href: `${APP_URL}/clasificacion`, label: 'Ver la clasificación final' })}

<p style="margin:26px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.ink};opacity:.72;text-align:center;">
  Gracias por jugar. Ha sido un Mundialazo. Nos vemos en la próxima. 👋
</p>
`

  const html = brandShell({
    title: subject,
    preheader,
    content,
    footerNote: `Recibes esto porque participaste en la Porra Mundial 2026. Ajustes en ${APP_URL}/perfil`,
    appUrl: APP_URL,
  })

  return { subject, html }
}

// ─── Brevo ─────────────────────────────────────────────────────────────────────

async function sendEmail(to, toName, subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
}

// ─── Carga de datos de ligas / clasificaciones / premios ────────────────────────

const TRIGGER_META = {
  final_1st: '🥇', final_2nd: '🥈', final_3rd: '🥉', final_4th: '4️⃣', final_last: '🥄',
  most_exact: '🎯', most_correct: '✅', best_groups_only: '⚽', best_knockouts_only: '⚔️',
  best_extras: '🎲', predicted_winner: '🏆', predicted_topscorer: '⚡', most_submitted: '📝',
}

async function loadContext(supabase) {
  const { data: leagues, error: lErr } = await supabase
    .from('leagues').select('id, name, entry_fee, prize_rules')
  if (lErr) throw lErr

  const { data: members, error: mErr } = await supabase
    .from('league_members').select('league_id, user_id')
  if (mErr) throw mErr

  const { data: prizeResults, error: prErr } = await supabase
    .from('league_prize_results').select('league_id, rule_id, trigger_key, winner_ids')
  if (prErr) throw prErr

  const { data: profiles, error: pErr } = await supabase
    .from('profiles').select('id, username')
  if (pErr) throw pErr
  const nameById = new Map(profiles.map(p => [p.id, p.username ?? '']))

  // Clasificación por liga vía RPC (misma que ve el usuario, con bonus de tarjetas).
  const standingsByLeague = new Map()
  for (const lg of leagues) {
    const { data: st, error } = await supabase.rpc('league_standings', { p_league_id: lg.id })
    if (error) throw error
    const ranked = (st ?? [])
      .map(s => ({ user_id: s.user_id, points: s.points ?? 0, exact: s.exact ?? 0, correct: s.correct ?? 0 }))
      .sort((a, b) => b.points - a.points || (nameById.get(a.user_id) ?? '').localeCompare(nameById.get(b.user_id) ?? ''))
    standingsByLeague.set(lg.id, ranked)
  }

  const memberCountByLeague = new Map()
  const leaguesByUser = new Map()
  for (const m of members) {
    memberCountByLeague.set(m.league_id, (memberCountByLeague.get(m.league_id) ?? 0) + 1)
    if (!leaguesByUser.has(m.user_id)) leaguesByUser.set(m.user_id, [])
    leaguesByUser.get(m.user_id).push(m.league_id)
  }

  const prizeResByLeague = new Map()
  for (const pr of prizeResults) {
    if (!prizeResByLeague.has(pr.league_id)) prizeResByLeague.set(pr.league_id, [])
    prizeResByLeague.get(pr.league_id).push(pr)
  }

  const leagueById = new Map(leagues.map(l => [l.id, l]))

  // Precomputa, por liga, la lista de premios enriquecida (label, importe, ganadores).
  const prizesByLeague = new Map()
  for (const lg of leagues) {
    const rules   = Array.isArray(lg.prize_rules) ? lg.prize_rules : []
    const results = prizeResByLeague.get(lg.id) ?? []
    const resByRule = new Map(results.map(r => [r.rule_id, r]))
    const count = memberCountByLeague.get(lg.id) ?? 0
    const pot   = lg.entry_fee && count > 0 ? Number(lg.entry_fee) * count : null
    const prizes = rules.map(rule => {
      const r       = resByRule.get(rule.id)
      const winners = (r?.winner_ids ?? []).map(id => nameById.get(id)).filter(Boolean)
      const amount  = pot != null ? Math.round(pot * Number(rule.pct) / 100) : null
      return {
        pct: rule.pct, label: rule.label, emoji: TRIGGER_META[rule.trigger] ?? '🏆',
        winners, amount, perWinner: winners.length > 1 && amount != null ? amount / winners.length : amount,
      }
    })
    prizesByLeague.set(lg.id, { pot, entryFee: Number(lg.entry_fee), memberCount: count, prizes })
  }

  return { leagueById, standingsByLeague, memberCountByLeague, leaguesByUser, prizesByLeague, nameById }
}

// Arma la vista de un usuario (sus ligas con puesto, puntos y premio propio).
function userLeagueViews(userId, ctx) {
  const leagueIds = ctx.leaguesByUser.get(userId) ?? []
  return leagueIds.map(lid => {
    const lg   = ctx.leagueById.get(lid)
    const rank = ctx.standingsByLeague.get(lid) ?? []
    const idx  = rank.findIndex(r => r.user_id === userId)
    const me   = idx >= 0 ? rank[idx] : { points: 0, exact: 0, correct: 0 }
    // Rank de competición: 1 + nº de gente con más puntos (empates comparten puesto).
    const myRank = idx >= 0 ? 1 + rank.filter(r => r.points > me.points).length : rank.length + 1
    const pdata  = ctx.prizesByLeague.get(lid)
    const myName = ctx.nameById.get(userId)
    const myPrizeParts = (pdata?.prizes ?? [])
      .filter(pz => pz.winners.includes(myName))
      .map(pz => `${pz.label}${pz.winners.length > 1 ? ` (a medias, ${fmtEur(pz.perWinner)})` : pz.amount != null ? ` (${fmtEur(pz.amount)})` : ''}`)
    return {
      name: lg.name, memberCount: pdata?.memberCount ?? (ctx.memberCountByLeague.get(lid) ?? 0),
      myRank, myPoints: me.points, myExact: me.exact, myCorrect: me.correct,
      pot: pdata?.pot ?? null, entryFee: pdata?.entryFee ?? null, prizes: pdata?.prizes ?? [],
      myPrize: myPrizeParts.length ? `Ganaste: ${myPrizeParts.join(' · ')}` : null,
    }
  })
}

// ─── Audiencia ──────────────────────────────────────────────────────────────────

async function fetchAudience(supabase) {
  const PAGE = 1000
  const authUsers = []
  for (let p = 1; p <= 50; p++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: p, perPage: PAGE })
    if (error) throw error
    authUsers.push(...data.users)
    if (data.users.length < PAGE) break
  }
  // Envío de cierre único: va a TODOS los participantes confirmados, no solo a
  // quien tiene recordatorios activos (así ningún ganador se queda sin enterarse).
  const { data: profiles, error } = await supabase
    .from('profiles').select('id, username, email_confirmed')
    .eq('email_confirmed', true)
  if (error) throw error
  const emailById = new Map(authUsers.map(u => [u.id, { email: u.email, confirmed: !!u.email_confirmed_at }]))
  return profiles
    .map(p => ({ ...p, ...(emailById.get(p.id) ?? {}) }))
    .filter(r => r.email && r.confirmed)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!BREVO_KEY && previewTo) { console.error('Falta BREVO_API_KEY'); process.exit(1) }
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const ctx = await loadContext(supabase)

  if (previewTo) {
    // Usuario de muestra: --as <username>, o el primero con premio para ver el layout completo.
    let sampleId = null
    if (asUser) {
      for (const [id, name] of ctx.nameById) if (name === asUser) { sampleId = id; break }
    }
    if (!sampleId) {
      outer: for (const [lid, pdata] of ctx.prizesByLeague) {
        for (const pz of pdata.prizes) if (pz.winners.length) {
          for (const [id, name] of ctx.nameById) if (name === pz.winners[0]) { sampleId = id; break outer }
        }
      }
    }
    const username = ctx.nameById.get(sampleId) ?? 'Jugador'
    const leagues  = userLeagueViews(sampleId, ctx)
    const { subject, html } = buildEmail({ username, leagues })
    await sendEmail(previewTo, username, `[Preview] ${subject}`, html)
    console.log(`Preview (como ${username}) enviado a ${previewTo}`)
    return
  }

  // Solo participantes (miembros de al menos una liga): sin liga no hay email que armar.
  const audience = (await fetchAudience(supabase)).filter(r => (ctx.leaguesByUser.get(r.id) ?? []).length > 0)
  console.log(`\nAudiencia: ${audience.length} participantes confirmados.`)

  if (args.has('--dry-run')) {
    for (const r of audience) console.log(`  · ${(r.username ?? '').padEnd(22)} ${r.email}`)
    return
  }

  if (!args.has('--send-all')) {
    console.log('\nUso:\n  --preview <email> [--as <username>]\n  --dry-run\n  --send-all [--yes]')
    return
  }

  // --yes salta la confirmación interactiva (necesario en CI, sin TTY).
  if (!args.has('--yes')) {
    const rl = createInterface({ input: stdin, output: stdout })
    const answer = await rl.question(`\n¿Enviar a ${audience.length} usuarios? (escribe "SI" para confirmar): `)
    rl.close()
    if (answer.trim().toUpperCase() !== 'SI') { console.log('Cancelado.'); return }
  }

  let ok = 0, fail = 0
  for (const r of audience) {
    try {
      const leagues = userLeagueViews(r.id, ctx)
      const { subject, html } = buildEmail({ username: r.username, leagues })
      await sendEmail(r.email, r.username, subject, html)
      console.log(`  ✓ ${r.username} <${r.email}>`)
      ok++
    } catch (err) {
      console.error(`  ✗ ${r.username}: ${err.message}`)
      fail++
    }
    await new Promise(res => setTimeout(res, 250))
  }
  console.log(`\nResultado: ${ok} enviados · ${fail} errores`)
}

import { pathToFileURL } from 'node:url'
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
}
