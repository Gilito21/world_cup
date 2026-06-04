/**
 * send-league-intent-reminders.js
 * Recordatorio para usuarios que iniciaron el flujo de pago de liga
 * (`league_payments`) y nunca llegaron a tener un pago `succeeded`.
 * Solo si el último intent fue hace más de 24h. Una sola vez por
 * usuario (tracking en `league_intent_reminders`).
 *
 * Ejecutar via GitHub Actions cada hora
 * (.github/workflows/send-league-intent-reminders.yml).
 *
 * Uso:
 *   node scripts/send-league-intent-reminders.js
 *   node scripts/send-league-intent-reminders.js --preview <email>
 *   node scripts/send-league-intent-reminders.js --dry-run
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   BREVO_API_KEY
 *   APP_URL      (ej. https://porradeempresas.com)
 *   FROM_EMAIL, FROM_NAME
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { brandShell, brandButton, brandHeadline, brandKicker, escHtml, BRAND } from './_brand-email.js'
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_KEY    = process.env.BREVO_API_KEY
const APP_URL      = (process.env.APP_URL ?? 'https://porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL   = process.env.FROM_EMAIL ?? 'noreply@porradeempresas.com'
const FROM_NAME    = process.env.FROM_NAME  ?? 'Porra Empresas'

const COOLDOWN_HOURS = 24

// ─── Email ───────────────────────────────────────────────────────────────────

function buildEmail({ username, leagueName }) {
  const subject  = 'No te quedes con las ganas de crear tu liga'
  const hasName  = !!(leagueName && leagueName.trim())
  const nameLine = hasName
    ? `Ya tenías hasta el nombre pensado: <strong>${escHtml(leagueName)}</strong>.`
    : 'Tenías media porra montada en la cabeza, no la dejes en el aire.'

  const content = `
${brandKicker('Tu liga te espera')}
${brandHeadline('No te quedes con las ganas de crear tu liga.')}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola <strong>${escHtml(username)}</strong>, vimos que empezaste el proceso de crear tu liga privada y se quedó a medias.
</p>
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  ${nameLine} Termínalo en un minuto y compite con los tuyos antes de que arranque el Mundial — los marcadores se cierran con el pitido inicial y no hay segunda oportunidad.
</p>

${brandButton({ href: `${APP_URL}/pronosticos`, label: 'Crear mi liga' })}

<p style="margin:26px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.ink};opacity:.65;text-align:center;">
  Invita a tu grupo, compite por puntos y presume del que más entienda de fútbol.
</p>`

  const html = brandShell({
    title: subject,
    preheader: 'Tu liga se quedó a medias — acábala antes de que arranque el Mundial.',
    content,
    footerNote: `Recibes este email porque empezaste a crear una liga. Puedes desactivar los avisos en tu perfil: ${APP_URL}/perfil`,
    appUrl: APP_URL,
  })

  return { subject, html }
}

// ─── Brevo ──────────────────────────────────────────────────────────────────

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

// ─── Audience ────────────────────────────────────────────────────────────────

async function fetchAudience(supabase) {
  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 3_600_000).toISOString()

  const [{ data: payments }, { data: alreadySent }, { data: { users: authUsers }, error: usersErr }] = await Promise.all([
    supabase.from('league_payments').select('user_id, league_name, status, created_at'),
    supabase.from('league_intent_reminders').select('user_id'),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (usersErr) throw usersErr

  // Agrupar por user_id, descartar quienes tienen al menos un 'succeeded'
  const byUser = new Map()
  for (const p of payments ?? []) {
    if (!byUser.has(p.user_id)) byUser.set(p.user_id, { hasSucceeded: false, lastAttempt: '', leagueName: '' })
    const rec = byUser.get(p.user_id)
    if (p.status === 'succeeded') rec.hasSucceeded = true
    if (p.created_at > rec.lastAttempt) {
      rec.lastAttempt = p.created_at
      rec.leagueName  = p.league_name ?? ''
    }
  }

  const sentIds = new Set((alreadySent ?? []).map(r => r.user_id))
  const candidateIds = [...byUser.entries()]
    .filter(([uid, rec]) => !rec.hasSucceeded && rec.lastAttempt < cutoff && !sentIds.has(uid))
    .map(([uid]) => uid)

  if (candidateIds.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, email_reminders, email_confirmed')
    .in('id', candidateIds)
    .eq('email_reminders', true)
    .eq('email_confirmed', true)

  const emailById = new Map(authUsers.map(u => [u.id, u.email]))

  return (profiles ?? [])
    .map(p => ({
      user_id:     p.id,
      username:    p.username,
      email:       emailById.get(p.id),
      leagueName:  byUser.get(p.id).leagueName,
      lastAttempt: byUser.get(p.id).lastAttempt,
    }))
    .filter(r => !!r.email)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] Comprobando recordatorios de intents de liga...`)

  if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

  const args        = new Set(process.argv.slice(2))
  const previewIdx  = process.argv.indexOf('--preview')
  const previewTo   = previewIdx >= 0 ? process.argv[previewIdx + 1] : null

  if (previewTo) {
    const { subject, html } = buildEmail({ username: 'Jaime', leagueName: 'La Porra de los Cracks' })
    await sendEmail(previewTo, `[Draft · league-intent] ${subject}`, html)
    console.log(`Preview enviado a ${previewTo}.`)
    return
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan vars de Supabase'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const audience = await fetchAudience(supabase)

  if (audience.length === 0) {
    console.log('Sin candidatos.')
    return
  }

  console.log(`Audiencia: ${audience.length} usuario(s).`)
  if (args.has('--dry-run')) {
    for (const r of audience) {
      console.log(`  · ${r.username.padEnd(22)} ${r.email}  liga="${r.leagueName}"  último intent=${r.lastAttempt}`)
    }
    return
  }

  let okCount = 0
  let errCount = 0

  for (const r of audience) {
    try {
      const { subject, html } = buildEmail({ username: r.username, leagueName: r.leagueName })
      await sendEmail(r.email, subject, html)

      await supabase.from('league_intent_reminders').upsert(
        { user_id: r.user_id },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
      console.log(`✉️  ${r.username}`)
      okCount++
    } catch (err) {
      console.error(`❌ ${r.username}: ${err.message}`)
      errCount++
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`✅ ${okCount} emails enviados · ${errCount} errores · ${elapsed}s`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
