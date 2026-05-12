// notify-new-user
//
// Envía un email de notificación al admin cuando se registra un nuevo usuario.
// Llamada desde el frontend justo después de supabase.auth.signUp().
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
const BREVO_API   = 'https://api.brevo.com/v3/smtp/email'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405)

  const BREVO_KEY = Deno.env.get('BREVO_API_KEY')
  if (!BREVO_KEY) return json({ error: 'email_not_configured' }, 500)

  let body: { email?: string; username?: string; company?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const email    = (body.email    ?? '').trim()
  const username = (body.username ?? '').trim()
  const company  = (body.company  ?? '').trim()
  const ts       = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4;">
        <tr>
          <td style="background:linear-gradient(135deg,#10b981,#059669);padding:24px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#fff;">🎉 Nuevo usuario registrado</p>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Porra Mundial 2026</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:10px;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Usuario</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1c1917;">${username || '—'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Email</p>
                  <p style="margin:0;font-size:14px;color:#1c1917;">${email || '—'}</p>
                </td>
              </tr>
              ${company ? `
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e7e5e4;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Empresa</p>
                  <p style="margin:0;font-size:14px;color:#1c1917;">${company}</p>
                </td>
              </tr>` : ''}
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#a8a29e;text-transform:uppercase;letter-spacing:.06em;">Fecha de registro</p>
                  <p style="margin:0;font-size:14px;color:#1c1917;">${ts}</p>
                </td>
              </tr>
            </table>
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
      subject:     `🎉 Nuevo usuario: ${username || email} · Porra Mundial`,
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
