// notify-new-user
//
// 1) Notifica al admin de un nuevo registro.
// 2) Envía email de bienvenida al nuevo usuario.
//
// POST body: { email: string, username: string, company?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ADMIN_EMAIL = 'jpelaez@bluebullpartners.com'
const FROM_EMAIL  = 'porra@porradeempresas.com'
const FROM_NAME   = 'Porra Mundial 2026'
const APP_URL     = 'https://www.porradeempresas.com'
const BREVO_API   = 'https://api.brevo.com/v3/smtp/email'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch(BREVO_API, {
    method:  'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`Brevo error sending to ${to}:`, err)
    throw new Error(`brevo_${res.status}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405)

  const BREVO_KEY = Deno.env.get('BREVO_API_KEY')
  if (!BREVO_KEY) {
    console.error('BREVO_API_KEY not set')
    return json({ error: 'email_not_configured' }, 500)
  }

  let body: { email?: string; username?: string; company?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const email    = (body.email    ?? '').trim()
  const username = (body.username ?? '').trim()
  const company  = (body.company  ?? '').trim()
  const ts       = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  // ── 1. Email al admin ─────────────────────────────────────────────────────
  const adminHtml = `
<!DOCTYPE html><html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr><td style="background:linear-gradient(135deg,#10b981,#059669);padding:24px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">🎉 Nuevo usuario registrado</p>
          <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Porra Mundial 2026</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Usuario</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#1c1917;">${username || '—'}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Email</p>
              <p style="margin:0;font-size:14px;color:#1c1917;">${email || '—'}</p>
            </td></tr>
            ${company ? `<tr><td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Empresa</p>
              <p style="margin:0;font-size:14px;color:#1c1917;">${company}</p>
            </td></tr>` : ''}
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Fecha</p>
              <p style="margin:0;font-size:14px;color:#1c1917;">${ts}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 24px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#a8a29e;">Porra Mundial 2026 · porradeempresas.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  // ── 2. Email de bienvenida al usuario ─────────────────────────────────────
  const welcomeHtml = `
<!DOCTYPE html><html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr><td style="background:linear-gradient(135deg,#f59e0b,#f97316);padding:32px;text-align:center;">
          <p style="margin:0;font-size:40px;">⚽</p>
          <p style="margin:8px 0 0;font-size:22px;font-weight:700;color:#fff;">¡Bienvenido a la Porra!</p>
          <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Mundial 2026 · México, Canadá & USA</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;color:#1c1917;">Hola <strong>${username || 'crack'}</strong>,</p>
          <p style="margin:0 0 20px;font-size:15px;color:#44403c;line-height:1.6;">
            Ya eres parte de la porra del Mundial 2026. El torneo empieza el <strong>11 de junio de 2026</strong> — tienes tiempo de sobra para hacer tus pronósticos.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
              <p style="margin:0;font-size:14px;color:#1c1917;">🎯 <strong>Pronósticos</strong> — predice el marcador exacto de cada partido</p>
            </td></tr>
            <tr><td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
              <p style="margin:0;font-size:14px;color:#1c1917;">🏆 <strong>Ligas privadas</strong> — compite con tus amigos o compañeros</p>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:14px;color:#1c1917;">🎲 <strong>Extras</strong> — preguntas especiales para ganar puntos bonus</p>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#1c1917;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
                Entrar a la app →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 24px;text-align:center;border-top:1px solid #f5f5f4;">
          <p style="margin:16px 0 4px;font-size:12px;color:#a8a29e;">¿Preguntas? Responde a este email.</p>
          <p style="margin:0;font-size:12px;color:#a8a29e;">Porra Mundial 2026 · porradeempresas.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const results = await Promise.allSettled([
    sendEmail(BREVO_KEY, ADMIN_EMAIL, `🎉 Nuevo usuario: ${username || email} · Porra Mundial`, adminHtml),
    email ? sendEmail(BREVO_KEY, email, '⚽ ¡Bienvenido a la Porra del Mundial 2026!', welcomeHtml) : Promise.resolve(),
  ])

  const adminFailed   = results[0].status === 'rejected'
  const welcomeFailed = results[1].status === 'rejected'

  if (adminFailed) console.error('Admin notification failed:', (results[0] as PromiseRejectedResult).reason)
  if (welcomeFailed) console.error('Welcome email failed:', (results[1] as PromiseRejectedResult).reason)

  return json({ ok: true, adminFailed, welcomeFailed })
})
