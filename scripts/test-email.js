/**
 * test-email.js
 * Smoke-test del sistema de emails con la marca editorial.
 * Uso: node scripts/test-email.js destinatario@email.com
 *
 * Variables de entorno requeridas:
 *   BREVO_API_KEY, FROM_EMAIL, FROM_NAME, APP_URL
 */

import { config } from 'dotenv'
import { brandShell, brandButton, brandHeadline, brandKicker, BRAND } from './_brand-email.js'
config()

const BREVO_KEY  = process.env.BREVO_API_KEY
const APP_URL    = (process.env.APP_URL ?? 'https://porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME  = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

const to = process.argv[2]
if (!to)        { console.error('Uso: node scripts/test-email.js destinatario@email.com'); process.exit(1) }
if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

const content = `
${brandKicker('Test · sistema de envíos')}
${brandHeadline('El sistema de emails está vivo.')}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Si lees esto, significa que <strong>Brevo</strong> acepta nuestra clave, el dominio remitente está bien configurado y los estilos editoriales sobreviven al cliente de correo.
</p>
<p style="margin:0 0 28px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.ink};opacity:.72;">
  Cuando arranque el Mundial, los recordatorios y resúmenes diarios saldrán con esta misma identidad.
</p>
${brandButton({ href: `${APP_URL}/auth`, label: 'Entrar a la app' })}
`

const html = brandShell({
  title: 'Test · Porra de Empresas',
  preheader: 'El sistema de emails funciona — listos para el Mundial 2026.',
  content,
  footerNote: 'Esto es un email de prueba enviado desde scripts/test-email.js.',
  appUrl: APP_URL,
})

console.log(`Enviando email de prueba a ${to}...`)

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender:      { name: FROM_NAME, email: FROM_EMAIL },
    to:          [{ email: to }],
    subject:     'Test · Porra de Empresas',
    htmlContent: html,
  }),
})

const body = await res.text()
if (res.ok) {
  console.log('Email enviado:', body)
} else {
  console.error('Error:', res.status, body)
  process.exit(1)
}
