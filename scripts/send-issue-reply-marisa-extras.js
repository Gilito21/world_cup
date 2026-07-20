/**
 * send-issue-reply-marisa-extras.js
 * Respuesta puntual al reporte de Marisa (pestaña Clasificación):
 * creía no haber recibido puntos por el extra "¿Quién marca más goles,
 * Mbappé o Lamine?". En realidad SÍ los tenía sumados (+2); lo que faltaba
 * era mostrarlo visualmente en la pestaña de Extras, ya arreglado.
 *
 * Uso:
 *   node scripts/send-issue-reply-marisa-extras.js --preview jpelaez@bluebullpartners.com
 *   node scripts/send-issue-reply-marisa-extras.js --send        (envía a Marisa)
 *
 * Variables de entorno: BREVO_API_KEY, APP_URL, FROM_EMAIL, FROM_NAME.
 */

import { config } from 'dotenv'
import { brandShell, brandButton, brandHeadline, brandKicker, escHtml, BRAND } from './_brand-email.js'
config()

const BREVO_KEY  = process.env.BREVO_API_KEY
const APP_URL    = (process.env.APP_URL ?? 'https://www.porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME  = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

const MARISA = { email: 'tomasinfis@gmail.com', name: 'Marisa' }

const args      = new Set(process.argv.slice(2))
const prevIdx   = process.argv.indexOf('--preview')
const previewTo = prevIdx >= 0 ? process.argv[prevIdx + 1] : null

if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

function buildEmail({ name }) {
  const subject   = 'Tus puntos del extra de Mbappé ya estaban sumados'
  const preheader = 'Acertaste que Mbappé marcaría más goles que Lamine: esos 2 puntos siempre estuvieron en tu total. Ahora también los verás en la pestaña.'

  const content = `
${brandKicker('Respuesta a tu reporte')}
${brandHeadline('Sí acertaste: +2 puntos.')}

<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola ${escHtml(name)}, gracias por escribir. Hemos revisado tu pregunta extra <strong>&laquo;¿Quién marcará más goles, Mbappé o Lamine?&raquo;</strong> y te confirmamos que <strong>acertaste</strong>: elegiste a <strong>Mbappé</strong>, que terminó el Mundial con más goles que Lamine.
</p>

<div style="margin:0 0 22px;padding:16px 18px;background:${BRAND.paper};border-left:3px solid ${BRAND.green};">
  <p style="margin:0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.ink};">
    Esos <strong style="color:${BRAND.green};">+2 puntos</strong> han estado sumados en tu total desde que se resolvió la pregunta. No se te ha escapado ningún punto: ya están contando en tu clasificación.
  </p>
</div>

<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  ¿Por qué parecía que no los habías recibido? Porque la pestaña de <strong>Extras</strong> mostraba tu respuesta pero no señalaba el acierto ni los puntos; solo se veía el número final ya sumado en la clasificación. Era fácil pensar que no había contado.
</p>

<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Gracias a tu aviso lo hemos <strong>mejorado</strong>: ahora, en la pestaña de Extras, cada pregunta ya resuelta te muestra la <strong>respuesta correcta</strong>, <strong>tu respuesta</strong> y los <strong>puntos que ganaste</strong>. En la de Mbappé verás la opción marcada en verde y un <strong style="color:${BRAND.green};">+2 pts</strong> bien claro.
</p>

${brandButton({ href: `${APP_URL}/extras`, label: 'Ver mis extras' })}

<p style="margin:26px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.55;text-align:center;">
  Si algo no te cuadra, responde a este correo y lo miramos contigo.
</p>
`

  const html = brandShell({
    title: subject,
    preheader,
    content,
    footerNote: 'Recibes este correo como respuesta al problema que reportaste desde la app.',
    appUrl: APP_URL,
  })

  return { subject, html }
}

async function sendEmail(to, toName, subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`)
}

async function main() {
  const { subject, html } = buildEmail({ name: MARISA.name })

  if (previewTo) {
    await sendEmail(previewTo, 'Jaime', `[Preview] ${subject}`, html)
    console.log(`Preview enviado a ${previewTo}`)
    console.log(`  Subject: ${subject}`)
    return
  }

  if (args.has('--send')) {
    await sendEmail(MARISA.email, MARISA.name, subject, html)
    console.log(`Enviado a ${MARISA.name} <${MARISA.email}>`)
    return
  }

  console.log('Uso:')
  console.log('  --preview <email>   (envía muestra)')
  console.log('  --send              (envía a Marisa)')
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
