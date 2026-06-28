/**
 * send-points-explainer.js
 * Email explicativo de cómo funcionan los puntos, con foco en los puntos de
 * cuadro (avance por ronda). Pensado para enviarse al arrancar la fase
 * eliminatoria.
 *
 * Uso:
 *   node scripts/send-points-explainer.js --preview jpelaez@bluebullpartners.com
 *   node scripts/send-points-explainer.js --dry-run
 *   node scripts/send-points-explainer.js --send-all
 *
 * Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
 *                       APP_URL, FROM_EMAIL, FROM_NAME.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { brandShell, brandButton, brandHeadline, brandKicker, escHtml, BRAND } from './_brand-email.js'
config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BREVO_KEY    = process.env.BREVO_API_KEY
const APP_URL      = (process.env.APP_URL ?? 'https://www.porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL   = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME    = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

const args       = new Set(process.argv.slice(2))
const prevArgIdx = process.argv.indexOf('--preview')
const previewTo  = prevArgIdx >= 0 ? process.argv[prevArgIdx + 1] : null

if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY'); process.exit(1) }

// ─── Email builder ────────────────────────────────────────────────────────────

function buildEmail({ username }) {
  const subject   = 'Así van tus puntos ahora (el cuadro cuenta)'
  const preheader = 'Con la fase eliminatoria en marcha, los puntos de cuadro se suman a tus pronósticos. Aquí te explicamos cómo.'

  const roundRow = (round, pts, total) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">${round}</td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:13px;color:${BRAND.terra};font-weight:700;">+${pts}</td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:${BRAND.ink};opacity:.55;">${total} acum.</td>
    </tr>`

  const content = `
${brandKicker('Fase eliminatoria · Mundial 2026')}
${brandHeadline('Los puntos del cuadro ya corren.')}

<p style="margin:0 0 20px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola ${escHtml(username)}, la fase de grupos terminó y la eliminatoria está en marcha. Además de los puntos de tus pronósticos de partido, ahora también cuentan los <strong>puntos de cuadro</strong>: los que ganas por acertar hasta dónde llega cada selección. Aquí va el desglose completo.
</p>

<!-- Bloque 1: pronósticos de partido -->
<div style="margin:0 0 28px;">
  ${brandKicker('01 · Pronósticos de partido')}
  <p style="margin:8px 0 12px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${BRAND.ink};opacity:.85;">
    Cada partido que pronosticas suma según el acierto:
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">
        <strong>Marcador exacto</strong>
        <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.ink};opacity:.5;margin-top:3px;">Ej: predijiste 2–1, fue 2–1</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.rule};text-align:right;vertical-align:middle;white-space:nowrap;">
        <span style="display:inline-block;background:${BRAND.green};color:${BRAND.cream};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:13px;letter-spacing:.06em;padding:5px 12px;">+3</span>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">
        <strong>Tendencia correcta</strong>
        <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.ink};opacity:.5;margin-top:3px;">Ej: predijiste 2–1, fue 3–0 (mismo ganador)</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.rule};text-align:right;vertical-align:middle;white-space:nowrap;">
        <span style="display:inline-block;background:${BRAND.terra};color:${BRAND.cream};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:13px;letter-spacing:.06em;padding:5px 12px;">+1</span>
      </td>
    </tr>
    <tr>
      <td style="padding:10px 12px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">
        <strong>Fallo</strong>
        <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.ink};opacity:.5;margin-top:3px;">Ej: predijiste victoria y fue empate</div>
      </td>
      <td style="padding:10px 12px;text-align:right;vertical-align:middle;white-space:nowrap;">
        <span style="display:inline-block;background:transparent;border:1px solid ${BRAND.rule};color:${BRAND.ink};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:13px;letter-spacing:.06em;padding:5px 12px;opacity:.6;">0</span>
      </td>
    </tr>
  </table>
</div>

<!-- Bloque 2: puntos de cuadro -->
<div style="margin:0 0 28px;">
  ${brandKicker('02 · Puntos de cuadro (avance por ronda)')}
  <p style="margin:8px 0 12px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${BRAND.ink};opacity:.85;">
    Por cada selección que aciertas que pasa de ronda, sumas puntos incrementales. El contador va subiendo conforme avanza en el torneo:
  </p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
    <tr>
      <td style="padding:6px 0 4px;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.45;">Ronda</td>
      <td style="padding:6px 0 4px;text-align:right;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.45;">Pts.</td>
      <td style="padding:6px 0 4px;text-align:right;font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.45;">Total</td>
    </tr>
    ${roundRow('Pasar de grupos (32avos)', 1, 1)}
    ${roundRow('Octavos de final', 2, 3)}
    ${roundRow('Cuartos de final', 3, 6)}
    ${roundRow('Semifinal', 4, 10)}
    ${roundRow('Final', 5, 15)}
    ${roundRow('Campeón del mundo', 6, 21)}
  </table>
  <p style="margin:14px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.65;">
    Si acertaste que una selección llegaba a la final y finalmente gana el torneo, cobras los puntos de la final (+5, total 15) pero no los del campeón, porque no llegaste a predecirlo. Y al revés: si predijiste campeón a un equipo que sale en cuartos, cobras solo hasta ahí (total 6 pts). <strong style="color:${BRAND.ink};opacity:.85;">Cuenta el mínimo entre lo que tú predijiste y lo que ocurre de verdad.</strong>
  </p>
</div>

<!-- Bloque 3: extras -->
<div style="margin:0 0 28px;">
  ${brandKicker('03 · Preguntas extra')}
  <p style="margin:8px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${BRAND.ink};opacity:.85;">
    MVP / Bota de oro, duelo Mbappé vs Lamine y total de tarjetas: estas preguntas se resuelven al final del torneo y pueden mover bastante la clasificación. Los puntos están fijos en las reglas de tu porra.
  </p>
</div>

${brandButton({ href: `${APP_URL}/clasificacion`, label: 'Ver mi clasificación' })}

<p style="margin:26px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.55;text-align:center;">
  ¿Dudas? Responde a este correo y te aclaramos lo que sea.
</p>
`

  const html = brandShell({
    title: subject,
    preheader,
    content,
    footerNote: `Recibes esto porque tienes los recordatorios activados. Puedes desactivarlos en ${APP_URL}/perfil`,
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
  const PAGE = 1000
  const authUsers = []
  for (let p = 1; p <= 50; p++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: p, perPage: PAGE })
    if (error) throw error
    authUsers.push(...data.users)
    if (data.users.length < PAGE) break
  }

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, username, email_reminders')
    .eq('email_reminders', true)
    .eq('email_confirmed', true)
  if (profErr) throw profErr

  const emailByUserId = new Map(authUsers.map(u => [u.id, { email: u.email, confirmed: !!u.email_confirmed_at }]))

  return profiles
    .map(p => ({ ...p, ...(emailByUserId.get(p.id) ?? {}) }))
    .filter(r => r.email && r.confirmed)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (previewTo) {
    const { subject, html } = buildEmail({ username: 'Jaime' })
    await sendEmail(previewTo, 'Jaime', `[Preview] ${subject}`, html)
    console.log(`Preview enviado a ${previewTo}`)
    console.log(`  Subject: ${subject}`)
    return
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const audience = await fetchAudience(supabase)
  console.log(`\nAudiencia: ${audience.length} usuarios con recordatorios activados.`)

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

  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(`\n¿Enviar a ${audience.length} usuarios? (escribe "SI" para confirmar): `)
  rl.close()
  if (answer.trim().toUpperCase() !== 'SI') { console.log('Cancelado.'); return }

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
    await new Promise(res => setTimeout(res, 250))
  }
  console.log(`\nResultado: ${ok} enviados · ${fail} errores`)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
