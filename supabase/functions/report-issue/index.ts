// report-issue
//
// Recibe un reporte de problema del usuario y lo envía por email a los admins.
// No requiere autenticación (funciona desde landing y login).
//
// POST body: { message: string, username?: string, userEmail?: string, page?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const ALLOWED_ORIGINS = new Set([
  'https://porradeempresas.com',
  'https://www.porradeempresas.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.porradeempresas.com'
  return {
    'Access-Control-Allow-Origin':  allow,
    'Vary':                         'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const ADMIN_EMAIL  = 'jpelaez@bluebullpartners.com'
const FROM_EMAIL   = 'porra@porradeempresas.com'
const FROM_NAME    = 'Porra Mundial 2026'
const BREVO_API    = 'https://api.brevo.com/v3/smtp/email'

Deno.serve(async (req: Request) => {
  const cors = corsFor(req)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405)

  const BREVO_KEY = Deno.env.get('BREVO_API_KEY')
  if (!BREVO_KEY) return json({ error: 'email_not_configured' }, 500)

  let body: { message?: string; username?: string; userEmail?: string; page?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const message   = (body.message ?? '').trim()
  const username  = (body.username ?? '').trim()
  const userEmail = (body.userEmail ?? '').trim()
  const page      = (body.page ?? 'desconocida').trim()

  if (!message || message.length < 5) return json({ error: 'message_too_short' }, 400)
  if (message.length > 2000)          return json({ error: 'message_too_long' }, 400)

  const who = username ? `${username}${userEmail ? ` &lt;${userEmail}&gt;` : ''}` : (userEmail || 'Usuario anónimo')
  const ts  = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b,#f97316);padding:24px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">⚠️ Reporte de problema</p>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Porra Mundial 2026</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;margin-bottom:20px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">De</p>
                  <p style="margin:0;font-size:14px;color:#1c1917;">${who}</p>
                </td>
              </tr>
              <tr><td style="border-top:1px solid #e7e5e4;padding:16px 20px;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Página</p>
                  <p style="margin:0;font-size:14px;color:#1c1917;font-family:monospace;">${page}</p>
              </td></tr>
              <tr><td style="border-top:1px solid #e7e5e4;padding:16px 20px;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Fecha</p>
                  <p style="margin:0;font-size:14px;color:#1c1917;">${ts}</p>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#44403c;text-transform:uppercase;letter-spacing:.05em;">Descripción del problema</p>
            <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:10px;padding:16px 20px;">
              <p style="margin:0;font-size:15px;color:#1c1917;line-height:1.6;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#a8a29e;">Porra Mundial 2026 · porradeempresas.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const brevoRes = await fetch(BREVO_API, {
    method:  'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: ADMIN_EMAIL }],
      replyTo:     userEmail ? { email: userEmail } : undefined,
      subject:     `⚠️ Reporte de problema${username ? ` de ${username}` : ''} · Porra Mundial`,
      htmlContent: html,
    }),
  })

  if (!brevoRes.ok) {
    const err = await brevoRes.text()
    console.error('Brevo error:', err)
    return json({ error: 'email_failed' }, 500)
  }

  return json({ ok: true })
})
