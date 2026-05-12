/**
 * test-email.js
 * Envía un email de prueba para verificar la configuración de Brevo.
 * Uso: node scripts/test-email.js destinatario@email.com
 *
 * Variables de entorno requeridas:
 *   BREVO_API_KEY, FROM_EMAIL, FROM_NAME, APP_URL
 */

import { config } from 'dotenv'
config()

const BREVO_KEY  = process.env.BREVO_API_KEY
const APP_URL    = (process.env.APP_URL ?? 'https://porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@porradeempresas.com'
const FROM_NAME  = process.env.FROM_NAME  ?? 'Porra Empresas'

const to = process.argv[2]
if (!to) { console.error('Uso: node scripts/test-email.js destinatario@email.com'); process.exit(1) }
if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

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
      <p style="margin:0 0 16px;font-size:16px;color:#e7e5e4;">
        ✅ <strong style="color:#fbbf24;">¡El sistema de emails funciona!</strong>
      </p>
      <p style="margin:0 0 24px;color:#a8a29e;font-size:14px;line-height:1.5;">
        Este es un email de prueba. Los recordatorios de partidos se enviarán automáticamente
        cuando el Mundial 2026 empiece y haya partidos próximos sin pronosticar.
      </p>
      <a href="${APP_URL}/auth"
         style="display:block;background:#f59e0b;color:#0c0a09;text-decoration:none;text-align:center;padding:13px 24px;border-radius:12px;font-weight:700;font-size:15px;">
        Entrar y pronosticar →
      </a>
    </div>
    <p style="text-align:center;color:#44403c;font-size:12px;margin-top:20px;">
      Porra Empresas · <a href="${APP_URL}" style="color:#78716c;">porradeempresas.com</a>
    </p>
  </div>
</body>
</html>`

console.log(`Enviando email de prueba a ${to}...`)

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender:      { name: FROM_NAME, email: FROM_EMAIL },
    to:          [{ email: to }],
    subject:     '⚽ Test email — Porra Empresas',
    htmlContent: html,
  }),
})

const body = await res.text()
if (res.ok) {
  console.log('✅ Email enviado correctamente:', body)
} else {
  console.error('❌ Error:', res.status, body)
  process.exit(1)
}
