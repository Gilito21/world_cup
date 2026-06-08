/**
 * send-fix-notice.js
 * Aviso puntual a un usuario de que la incidencia del envío de
 * pronósticos extra ya está resuelta. Usa la marca editorial común.
 *
 * Uso:
 *   node scripts/send-fix-notice.js --dry-run            # solo renderiza (no envía)
 *   node scripts/send-fix-notice.js --preview tu@email   # envía a otro destinatario (prueba)
 *   node scripts/send-fix-notice.js --send               # envía al destinatario real
 *
 * Variables de entorno: BREVO_API_KEY, FROM_EMAIL, FROM_NAME, APP_URL
 */

import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { brandShell, brandButton, brandHeadline, brandKicker, brandFeatureRow, BRAND } from './_brand-email.js'
config()

const BREVO_KEY  = process.env.BREVO_API_KEY
const APP_URL    = (process.env.APP_URL ?? 'https://www.porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME  = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

// Destinatario real
const TARGET = { email: 'inpastor8@gmail.com', name: 'Iñigo' }

const args      = process.argv.slice(2)
const isDryRun  = args.includes('--dry-run')
const previewIx = args.indexOf('--preview')
const previewTo = previewIx !== -1 ? args[previewIx + 1] : null

const recipient = previewTo ? { email: previewTo, name: 'Iñigo' } : TARGET

const SUBJECT = 'Iñigo, ya puedes enviar tus pronósticos extra 🎲'

const content = `
${brandKicker('Incidencia resuelta')}
${brandHeadline('Ya está arreglado, Iñigo.')}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Nos avisaste de que no te dejaba <strong>enviar las preguntas extra</strong>. Ya lo hemos solucionado: entra de nuevo y podrás mandarlas sin líos.
</p>
<p style="margin:0 0 24px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.ink};opacity:.78;">
  De paso lo hemos mejorado un poco. Échale un ojo:
</p>
${brandFeatureRow({ icon: '💾', title: 'Se guarda solo', body: 'Cada respuesta se guarda según la escribes. Ya no hace falta pulsar “Guardar” en cada pregunta.' })}
${brandFeatureRow({ icon: '✏️', title: 'Editable hasta el cierre', body: 'Puedes cambiar tus respuestas hasta 1 hora antes del primer partido, por si te lo repiensas.' })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:28px 0 4px;">
  ${brandButton({ href: `${APP_URL}/extras`, label: 'Completar mis extras' })}
</td></tr></table>
`

const html = brandShell({
  title: 'Ya puedes enviar tus pronósticos extra',
  preheader: 'Arreglado el problema con el envío de las preguntas extra.',
  content,
  appUrl: APP_URL,
})

if (isDryRun) {
  const out = '/tmp/fix-notice-preview.html'
  writeFileSync(out, html)
  console.log(`[dry-run] No se envía nada.`)
  console.log(`[dry-run] Destinatario real: ${TARGET.name} <${TARGET.email}>`)
  console.log(`[dry-run] Asunto: ${SUBJECT}`)
  console.log(`[dry-run] HTML escrito en: ${out}`)
  process.exit(0)
}

if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

console.log(`Enviando a ${recipient.name} <${recipient.email}>${previewTo ? ' (PREVIEW)' : ''}...`)

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender:      { name: FROM_NAME, email: FROM_EMAIL },
    to:          [{ email: recipient.email, name: recipient.name }],
    subject:     SUBJECT,
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
