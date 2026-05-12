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
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_KEY    = process.env.BREVO_API_KEY
const APP_URL      = (process.env.APP_URL ?? 'https://porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL   = process.env.FROM_EMAIL ?? 'noreply@porradeempresas.com'
const FROM_NAME    = process.env.FROM_NAME  ?? 'Porra Empresas'

const MUNDIAL_START = new Date('2026-06-11T21:00:00Z')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Email pre-Mundial ────────────────────────────────────────────────────────

function buildEmail({ username, hoursLeft, type }) {
  const dias    = type === '2_days' ? '2 días' : '1 día'
  const subject = `⚽ Queda ${dias} para el Mundial — ¡envía tu pronóstico!`
  const horas   = Math.round(hoursLeft)

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0c0a09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">

    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:44px;line-height:1;margin-bottom:10px;">⚽</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#f5f5f4;">
        Porra <span style="color:#f59e0b;">Empresas</span>
      </h1>
    </div>

    <div style="background:#1c1917;border:1px solid #292524;border-radius:16px;padding:24px 20px;">
      <p style="margin:0 0 6px;font-size:16px;color:#e7e5e4;">
        Hola <strong style="color:#fbbf24;">${escHtml(username)}</strong> 👋
      </p>
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#f5f5f4;line-height:1.4;">
        Envía tu pronóstico antes de que empiece el Mundial.
      </p>
      <p style="margin:0 0 24px;color:#a8a29e;font-size:14px;line-height:1.5;">
        Quedan <strong style="color:#f59e0b;">${horas} horas</strong> para que empiece.
        Una vez que pite el árbitro ya no podrás cambiar nada.
      </p>
      <a href="${APP_URL}/auth"
         style="display:block;background:#f59e0b;color:#0c0a09;text-decoration:none;text-align:center;padding:13px 24px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.01em;">
        Entrar y pronosticar →
      </a>
    </div>

    <p style="text-align:center;color:#44403c;font-size:12px;margin-top:20px;line-height:1.6;">
      Recibes este email porque tienes los recordatorios activados.<br>
      Puedes desactivarlos desde tu
      <a href="${APP_URL}/perfil" style="color:#78716c;text-decoration:underline;">perfil en la app</a>.
    </p>

  </div>
</body>
</html>`

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
