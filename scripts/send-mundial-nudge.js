/**
 * send-mundial-nudge.js
 * Recordatorio "ya se conocen las alineaciones" — disparo único a usuarios
 * NO-BlueBull con recordatorios activados, días antes del Mundial.
 *
 * Filtro de audiencia (todos los criterios se aplican):
 *   - email_confirmed_at IS NOT NULL en auth.users
 *   - email NO termina en @bluebullpartners.com
 *   - profiles.company NO contiene "bluebull" / "blue bull"
 *   - user_id NO está en league_members de la liga "BlueBull"
 *   - profiles.email_reminders = true (respeta opt-out)
 *
 * Uso:
 *   node scripts/send-mundial-nudge.js --preview destinatario@email.com
 *     → genera el HTML real con la fecha de hoy y lo envía SOLO a esa dirección.
 *
 *   node scripts/send-mundial-nudge.js --send-all
 *     → envía a toda la audiencia. Pide confirmación interactiva.
 *
 *   node scripts/send-mundial-nudge.js --dry-run
 *     → lista la audiencia sin enviar nada.
 *
 * Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
 *                       APP_URL, FROM_EMAIL, FROM_NAME.
 *
 * Este script NO usa la tabla `mundial_reminders` (esa es para los crons 48h/24h).
 * Es un disparo manual one-shot.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { brandShell, brandButton, brandHeadline, brandKicker, brandStatTile, escHtml, BRAND } from './_brand-email.js'
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_KEY    = process.env.BREVO_API_KEY
const APP_URL      = (process.env.APP_URL ?? 'https://www.porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL   = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME    = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

const BLUEBULL_LEAGUE_ID = '43d8d693-7bb1-48f0-85c4-765754eedf05'
const MUNDIAL_START      = new Date('2026-06-11T19:00:00Z') // 21:00 CET
const IMAGE_URL          = 'https://porradeempresas.com/mourinho-here-we-go.jpg'

const args = new Set(process.argv.slice(2))
const previewArgIdx = process.argv.indexOf('--preview')
const previewTo = previewArgIdx >= 0 ? process.argv[previewArgIdx + 1] : null

if (!BREVO_KEY)   { console.error('Falta BREVO_API_KEY'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan vars de Supabase'); process.exit(1) }

const daysLeft = Math.max(0, Math.ceil((MUNDIAL_START.getTime() - Date.now()) / 86400_000))

// ─── Email builder ────────────────────────────────────────────────────────────

function buildEmail({ username }) {
  const subject   = 'Tenemos «Here we go» antes que tu porra.'
  const preheader = `Mourinho vuelve al Madrid antes que tú envías tus pronósticos. Faltan ${daysLeft} días para el Mundial.`

  const content = `
<!-- Imagen de cabecera · Mourinho "Here we go" (hosteada en porradeempresas.com) -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;border-collapse:collapse;">
  <tr><td align="center">
    <img src="${IMAGE_URL}" width="360" height="480" alt="Mourinho · Here we go" style="display:block;width:100%;max-width:360px;height:auto;border:1px solid ${BRAND.ink};outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;">
  </td></tr>
  <tr><td align="center" style="padding:10px 0 0;">
    <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;">Fabrizio Romano &middot; rumor confirmado &middot; tu porra no</div>
  </td></tr>
</table>

${brandKicker(`Cuenta atrás · ${daysLeft} días`)}
${brandHeadline('Tenemos «Here we go» antes que tus pronósticos.')}

<p style="margin:0 0 16px;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-size:18px;line-height:1.5;color:${BRAND.ink};font-style:italic;">
  Si Fabrizio Romano cantara el fichaje más improbable del año, llegaría a Twitter antes que tu porra a esta app. Y mira que Mourinho volver al Madrid es difícil, <strong style="font-style:normal;font-family:Inter,sans-serif;">${escHtml(username)}</strong>.
</p>

<p style="margin:0 0 24px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Las federaciones van soltando convocatorias. Los analistas afilan sus cábalas. Las casas de apuestas cierran cuotas. En poco más de tres semanas arranca el Mundial 2026 — México, Canadá y Estados Unidos — y una vez pite el árbitro del primer partido, los marcadores del torneo entero se cierran. Estos días previos son el momento dulce: estudias la fase de grupos, juegas con los resultados y dejas tu porra cerrada antes de que empiece el ruido.
</p>

<div style="margin:0 0 26px;">
  ${brandStatTile({ kicker: 'Hasta el pitido inicial', value: `${daysLeft} <span style="font-size:18px;opacity:.7;">días</span>`, sub: '11 de junio · México DF, Azteca · 21:00 CET' })}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border-collapse:collapse;">
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">01</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Pronósticos</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Predice el marcador de cada partido del torneo, fase a fase.</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">02</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Extras</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Campeón, bota de oro, sorpresas del torneo — los bonus que deciden la clasificación.</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};border-bottom:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">03</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Ligas privadas</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Tu clasificación con amigos o compañeros, separada de la global.</div>
      </td>
    </tr></table>
  </td></tr>
</table>

${brandButton({ href: `${APP_URL}/pronosticos`, label: 'Enviar mi pronóstico' })}

<p style="margin:26px 0 0;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;line-height:1.6;color:${BRAND.ink};opacity:.55;text-align:center;letter-spacing:.06em;">
  CIERRE DE MARCADORES &nbsp;·&nbsp; 11 JUN 2026 &nbsp;·&nbsp; 21:00 CET
</p>
`

  const html = brandShell({
    title: subject,
    preheader,
    content,
    footerNote: `Recibes este aviso porque tienes los recordatorios activados. Puedes desactivarlos en tu perfil: ${APP_URL}/perfil`,
    appUrl: APP_URL,
  })

  return { subject, html }
}

// ─── Brevo ────────────────────────────────────────────────────────────────────

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
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
}

// ─── Audiencia ────────────────────────────────────────────────────────────────

async function fetchAudience(supabase) {
  // Paginamos auth.admin.listUsers para obtener email + email_confirmed_at.
  const PAGE = 1000
  const authUsers = []
  for (let p = 1; p <= 50; p++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: p, perPage: PAGE })
    if (error) throw error
    authUsers.push(...data.users)
    if (data.users.length < PAGE) break
  }

  const bbMembers = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', BLUEBULL_LEAGUE_ID)
  if (bbMembers.error) throw bbMembers.error
  const bbMemberIds = new Set(bbMembers.data.map(r => r.user_id))

  const profiles = await supabase
    .from('profiles')
    .select('id, username, company, email_reminders')
    .eq('email_reminders', true)
    .eq('email_confirmed', true)
  if (profiles.error) throw profiles.error

  const emailByUserId = new Map(authUsers.map(u => [u.id, { email: u.email, confirmed: !!u.email_confirmed_at }]))

  return profiles.data
    .map(p => ({ ...p, ...(emailByUserId.get(p.id) ?? {}) }))
    .filter(r => r.email && r.confirmed)
    .filter(r => !r.email.toLowerCase().endsWith('@bluebullpartners.com'))
    .filter(r => !/\bblue\s*bull\b/i.test(r.company ?? ''))
    .filter(r => !bbMemberIds.has(r.id))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Modo preview: render con username genérico, envío a una sola dirección.
  if (previewTo) {
    const { subject, html } = buildEmail({ username: 'Jaime' })
    await sendEmail(previewTo, 'Jaime', `[Draft] ${subject}`, html)
    console.log(`Preview enviado a ${previewTo}.`)
    console.log(`  Subject:   ${subject}`)
    console.log(`  Días hasta el Mundial: ${daysLeft}`)
    return
  }

  const audience = await fetchAudience(supabase)
  console.log(`\nAudiencia: ${audience.length} usuarios no-BlueBull con recordatorios activados.`)

  if (args.has('--dry-run')) {
    for (const r of audience) console.log(`  · ${r.username.padEnd(22)} ${r.email}`)
    return
  }

  if (!args.has('--send-all')) {
    console.log('\nUso:')
    console.log('  --preview <email>   (envía 1 muestra)')
    console.log('  --dry-run           (lista la audiencia)')
    console.log('  --send-all          (envía al grupo entero)')
    return
  }

  // Confirmación interactiva antes del disparo masivo.
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(`\n¿Enviar a ${audience.length} usuarios? (escribe "SI" para confirmar): `)
  rl.close()
  if (answer.trim().toUpperCase() !== 'SI') {
    console.log('Cancelado.')
    return
  }

  let ok = 0, fail = 0
  for (const r of audience) {
    try {
      const { subject, html } = buildEmail({ username: r.username })
      await sendEmail(r.email, r.username, subject, html)
      console.log(`  ✓ ${r.username} <${r.email}>`)
      ok++
    } catch (err) {
      console.error(`  ✗ ${r.username}: ${err.message}`)
      fail++
    }
    await new Promise(r => setTimeout(r, 250))
  }
  console.log(`\nResultado: ${ok} enviados · ${fail} errores`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
