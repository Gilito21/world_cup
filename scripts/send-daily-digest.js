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
const MUNDIAL_START = new Date('2026-06-11T00:00:00Z')
const MUNDIAL_END   = new Date('2026-07-20T23:59:59Z')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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

function buildEmail({ username, yesterdayMatches, todayMatches, yesterdayPoints, position, totalUsers }) {
  const yesterdayStr = fmtDateHumanES(new Date(Date.now() - 86400_000))
  const todayStr     = fmtDateHumanES(new Date())

  const subject = yesterdayMatches.length > 0
    ? `⚽ Tu resumen de ayer · ${yesterdayPoints} pts`
    : `⚽ Hoy juegan: ${todayMatches.slice(0, 2).map(m => `${m.home_team} – ${m.away_team}`).join(' · ')}`

  const yesterdayRows = yesterdayMatches.map(m => {
    const pts = m.points ?? 0
    const badgeBg = pts === 3 ? '#f59e0b' : pts === 1 ? '#3b82f6' : '#78716c'
    const badge   = pts === 3 ? '🎯 +3' : pts === 1 ? '✓ +1' : '✗ 0'
    const predStr = m.my_pred ? `${m.my_pred.home_score} – ${m.my_pred.away_score}` : '<em style="color:#a8a29e">sin pronóstico</em>'
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f5f5f4;">
          <div style="font-size:13px;color:#44403c;font-weight:600;">${escHtml(m.home_team)} ${m.home_score} – ${m.away_score} ${escHtml(m.away_team)}</div>
          <div style="font-size:11px;color:#a8a29e;margin-top:2px;">Tu pronóstico: ${predStr}</div>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f5f5f4;text-align:right;white-space:nowrap;">
          <span style="display:inline-block;background:${badgeBg};color:#ffffff;font-weight:700;font-size:11px;padding:3px 8px;border-radius:999px;">${badge}</span>
        </td>
      </tr>`
  }).join('')

  const todayRows = todayMatches.map(m => {
    const time = new Date(m.match_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
    return `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#57534e;">${escHtml(m.home_team)} <span style="color:#a8a29e">vs</span> ${escHtml(m.away_team)}</td>
        <td style="padding:6px 0;font-size:12px;color:#a8a29e;text-align:right;white-space:nowrap;">${time} CET</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">

    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:32px;line-height:1;margin-bottom:6px;">⚽</div>
      <h1 style="margin:0;font-size:18px;font-weight:800;color:#1c1917;">Porra <span style="color:#f59e0b;">Empresas</span></h1>
    </div>

    <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:20px;margin-bottom:16px;">
      <p style="margin:0 0 14px;font-size:15px;color:#1c1917;">
        Hola <strong style="color:#d97706;">${escHtml(username)}</strong> 👋
      </p>

      ${yesterdayMatches.length > 0 ? `
        <h2 style="margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#a8a29e;">Ayer · ${escHtml(yesterdayStr)}</h2>
        <p style="margin:0 0 10px;color:#44403c;font-size:14px;">
          Sumaste <strong style="color:#d97706;">${yesterdayPoints} ${yesterdayPoints === 1 ? 'punto' : 'puntos'}</strong>.
        </p>
        <table style="width:100%;border-collapse:collapse;">${yesterdayRows}</table>
      ` : `
        <p style="margin:0 0 4px;color:#78716c;font-size:14px;">Ayer no hubo partidos del torneo.</p>
      `}
    </div>

    ${(position && totalUsers) ? `
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:16px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <p style="margin:0;color:#92400e;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Tu posición global</p>
          <p style="margin:4px 0 0;color:#1c1917;font-size:22px;font-weight:800;">#${position} <span style="color:#a8a29e;font-size:14px;font-weight:500;">de ${totalUsers}</span></p>
        </div>
      </div>
    ` : ''}

    ${todayMatches.length > 0 ? `
      <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:20px;margin-bottom:16px;">
        <h2 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#a8a29e;">Hoy · ${escHtml(todayStr)}</h2>
        <table style="width:100%;border-collapse:collapse;">${todayRows}</table>
      </div>
    ` : ''}

    <a href="${APP_URL}"
       style="display:block;background:#f59e0b;color:#1c1917;text-decoration:none;text-align:center;padding:13px 24px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.01em;">
      Ver clasificación →
    </a>

    <p style="text-align:center;color:#a8a29e;font-size:11px;margin-top:20px;line-height:1.6;">
      Recibes este resumen porque tienes los recordatorios activados.<br>
      Puedes desactivarlos en tu
      <a href="${APP_URL}/perfil" style="color:#78716c;text-decoration:underline;">perfil</a>.
    </p>
  </div>
</body>
</html>`

  return { subject, html }
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

  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan vars de Supabase'); process.exit(1) }
  if (!BREVO_KEY)                     { console.error('Falta BREVO_API_KEY');      process.exit(1) }

  // Fuera de la ventana del torneo no enviamos nada.
  if (now < MUNDIAL_START || now > MUNDIAL_END) {
    console.log('Fuera de la ventana del Mundial; saliendo.')
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Ventanas de "ayer" y "hoy" en UTC. Aceptable porque kickoffs FIFA son
  // tarde (>= 18:00 UTC en EE.UU.), así que usar UTC para delimitar el
  // día reparte los partidos como espera el usuario europeo medio.
  const yStart = startOfDayUTC(new Date(now.getTime() - 86400_000))
  const yEnd   = new Date(yStart.getTime() + 86400_000)
  const tStart = startOfDayUTC(now)
  const tEnd   = new Date(tStart.getTime() + 86400_000)

  // ── Datos compartidos por todos los emails ─────────────────────────────
  // Las consultas que pueden devolver >1000 filas usan los wrappers
  // paginados (listAllAuthUsers, fetchAllPages). Los matches del día
  // nunca pasan de unas decenas, así que esos sí van directos.
  const [
    authUsers,
    optInProfiles,
    { data: yesterdayMatches },
    { data: todayMatches },
    { data: alreadySent },
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
      .gte('match_date', yStart.toISOString())
      .lt('match_date',  yEnd.toISOString())
      .order('match_date'),
    supabase.from('matches')
      .select('id, home_team, away_team, match_date, stage, status')
      .gte('match_date', tStart.toISOString())
      .lt('match_date',  tEnd.toISOString())
      .order('match_date'),
    supabase.from('daily_digests').select('user_id').eq('digest_date', todayKey),
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

  // Si ayer no hubo partidos y hoy tampoco, no es interesante enviar nada.
  if ((yesterdayMatches ?? []).length === 0 && (todayMatches ?? []).length === 0) {
    console.log('Ni ayer hubo partidos ni hoy hay; nada que enviar.')
    return
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

  // ── Envío en bucle ──────────────────────────────────────────────────────
  let ok = 0
  let skipped = 0
  let errored = 0

  for (const profile of optInProfiles) {
    if (alreadySentIds.has(profile.id)) { skipped++; continue }
    const email = emailByUserId.get(profile.id)
    if (!email) { skipped++; continue }

    // Compone la sección "ayer" con la predicción del usuario y puntos.
    const userPreds = predsByUser.get(profile.id) ?? new Map()
    const yMatches  = (yesterdayMatches ?? []).map(m => {
      const p = userPreds.get(m.id) ?? null
      return {
        home_team:  m.home_team,
        away_team:  m.away_team,
        home_score: m.home_score,
        away_score: m.away_score,
        my_pred:    p ? { home_score: p.home_score, away_score: p.away_score } : null,
        points:     p?.points_earned ?? 0,
      }
    })
    const yPoints = yMatches.reduce((s, m) => s + (m.points ?? 0), 0)

    try {
      const { subject, html } = buildEmail({
        username:         profile.username,
        yesterdayMatches: yMatches,
        todayMatches:     todayMatches ?? [],
        yesterdayPoints:  yPoints,
        position:         positionById.get(profile.id) ?? null,
        totalUsers,
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

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`✅ ${ok} enviados · ${skipped} omitidos · ${errored} errores · ${elapsed}s`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
