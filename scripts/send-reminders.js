/**
 * send-reminders.js
 * Envía recordatorios pre-Mundial a usuarios que aún no han enviado
 * sus pronósticos: 2 días antes y 1 día antes del inicio del torneo.
 *
 * Ejecutar como cron job en Render cada 30 minutos.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   BREVO_API_KEY
 *   APP_URL      (ej. https://porradeempresas.com)
 *   FROM_EMAIL   (ej. noreply@porradeempresas.com)
 *   FROM_NAME    (ej. "Porra Empresas")
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { brandShell, brandButton, brandHeadline, brandKicker, brandStatTile, escHtml, BRAND } from './_brand-email.js'
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_KEY    = process.env.BREVO_API_KEY
const APP_URL      = (process.env.APP_URL ?? 'https://porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL   = process.env.FROM_EMAIL ?? 'noreply@porradeempresas.com'
const FROM_NAME    = process.env.FROM_NAME  ?? 'Porra Empresas'

const MUNDIAL_START = new Date('2026-06-11T21:00:00Z')

// ─── Email pre-Mundial ────────────────────────────────────────────────────────

function buildEmail({ username, hoursLeft, type }) {
  const diasTxt = type === '2_days' ? '2 días' : '1 día'
  const subject = `Queda ${diasTxt} para el Mundial · envía tu pronóstico`
  const horas   = Math.round(hoursLeft)

  const content = `
${brandKicker(type === '2_days' ? 'Aviso · 48 horas' : 'Aviso · 24 horas')}
${brandHeadline(type === '2_days' ? 'Te quedan dos días para entrar a la porra.' : 'Mañana pita el árbitro.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola <strong>${escHtml(username)}</strong>, todavía no has enviado tu pronóstico para el Mundial 2026. Una vez arranque el primer partido se cierran los marcadores del torneo entero — no hay segunda oportunidad.
</p>

<div style="margin:0 0 24px;">
  ${brandStatTile({ kicker: 'Tiempo restante', value: `${horas} <span style="font-size:18px;opacity:.7;">h</span>`, sub: 'Hasta el pitido inicial · 11 jun 2026, 21:00 CET' })}
</div>

${brandButton({ href: `${APP_URL}/auth`, label: 'Entrar y pronosticar' })}

<p style="margin:26px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.ink};opacity:.65;text-align:center;">
  Predice marcadores, compite en ligas privadas y suma puntos con los extras.
</p>`

  const html = brandShell({
    title: subject,
    preheader: `Quedan ${horas} horas para el pitido inicial — entra antes de que cierren los marcadores.`,
    content,
    footerNote: `Recibes este email porque tienes los recordatorios activados. Puedes desactivarlos en tu perfil: ${APP_URL}/perfil`,
    appUrl: APP_URL,
  })

  return { subject, html }
}

// ─── Envío via Brevo API ──────────────────────────────────────────────────────

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
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] Comprobando recordatorios pre-Mundial...`)

  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan vars de Supabase'); process.exit(1) }
  if (!BREVO_KEY)                     { console.error('Falta BREVO_API_KEY');      process.exit(1) }

  const hoursLeft = (MUNDIAL_START.getTime() - Date.now()) / 3_600_000

  // Detectar ventana (±1h alrededor de 48h y 24h antes)
  let reminderType = null
  if (hoursLeft >= 47 && hoursLeft < 49) reminderType = '2_days'
  if (hoursLeft >= 23 && hoursLeft < 25) reminderType = '1_day'

  if (!reminderType) {
    console.log(`Fuera de ventana (${Math.round(hoursLeft)}h restantes). Nada que enviar.`)
    return
  }

  console.log(`Ventana: ${reminderType} (${Math.round(hoursLeft)}h restantes)`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const [
    { data: { users: authUsers }, error: usersErr },
    { data: profilesData },
    { data: alreadySent },
    { data: submissions },
  ] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from('profiles').select('id, username').eq('email_reminders', true),
    supabase.from('mundial_reminders').select('user_id').eq('type', reminderType),
    supabase.from('prediction_submissions').select('user_id').eq('source', 'matches'),
  ])

  if (usersErr) throw usersErr

  const emailByUserId  = new Map(authUsers.map(u => [u.id, u.email]))
  const alreadySentIds = new Set((alreadySent  ?? []).map(r => r.user_id))
  const submittedIds   = new Set((submissions  ?? []).map(s => s.user_id))

  let okCount = 0
  let errCount = 0

  for (const profile of (profilesData ?? [])) {
    if (alreadySentIds.has(profile.id)) continue
    if (submittedIds.has(profile.id))   continue

    const email = emailByUserId.get(profile.id)
    if (!email) continue

    try {
      const { subject, html } = buildEmail({ username: profile.username, hoursLeft, type: reminderType })
      await sendEmail(email, subject, html)

      await supabase.from('mundial_reminders').upsert(
        { user_id: profile.id, type: reminderType },
        { onConflict: 'user_id,type', ignoreDuplicates: true }
      )

      console.log(`✉️  Enviado a ${profile.username}`)
      okCount++
    } catch (err) {
      console.error(`❌ Error enviando a ${profile.username}: ${err.message}`)
      errCount++
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`✅ ${okCount} emails enviados · ${errCount} errores · ${elapsed}s`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
