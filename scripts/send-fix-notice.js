/**
 * send-fix-notice.js
 * Plantilla reutilizable para avisar a un usuario de que la incidencia
 * que reportó ya está resuelta. Usa la marca editorial común a todos los
 * correos del proyecto.
 *
 * Pensado como "precedente" para cuando llegan más errores: rellenas los
 * flags con el caso concreto y lo mandas, sin tocar el código.
 *
 * Uso:
 *   # 1) Renderiza sin enviar (escribe el HTML en /tmp para revisarlo)
 *   node scripts/send-fix-notice.js --dry-run \
 *     --to inpastor8@gmail.com --name "Iñigo" \
 *     --subject "Ya puedes enviar tus extra 🎲" \
 *     --headline "Ya está arreglado, Iñigo." \
 *     --message "Nos avisaste de que no te dejaba enviar las preguntas extra. Ya está solucionado." \
 *     --cta-path /extras --cta-label "Completar mis extras"
 *
 *   # 2) Preview real a tu propio correo antes de mandarlo al usuario
 *   node scripts/send-fix-notice.js --preview jpelaez@bluebullpartners.com  ...mismos flags...
 *
 *   # 3) Envío real al usuario (--to)
 *   node scripts/send-fix-notice.js --send  ...mismos flags...
 *
 * Variables de entorno: BREVO_API_KEY, FROM_EMAIL, FROM_NAME, APP_URL
 */

import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { brandShell, brandButton, brandHeadline, brandKicker, BRAND } from './_brand-email.js'
config()

const BREVO_KEY  = process.env.BREVO_API_KEY
const APP_URL    = (process.env.APP_URL ?? 'https://www.porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME  = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

// ── Parseo de flags ───────────────────────────────────────────────────────
const args = process.argv.slice(2)
function flag(name, fallback = null) {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const isDryRun  = args.includes('--dry-run')
const isSend    = args.includes('--send')
const previewTo = flag('preview')

// Contenido del aviso (con defaults sensatos para el caso de los extras).
const to        = flag('to')
const name      = flag('name', '')
const greeting  = name ? `, ${name}` : ''
const subject   = flag('subject', `Tu incidencia ya está resuelta${greeting} ✅`)
const headline  = flag('headline', `Ya está arreglado${greeting}.`)
const message   = flag('message', 'Nos avisaste de un problema y ya está solucionado. Entra de nuevo y debería ir todo bien.')
const ctaLabel  = flag('cta-label', 'Volver a la porra')
const ctaPath   = flag('cta-path', '/')
const kicker    = flag('kicker', 'Incidencia resuelta')
// Texto de vista previa (lo que muestra el cliente de correo tras el asunto).
// Por defecto, un teaser a partir del titular; configurable con --preheader.
const preheader = flag('preheader', headline.replace(/\s*[.!?]+\s*$/, ''))

const recipient = previewTo
  ? { email: previewTo, name: name || 'Preview' }
  : (to ? { email: to, name } : null)

const content = `
${brandKicker(kicker)}
${brandHeadline(headline)}
<p style="margin:0 0 26px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  ${message}
</p>
${brandButton({ href: `${APP_URL}${ctaPath}`, label: ctaLabel })}
`

const html = brandShell({
  title: subject,
  preheader,
  content,
  appUrl: APP_URL,
})

// ── Salidas ───────────────────────────────────────────────────────────────
if (isDryRun) {
  const out = '/tmp/fix-notice-preview.html'
  writeFileSync(out, html)
  console.log('[dry-run] No se envía nada.')
  console.log(`[dry-run] Destinatario real (--to): ${to ?? '(sin definir)'}`)
  console.log(`[dry-run] Asunto: ${subject}`)
  console.log(`[dry-run] HTML escrito en: ${out}`)
  process.exit(0)
}

if (!previewTo && !isSend) {
  console.error('Nada que hacer. Usa --dry-run, --preview <email> o --send.')
  process.exit(1)
}
if (!recipient) {
  console.error('Falta destinatario: pasa --to <email> (o --preview <email> para prueba).')
  process.exit(1)
}
if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

console.log(`Enviando a ${recipient.name || '?'} <${recipient.email}>${previewTo ? ' (PREVIEW)' : ''}...`)

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender:      { name: FROM_NAME, email: FROM_EMAIL },
    to:          [{ email: recipient.email, name: recipient.name }],
    subject,
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
