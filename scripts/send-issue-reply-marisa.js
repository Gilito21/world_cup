/**
 * send-issue-reply-marisa.js
 * Respuesta puntual al reporte de Marisa (semifinal Inglaterra–Argentina):
 * explica por qué su marcador exacto no puntuó (regla team-aware del cuadro).
 *
 * Uso:
 *   node scripts/send-issue-reply-marisa.js --preview jpelaez@bluebullpartners.com
 *   node scripts/send-issue-reply-marisa.js --send        (envía a Marisa)
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
  const subject   = 'Sobre tus puntos en la semifinal Inglaterra–Argentina'
  const preheader = 'Revisamos tu pronóstico: acertaste el marcador, pero en tu cuadro ese cruce era Brasil–Argentina. Te lo explicamos.'

  const pathRow = (round, teams, score, advances) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid ${BRAND.rule};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;white-space:nowrap;">${round}</td>
      <td style="padding:9px 12px;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">${teams}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${BRAND.rule};text-align:center;white-space:nowrap;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:13px;font-weight:700;color:${BRAND.ink};">${score}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${BRAND.terra};">${advances}</td>
    </tr>`

  const content = `
${brandKicker('Respuesta a tu reporte')}
${brandHeadline('Revisamos tu semifinal.')}

<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola ${escHtml(name)}, gracias por escribir. Hemos revisado a fondo tu pronóstico de la semifinal <strong>Inglaterra&nbsp;1&ndash;2&nbsp;Argentina</strong> y te lo explicamos con detalle, porque en parte tienes razón: el marcador que pusiste, <strong>1&ndash;2</strong>, coincide con el resultado real.
</p>

<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  El motivo de que no sumara los 3 puntos es una regla de la fase eliminatoria: <strong>el marcador solo cuenta si en tu cuadro llegaban a ese cruce los dos equipos que de verdad jugaron</strong>. Y en tu cuadro, quien llegaba a esa semifinal no era Inglaterra, sino <strong>Brasil</strong>.
</p>

<div style="margin:0 0 14px;">
  ${brandKicker('Tu recorrido de Brasil en el cuadro')}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 6px;">
  <tr>
    <td style="padding:0 0 6px;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.45;">Ronda</td>
    <td style="padding:0 0 6px 12px;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.45;">Cruce en tu cuadro</td>
    <td style="padding:0 0 6px;text-align:center;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.45;">Pusiste</td>
    <td style="padding:0 0 6px;text-align:right;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.45;">Pasaba</td>
  </tr>
  ${pathRow('16avos', 'Brasil–Suecia', '3–1', 'Brasil')}
  ${pathRow('Octavos', 'Brasil–Ecuador', '3–1', 'Brasil')}
  ${pathRow('Cuartos', 'Brasil–Noruega', '3–2', 'Brasil')}
  ${pathRow('Semifinal', 'Brasil–Argentina', '1–2', 'Argentina')}
</table>
<p style="margin:8px 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.7;">
  Esta es tu propia predicción, tal cual aparece en tu página de pronósticos.
</p>

<div style="margin:0 0 22px;padding:16px 18px;background:${BRAND.paper};border-left:3px solid ${BRAND.terra};">
  <p style="margin:0 0 10px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.ink};">
    Es decir: tú hacías campeón de ese lado del cuadro a <strong>Brasil</strong>, pero Brasil cayó pronto (perdió 1&ndash;2 con Noruega en octavos). Tu <strong>1&ndash;2</strong> era en realidad para un <strong>Brasil&ndash;Argentina</strong> que nunca llegó a jugarse.
  </p>
  <p style="margin:0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.ink};">
    Además, a <strong>Inglaterra</strong> la eliminaste en la primera eliminatoria: en tu cuadro tenías Inglaterra&ndash;Noruega y pusiste 1&ndash;2, haciendo pasar a Noruega. Por eso Inglaterra no aparecía en esa semifinal de tu bracket.
  </p>
</div>

<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Se ve claro comparando tus dos semifinales: en <strong>Francia&nbsp;0&ndash;2&nbsp;España</strong> sí tenías los dos equipos correctos en tu cuadro y tu 0&ndash;2 exacto <strong style="color:${BRAND.green};">sumó +3</strong>. En la de Argentina, al no coincidir Brasil con Inglaterra, el mismo acierto de marcador se quedó en <strong>0</strong>. Es la misma regla para todo el mundo: en la eliminatoria cuenta acertar quién llega a cada cruce, no solo el resultado.
</p>

<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  La buena noticia: en la <strong>final</strong> sí tienes bien a los dos equipos (España&ndash;Argentina), así que ahí puntuarás según el resultado.
</p>

${brandButton({ href: `${APP_URL}/pronosticos`, label: 'Ver mi cuadro' })}

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
