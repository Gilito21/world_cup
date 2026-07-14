/**
 * send-daily-digest.js
 * Envía un resumen diario durante el Mundial a cada usuario que tiene
 * recordatorios activados (profiles.email_reminders=true). El correo
 * incluye:
 *   • Partidos jugados ayer y puntos ganados
 *   • Posición global actual
 *   • Partidos previstos para hoy
 *
 * Idempotente: se apoya en la tabla `daily_digests` (migración 022)
 * con PK (user_id, digest_date) para no enviar dos veces el mismo día
 * aunque Render reintente el job.
 *
 * Ejecutar como cron diario (08:00 hora local), preferiblemente con
 * timezone UTC y dejando que el script normalice. Solo envía mientras
 * dura el Mundial: fuera de la ventana hace early-return.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   BREVO_API_KEY
 *   APP_URL      (ej. https://porradeempresas.com)
 *   FROM_EMAIL
 *   FROM_NAME
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { brandShell, brandButton, brandHeadline, brandKicker, brandStatTile, escHtml, BRAND } from './_brand-email.js'
import { getTriggerInfo } from '../src/utils/prizeRules.js'
import { computePredictedKnockout } from '../src/utils/tournament.js'
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_KEY    = process.env.BREVO_API_KEY
const APP_URL      = (process.env.APP_URL ?? 'https://porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL   = process.env.FROM_EMAIL ?? 'noreply@porradeempresas.com'
const FROM_NAME    = process.env.FROM_NAME  ?? 'Porra Empresas'

// Ventana del Mundial. Solo enviamos digests dentro de este rango.
// El primer email útil sería el 12-jun (sobre los partidos del 11), y el
// último el 20-jul (sobre la final del 19).
//
// MUNDIAL_START usa la hora real del kickoff (11 jun 2026, 21:00 hora
// española = 19:00 UTC). Si dispara el cron de digest antes de esa hora,
// no hay partido "de ayer" que comentar todavía. Mantener sincronizado con
// scripts/send-reminders.js y scripts/send-mundial-nudge.js.
const MUNDIAL_START = new Date('2026-06-11T19:00:00Z')
const MUNDIAL_END   = new Date('2026-07-20T23:59:59Z')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateHumanES(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

function startOfDayUTC(d) {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function dayKey(d) {
  // YYYY-MM-DD (UTC) — usado como digest_date y para logs.
  return startOfDayUTC(d).toISOString().slice(0, 10)
}

// ─── Email builder ────────────────────────────────────────────────────────────

export function buildEmail({ username, yesterdayMatches, todayMatches, yesterdayPoints, advanceTeams = [], position, totalUsers, leagues = [], prizes = [] }) {
  const todayStr     = fmtDateHumanES(new Date())

  const subject = yesterdayMatches.length > 0
    ? `Tu resumen · ${yesterdayPoints} ${yesterdayPoints === 1 ? 'pt' : 'pts'}`
    : `Hoy juegan: ${todayMatches.slice(0, 2).map(m => `${m.home_team} – ${m.away_team}`).join(' · ')}`

  const yesterdayRows = yesterdayMatches.map(m => {
    const pts = m.points ?? 0
    const badgeBg = pts === 3 ? BRAND.green : pts === 1 ? BRAND.terra : 'transparent'
    const badgeFg = pts === 0 ? BRAND.ink : BRAND.cream
    const badgeTx = pts === 3 ? '+3' : pts === 1 ? '+1' : '0'
    const badgeBd = pts === 0 ? `1px solid ${BRAND.ink}` : 'none'
    // En eliminatorias el pronóstico puede tener el mismo marcador pero OTROS
    // equipos (otro cruce del cuadro), y entonces no puntúa. Si los equipos
    // pronosticados difieren del cruce real, los mostramos junto al marcador
    // para que se vea por qué un "empate acertado" puede dar 0.
    const ph = m.my_pred?.home_team
    const pa = m.my_pred?.away_team
    const teamsDiffer = ph && pa && (ph !== m.home_team || pa !== m.away_team)
    const predStr = m.my_pred
      ? (teamsDiffer
          ? `${escHtml(ph)} ${m.my_pred.home_score} – ${m.my_pred.away_score} ${escHtml(pa)}`
          : `${m.my_pred.home_score} – ${m.my_pred.away_score}`)
      : `<em style="color:${BRAND.ink};opacity:.5;">sin pronóstico</em>`
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.rule};">
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};font-weight:600;">
            ${escHtml(m.home_team)} <span style="font-family:'Instrument Serif',Georgia,serif;font-size:18px;color:${BRAND.terra};">${m.home_score} – ${m.away_score}</span> ${escHtml(m.away_team)}
          </div>
          <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;margin-top:4px;">Tu pronóstico · ${predStr}</div>
        </td>
        <td style="padding:12px 0 12px 16px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;vertical-align:middle;">
          <span style="display:inline-block;background:${badgeBg};color:${badgeFg};border:${badgeBd};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:11px;letter-spacing:.08em;padding:4px 10px;">${badgeTx}</span>
        </td>
      </tr>`
  }).join('')

  const todayRows = todayMatches.map(m => {
    const time = new Date(m.match_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">
          ${escHtml(m.home_team)} <span style="color:${BRAND.terra};font-family:'Instrument Serif',Georgia,serif;font-style:italic;">vs</span> ${escHtml(m.away_team)}
        </td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.rule};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.1em;color:${BRAND.ink};opacity:.7;text-align:right;white-space:nowrap;">${time} CET</td>
      </tr>`
  }).join('')

  const positionBlock = (position && totalUsers) ? `
    <div style="margin:0 0 24px;">
      ${brandStatTile({ kicker: 'Posición global', value: `#${position} <span style="font-family:Inter,-apple-system,sans-serif;font-size:14px;opacity:.55;">/ ${totalUsers}</span>`, sub: yesterdayPoints > 0 ? `Sumaste ${yesterdayPoints} ${yesterdayPoints === 1 ? 'punto' : 'puntos'} en la última jornada.` : null })}
    </div>` : ''

  const leagueRows = leagues.map(l => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};font-weight:600;">
          ${escHtml(l.name)}
        </td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;vertical-align:middle;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:${BRAND.ink};">
          #${l.position} <span style="font-size:11px;opacity:.55;">/ ${l.total}</span>
        </td>
      </tr>`).join('')

  const leaguesBlock = leagues.length > 0 ? `
    <div style="margin:0 0 24px;">
      ${brandKicker(leagues.length === 1 ? 'Tu liga' : 'Tus ligas')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
        ${leagueRows}
      </table>
    </div>` : ''

  const prizeRows = prizes.map(p => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};font-weight:600;">
          ${p.emoji ? `${p.emoji} ` : ''}${escHtml(p.label)}${p.shared ? ' <span style="font-weight:400;opacity:.55;">(a medias)</span>' : ''}
          <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;margin-top:3px;">${escHtml(p.league)}</div>
        </td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;vertical-align:middle;">
          ${p.amount != null ? `<span style="display:inline-block;background:${BRAND.green};color:${BRAND.cream};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:12px;letter-spacing:.04em;padding:4px 10px;">€${Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2)}</span>` : ''}
        </td>
      </tr>`).join('')

  const prizesBlock = prizes.length > 0 ? `
    <div style="margin:0 0 24px;">
      ${brandKicker(prizes.length === 1 ? 'Vas ganando un premio' : 'Vas ganando premios')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
        ${prizeRows}
      </table>
      <p style="margin:8px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:11px;color:${BRAND.ink};opacity:.55;">Provisional: si el torneo acabara hoy. Aún puede cambiar.</p>
    </div>` : ''

  const ayerBlock = yesterdayMatches.length > 0 ? `
    <div style="margin:0 0 24px;">
      ${brandKicker('Resultados recientes')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
        ${yesterdayRows}
      </table>
    </div>` : `
    <p style="margin:0 0 24px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};opacity:.65;">No hay resultados nuevos desde el último resumen.</p>`

  const advanceRows = advanceTeams.map(a => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};font-weight:600;">
          ${escHtml(a.team)}
        </td>
        <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;vertical-align:middle;">
          <span style="display:inline-block;background:${BRAND.terra};color:${BRAND.cream};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:11px;letter-spacing:.08em;padding:4px 10px;">+${a.points}</span>
        </td>
      </tr>`).join('')

  const advanceBlock = advanceTeams.length > 0 ? `
    <div style="margin:0 0 24px;">
      ${brandKicker('Puntos de avance de ayer')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
        ${advanceRows}
      </table>
    </div>` : ''

  const hoyBlock = todayMatches.length > 0 ? `
    <div style="margin:0 0 28px;">
      ${brandKicker(`Hoy · ${todayStr}`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
        ${todayRows}
      </table>
    </div>` : ''

  const headline = yesterdayMatches.length > 0
    ? (yesterdayPoints > 0 ? `Bien jugado, ${username}.` : `Hoy se reescribe, ${username}.`)
    : `A ver qué pasa hoy, ${username}.`

  const content = `
${brandKicker('Resumen diario')}
${brandHeadline(headline)}

${ayerBlock}
${advanceBlock}
${prizesBlock}
${positionBlock}
${leaguesBlock}
${hoyBlock}

${brandButton({ href: APP_URL, label: 'Ver clasificación' })}
`

  const html = brandShell({
    title: subject,
    preheader: yesterdayMatches.length > 0
      ? `Sumaste ${yesterdayPoints} ${yesterdayPoints === 1 ? 'punto' : 'puntos'} en la última jornada.`
      : `Partidos previstos para hoy en el Mundial 2026.`,
    content,
    footerNote: `Recibes este resumen porque tienes los recordatorios activados. Puedes desactivarlos en tu perfil: ${APP_URL}/perfil`,
    appUrl: APP_URL,
  })

  return { subject, html }
}

// ─── Preview / muestra ─────────────────────────────────────────────────────────
// Datos de ejemplo para `--preview <email>`: un día de partidos típico con
// mezcla de acierto exacto (+3), tendencia (+1) y fallo (0), más un par de
// partidos para hoy. No toca Supabase ni Brevo masivo: solo construye el
// email y lo manda a la dirección indicada.

export function sampleEmailArgs() {
  const today = new Date()
  const at = (h, m) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString() }
  const yesterdayMatches = [
    { home_team: 'España',    away_team: 'Alemania', home_score: 2, away_score: 1, my_pred: { home_score: 2, away_score: 1 }, points: 3 },
    { home_team: 'Brasil',    away_team: 'Francia',  home_score: 0, away_score: 0, my_pred: { home_score: 1, away_score: 1 }, points: 1 },
    // Caso eliminatoria: acertó el empate del resultado pero su cruce era otro
    // (Suiza–Marruecos, no Países Bajos–Marruecos) → 0 puntos. Se muestran los
    // equipos pronosticados junto al marcador para que se entienda.
    { home_team: 'Países Bajos', away_team: 'Marruecos', home_score: 1, away_score: 1, stage: 'round_of_32',
      my_pred: { home_score: 1, away_score: 1, home_team: 'Suiza', away_team: 'Marruecos' }, points: 0 },
  ]
  // Avance de muestra: dos equipos que ayer pasaron a semis (+4 cada uno).
  // Por equipo y día suele decidirse una sola ronda, así que es el incremento.
  const advanceTeams = [
    { team: 'España', points: 4 },
    { team: 'Brasil', points: 4 },
  ]
  const matchPoints = yesterdayMatches.reduce((s, m) => s + m.points, 0)
  return {
    username:         'Jaime',
    yesterdayMatches,
    todayMatches:     [
      { home_team: 'Portugal',   away_team: 'Croacia',   match_date: at(18, 0), stage: 'group' },
      { home_team: 'Inglaterra', away_team: 'Países Bajos', match_date: at(21, 0), stage: 'group' },
    ],
    advanceTeams,
    yesterdayPoints:  matchPoints + advanceTeams.reduce((s, a) => s + a.points, 0),
    position:         7,
    totalUsers:       142,
    leagues: [
      { name: 'Oficina Madrid',   position: 2, total: 18 },
      { name: 'Amigos del fútbol', position: 5, total: 11 },
    ],
    prizes: [
      { league: 'Oficina Madrid', label: '1º clasificado al final del torneo', emoji: '🥇', amount: 358,  locked: false },
      { league: 'Oficina Madrid', label: 'Más resultados exactos predichos',   emoji: '🎯', amount: 32.5, locked: false, shared: true },
    ],
  }
}

// ─── Paginación helpers ───────────────────────────────────────────────────────
// listUsers admin API y los selects de PostgREST tienen un tope implícito
// (1000 filas). Más allá de eso perderíamos silenciosamente usuarios y
// posiciones de clasificación. Estos wrappers iteran páginas hasta agotar
// la fuente, con un techo defensivo para evitar bucles infinitos.

async function listAllAuthUsers(supabase) {
  const PAGE_SIZE = 1000
  const all = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error
    all.push(...data.users)
    if (data.users.length < PAGE_SIZE) return all
  }
  throw new Error('listAllAuthUsers paged past 50 pages — aborting')
}

async function fetchAllPages(supabase, build) {
  const PAGE_SIZE = 1000
  const all = []
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    const { data, error } = await build(supabase).range(from, to)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return all
  }
  throw new Error('fetchAllPages paged past 50 pages — aborting')
}

// ─── Envío via Brevo ──────────────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()
  const now = new Date()
  const todayKey = dayKey(now)
  console.log(`[${now.toISOString()}] Digest diario · ${todayKey}`)

  if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

  // --preview <email>: manda una muestra con datos de ejemplo y termina.
  const previewIdx = process.argv.indexOf('--preview')
  const previewTo  = previewIdx >= 0 ? process.argv[previewIdx + 1] : null
  if (previewTo) {
    const { subject, html } = buildEmail(sampleEmailArgs())
    await sendEmail(previewTo, `[Draft · daily-digest] ${subject}`, html)
    console.log(`Preview enviado a ${previewTo}.`)
    return
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan vars de Supabase'); process.exit(1) }

  // Fuera de la ventana del torneo no enviamos nada.
  if (now < MUNDIAL_START || now > MUNDIAL_END) {
    console.log('Fuera de la ventana del Mundial; saliendo.')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Jornada con corte a las 05:00 UTC en vez de día natural UTC. Las sedes del
  // Mundial 2026 están en América: el último partido de la noche cae a las
  // ~02:00-04:00 UTC del día natural siguiente. Si delimitáramos por día UTC,
  // ese partido de madrugada se contaría como "hoy" y no sumaría en el resumen
  // (el bug por el que Corea–Chequia a las 04:00 Madrid no aparecía con sus
  // puntos). Cortando a las 05:00 UTC —ya no hay partidos en juego y el cron de
  // las 06:00 aún no ha mandado— toda la noche queda en la misma jornada.
  // yStart..yEnd = resultados recientes (24h hasta el corte); tStart..tEnd = hoy.
  const yEnd = new Date(now); yEnd.setUTCHours(5, 0, 0, 0)
  if (yEnd > now) yEnd.setUTCDate(yEnd.getUTCDate() - 1)
  const yStart = new Date(yEnd.getTime() - 86400_000)
  const tStart = yEnd
  const tEnd   = new Date(yEnd.getTime() + 86400_000)

  // "Resultados recientes" ya NO se delimita por la ventana rígida yStart..yEnd:
  // un resultado que llegaba tarde del proveedor caía fuera y se perdía para
  // siempre (le pasó a Ghana–Panamá). Ahora qué partidos reportar lo decide la
  // tabla digested_matches (cada partido se reporta una sola vez, en el primer
  // digest que corra tras quedar finished). recentStart es solo un techo
  // defensivo de 4 días para no escanear todo el torneo ni resucitar un partido
  // antiquísimo que por un bug nunca se marcara. yStart/yEnd siguen usándose
  // para los puntos de avance y para "hoy".
  const recentStart = new Date(yEnd.getTime() - 4 * 86400_000)

  // ── Datos compartidos por todos los emails ─────────────────────────────
  // Las consultas que pueden devolver >1000 filas usan los wrappers
  // paginados (listAllAuthUsers, fetchAllPages). Los matches del día
  // nunca pasan de unas decenas, así que esos sí van directos.
  const [
    authUsers,
    optInProfiles,
    { data: recentFinished },
    { data: todayMatches },
    { data: alreadySent },
    { data: digestedRows },
    standings,
  ] = await Promise.all([
    listAllAuthUsers(supabase),
    // Solo opt-in que además han confirmado su email: evita mandar digests
    // a emails fake/typo que nunca verificaron.
    fetchAllPages(supabase, s => s.from('profiles')
      .select('id, username')
      .eq('email_reminders', true)
      .eq('email_confirmed', true)),
    supabase.from('matches')
      .select('id, home_team, away_team, home_score, away_score, status, match_date, stage')
      .eq('status', 'finished')
      .gte('match_date', recentStart.toISOString())
      .order('match_date'),
    supabase.from('matches')
      .select('id, home_team, away_team, match_date, stage, status')
      .gte('match_date', tStart.toISOString())
      .lt('match_date',  tEnd.toISOString())
      .neq('status', 'finished')
      .order('match_date'),
    supabase.from('daily_digests').select('user_id').eq('digest_date', todayKey),
    supabase.from('digested_matches').select('match_id'),
    // Misma regla: el ranking que mostramos en el email es el de usuarios
    // confirmados, coherente con lo que ven en la app.
    fetchAllPages(supabase, s => s.from('profiles')
      .select('id, total_points')
      .eq('email_confirmed', true)
      .order('total_points', { ascending: false })),
  ])

  const emailByUserId  = new Map(authUsers.map(u => [u.id, u.email]))
  const alreadySentIds = new Set((alreadySent ?? []).map(r => r.user_id))
  const totalUsers     = standings.length
  const positionById   = new Map(standings.map((p, i) => [p.id, i + 1]))

  // Resultados recientes = partidos finished que aún no se han reportado en
  // ningún digest. Así un resultado que llegó tarde se incluye en el siguiente
  // resumen en vez de perderse.
  const digestedSet      = new Set((digestedRows ?? []).map(r => r.match_id))
  const yesterdayMatches = (recentFinished ?? []).filter(m => !digestedSet.has(m.id))

  // Si ayer no hubo partidos y hoy tampoco, no es interesante enviar nada.
  if ((yesterdayMatches ?? []).length === 0 && (todayMatches ?? []).length === 0) {
    console.log('Ni ayer hubo partidos ni hoy hay; nada que enviar.')
    return
  }

  // ── Posición en cada liga del usuario ──────────────────────────────────
  // Replica la lógica de src/pages/Clasificacion.jsx: los puntos de un
  // miembro en una liga dependen de su prediction_mode. En modo 'global'
  // (default) puntúa con sus pronósticos globales —que es justo
  // profiles.total_points (ver migración 026)—; en modo 'per_league' suma
  // predictions + special_predictions de ESA liga. Ordenamos por puntos
  // desc con desempate estable por username, igual que la app.
  const [leagueMembers, leagueList, allProfiles, perLeaguePredRows, perLeagueSpecialRows, prizeResults] = await Promise.all([
    fetchAllPages(supabase, s => s.from('league_members').select('league_id, user_id, prediction_mode')),
    fetchAllPages(supabase, s => s.from('leagues').select('id, name, entry_fee, prize_rules')),
    fetchAllPages(supabase, s => s.from('profiles').select('id, username, total_points')),
    fetchAllPages(supabase, s => s.from('predictions')
      .select('user_id, league_id, points_earned').not('league_id', 'is', null)),
    fetchAllPages(supabase, s => s.from('special_predictions')
      .select('user_id, league_id, points_earned').not('league_id', 'is', null)),
    fetchAllPages(supabase, s => s.from('league_prize_results')
      .select('league_id, rule_id, trigger_key, winner_id, winner_ids, locked')),
  ])

  const leagueNameById = new Map(leagueList.map(l => [l.id, l.name]))
  const leagueById     = new Map(leagueList.map(l => [l.id, l]))
  const profileById    = new Map(allProfiles.map(p => [p.id, p]))

  // Puntos per_league por (usuario, liga): predictions + special_predictions.
  const perLeaguePts = new Map()  // `${user_id}|${league_id}` -> puntos
  const addPerLeague = r => {
    const k = `${r.user_id}|${r.league_id}`
    perLeaguePts.set(k, (perLeaguePts.get(k) ?? 0) + (r.points_earned ?? 0))
  }
  perLeaguePredRows.forEach(addPerLeague)
  perLeagueSpecialRows.forEach(addPerLeague)

  // Standings por liga → posición y total de cada miembro.
  const membersByLeague = new Map()
  for (const m of leagueMembers) {
    if (!membersByLeague.has(m.league_id)) membersByLeague.set(m.league_id, [])
    membersByLeague.get(m.league_id).push(m)
  }
  const leaguePosition = new Map()  // `${user_id}|${league_id}` -> { position, total }
  for (const [leagueId, members] of membersByLeague) {
    const rows = members.map(m => {
      const mode = m.prediction_mode ?? 'global'
      const pts  = mode === 'per_league'
        ? (perLeaguePts.get(`${m.user_id}|${leagueId}`) ?? 0)
        : (profileById.get(m.user_id)?.total_points ?? 0)
      return { user_id: m.user_id, pts, username: profileById.get(m.user_id)?.username ?? '' }
    }).sort((a, b) => b.pts - a.pts || a.username.localeCompare(b.username))
    rows.forEach((r, i) => leaguePosition.set(`${r.user_id}|${leagueId}`, { position: i + 1, total: rows.length }))
  }

  // Ligas por usuario (solo las que importan: las de cada destinatario).
  const leaguesByUser = new Map()  // user_id -> [{ name, position, total }]
  for (const m of leagueMembers) {
    const pos = leaguePosition.get(`${m.user_id}|${m.league_id}`)
    if (!pos) continue
    if (!leaguesByUser.has(m.user_id)) leaguesByUser.set(m.user_id, [])
    leaguesByUser.get(m.user_id).push({ name: leagueNameById.get(m.league_id) ?? 'Liga', ...pos })
  }
  for (const arr of leaguesByUser.values()) arr.sort((a, b) => a.position - b.position)

  // ── Premios provisionales por usuario ──────────────────────────────────
  // Por cada resultado cuyo ganador sea el destinatario, resolvemos etiqueta
  // (prizeRules.js) e importe igual que PrizePotCard: bote = entry_fee × nº
  // miembros, importe = round(bote × pct/100). Filtrar por rule.id descarta
  // resultados huérfanos de reglas borradas.
  const prizesByUser = new Map()  // user_id -> [{ league, label, emoji, amount, locked }]
  for (const pr of prizeResults) {
    // winner_ids lista a todos los ganadores (reparto a medias en empates);
    // winner_id se mantiene por compatibilidad para resultados antiguos.
    const winnerIds = pr.winner_ids?.length ? pr.winner_ids : (pr.winner_id ? [pr.winner_id] : [])
    if (!winnerIds.length) continue
    const league = leagueById.get(pr.league_id)
    if (!league) continue
    const rules = Array.isArray(league.prize_rules) ? league.prize_rules : []
    const rule  = rules.find(r => r.id === pr.rule_id)
    if (!rule) continue
    const info        = getTriggerInfo(rule.trigger)
    const memberCount = (membersByLeague.get(pr.league_id) ?? []).length
    const pot         = league.entry_fee && memberCount > 0 ? league.entry_fee * memberCount : null
    const full        = pot ? Math.round(pot * Number(rule.pct) / 100) : null
    // El importe se reparte a partes iguales entre los ganadores empatados.
    const amount      = full != null ? full / winnerIds.length : null
    const shared      = winnerIds.length > 1
    for (const winnerId of winnerIds) {
      if (!prizesByUser.has(winnerId)) prizesByUser.set(winnerId, [])
      prizesByUser.get(winnerId).push({ league: league.name, label: info.label, emoji: info.emoji, amount, locked: pr.locked, shared })
    }
  }

  // ── Predicciones globales de ayer (paginadas) ──────────────────────────
  const yMatchIds = (yesterdayMatches ?? []).map(m => m.id)
  const predsByUser = new Map()
  if (yMatchIds.length > 0) {
    const yPreds = await fetchAllPages(supabase, s =>
      s.from('predictions')
        .select('user_id, match_id, home_score, away_score, points_earned, league_id')
        .in('match_id', yMatchIds)
        .is('league_id', null)  // resumen global, no per-liga
    )
    for (const p of yPreds) {
      if (!predsByUser.has(p.user_id)) predsByUser.set(p.user_id, new Map())
      predsByUser.get(p.user_id).set(p.match_id, p)
    }
  }

  // ── Equipos pronosticados por usuario para los cruces KO recientes ──────
  // En eliminatorias el marcador puede coincidir con el real pero con OTROS
  // equipos (otro cruce del cuadro): no puntúa. Para mostrarlo, reconstruimos
  // el cascade de cada usuario (igual que la página de pronósticos) y sacamos
  // qué equipos puso en ese hueco. Solo hace falta en fase eliminatoria; en
  // grupos el pronóstico es siempre sobre los mismos equipos del partido.
  const predTeamsByUser = new Map()  // user_id -> { [match_id]: {homeTeam, awayTeam} }
  const koRecentIds = new Set((yesterdayMatches ?? []).filter(m => m.stage && m.stage !== 'group').map(m => m.id))
  if (koRecentIds.size > 0) {
    const [allMatches, allGlobalPreds] = await Promise.all([
      fetchAllPages(supabase, s => s.from('matches')
        .select('id, stage, group_name, home_team, away_team, home_score, away_score, status, winner, match_date, bracket_match_id')),
      fetchAllPages(supabase, s => s.from('predictions')
        .select('user_id, match_id, home_score, away_score, tiebreaker')
        .is('league_id', null)),
    ])
    const predMapByUser = new Map()
    for (const p of allGlobalPreds) {
      if (!predMapByUser.has(p.user_id)) predMapByUser.set(p.user_id, {})
      predMapByUser.get(p.user_id)[p.match_id] = { home_score: p.home_score, away_score: p.away_score, tiebreaker: p.tiebreaker ?? null }
    }
    for (const profile of optInProfiles) {
      const predMap = predMapByUser.get(profile.id)
      if (!predMap) continue
      const overlay = computePredictedKnockout(allMatches, predMap)
      const slim = {}
      for (const id of koRecentIds) if (overlay[id]) slim[id] = overlay[id]
      predTeamsByUser.set(profile.id, slim)
    }
  }

  // ── Bonus de avance decidido ayer (ámbito global) ──────────────────────
  // advance_points con league_id NULL y decided_on dentro de la ventana de
  // ayer. Agrupamos por usuario: puntos del día + desglose por equipo.
  const advanceByUser = new Map()  // user_id -> { points, teams: [{team, points}] }
  {
    const yAdvance = await fetchAllPages(supabase, s =>
      s.from('advance_points')
        .select('user_id, team, points, decided_on')
        .is('league_id', null)
        .gte('decided_on', yStart.toISOString())
        .lt('decided_on',  yEnd.toISOString())
    )
    for (const r of yAdvance) {
      if (!advanceByUser.has(r.user_id)) advanceByUser.set(r.user_id, { points: 0, teams: new Map() })
      const e = advanceByUser.get(r.user_id)
      e.points += (r.points ?? 0)
      e.teams.set(r.team, (e.teams.get(r.team) ?? 0) + (r.points ?? 0))
    }
  }

  // ── Envío en bucle ──────────────────────────────────────────────────────
  let ok = 0
  let skipped = 0
  let errored = 0

  for (const profile of optInProfiles) {
    if (alreadySentIds.has(profile.id)) { skipped++; continue }
    const email = emailByUserId.get(profile.id)
    if (!email) { skipped++; continue }

    // Compone la sección "ayer" con la predicción del usuario y puntos.
    const userPreds     = predsByUser.get(profile.id) ?? new Map()
    const userPredTeams = predTeamsByUser.get(profile.id) ?? {}
    const yMatches  = (yesterdayMatches ?? []).map(m => {
      const p  = userPreds.get(m.id) ?? null
      const pt = userPredTeams[m.id] ?? null
      return {
        home_team:  m.home_team,
        away_team:  m.away_team,
        home_score: m.home_score,
        away_score: m.away_score,
        my_pred:    p ? {
          home_score: p.home_score,
          away_score: p.away_score,
          home_team:  pt?.homeTeam ?? null,
          away_team:  pt?.awayTeam ?? null,
        } : null,
        points:     p?.points_earned ?? 0,
      }
    })
    const matchPoints = yMatches.reduce((s, m) => s + (m.points ?? 0), 0)
    const adv         = advanceByUser.get(profile.id) ?? null
    const advancePoints = adv?.points ?? 0
    const advanceTeams  = adv
      ? [...adv.teams.entries()].map(([team, points]) => ({ team, points })).sort((a, b) => b.points - a.points)
      : []
    const yPoints = matchPoints + advancePoints

    try {
      const { subject, html } = buildEmail({
        username:         profile.username,
        yesterdayMatches: yMatches,
        todayMatches:     todayMatches ?? [],
        yesterdayPoints:  yPoints,
        advanceTeams,
        position:         positionById.get(profile.id) ?? null,
        totalUsers,
        leagues:          leaguesByUser.get(profile.id) ?? [],
        prizes:           prizesByUser.get(profile.id) ?? [],
      })
      await sendEmail(email, subject, html)

      const { error: dedupErr } = await supabase
        .from('daily_digests')
        .upsert({ user_id: profile.id, digest_date: todayKey }, { onConflict: 'user_id,digest_date', ignoreDuplicates: true })
      if (dedupErr) console.warn(`  · dedup insert falló para ${profile.username}: ${dedupErr.message}`)

      console.log(`✉️  ${profile.username} (${yPoints} pts ayer)`)
      ok++
    } catch (err) {
      console.error(`❌ ${profile.username}: ${err.message}`)
      errored++
    }
  }

  // Marcar como reportados los partidos incluidos, pero solo si de verdad salió
  // al menos un email este run. Si todos estaban ya enviados (ok=0, p.ej. un
  // re-disparo manual el mismo día), no marcamos: dejamos que el próximo digest
  // real los reporte y nadie se quede sin verlos.
  if (ok > 0 && yesterdayMatches.length > 0) {
    const { error: digErr } = await supabase
      .from('digested_matches')
      .upsert(yesterdayMatches.map(m => ({ match_id: m.id })), { onConflict: 'match_id', ignoreDuplicates: true })
    if (digErr) console.warn(`No se pudieron marcar partidos como reportados: ${digErr.message}`)
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`✅ ${ok} enviados · ${skipped} omitidos · ${errored} errores · ${elapsed}s`)
}

import { pathToFileURL } from 'node:url'
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
}
