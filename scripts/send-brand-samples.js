/**
 * send-brand-samples.js
 * Envía una muestra de cada email transaccional (welcome, admin notif,
 * recordatorios, digest, auth) a la dirección que pases por argumento,
 * para revisar visualmente la marca antes de subir nada a producción.
 *
 * Uso:   node scripts/send-brand-samples.js destinatario@email.com
 *
 * Cada subject va prefijado con "[Muestra]" para que sea claro que no
 * son emails reales del sistema. No toca la base de datos.
 *
 * Variables de entorno:
 *   BREVO_API_KEY (obligatoria)
 *   FROM_EMAIL, FROM_NAME, APP_URL (opcionales)
 */

import { config } from 'dotenv'
import { brandShell, brandButton, brandHeadline, brandKicker, brandStatTile, escHtml, BRAND } from './_brand-email.js'
config()

const BREVO_KEY  = process.env.BREVO_API_KEY
const APP_URL    = (process.env.APP_URL ?? 'https://porradeempresas.com').replace(/\/$/, '')
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'porra@porradeempresas.com'
const FROM_NAME  = process.env.FROM_NAME  ?? 'Porra Mundial 2026'

const to = process.argv[2]
if (!to)        { console.error('Uso: node scripts/send-brand-samples.js destinatario@email.com'); process.exit(1) }
if (!BREVO_KEY) { console.error('Falta BREVO_API_KEY en el entorno'); process.exit(1) }

const username = 'Jaime'
const fakeUrl  = `${APP_URL}/auth?sample=1`

// ── Welcome ───────────────────────────────────────────────────────────────────
const welcome = {
  subject: '[Muestra] Bienvenido a la Porra de Empresas · Mundial 2026',
  html: brandShell({
    title: 'Bienvenido a la Porra de Empresas',
    preheader: 'Ya eres parte de la porra del Mundial 2026. Edición ’26.',
    content: `
${brandKicker('Bienvenido · Edición ’26')}
${brandHeadline(`Hola ${escHtml(username)}, ya estás dentro.`)}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Bienvenido a la <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Porra de Empresas</em> del Mundial 2026. El torneo arranca el <strong>11 de junio de 2026</strong> en México, Canadá y Estados Unidos — tienes tiempo de sobra para preparar tus pronósticos.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;border-collapse:collapse;">
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">01</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Pronósticos</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Predice el marcador exacto de cada partido del torneo.</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">02</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Ligas privadas</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Compite con amigos o con tu empresa en clasificaciones propias.</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};border-bottom:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">03</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Extras</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Preguntas especiales (campeón, bota de oro, sorpresas) para sumar bonus.</div>
      </td>
    </tr></table>
  </td></tr>
</table>
${brandButton({ href: APP_URL, label: 'Entrar a la app' })}`,
    footerNote: '¿Preguntas? Responde a este email y te leemos.',
    appUrl: APP_URL,
  }),
}

// ── Admin notif ───────────────────────────────────────────────────────────────
const adminNotif = {
  subject: '[Muestra] Nuevo usuario · Jaime · Porra de Empresas',
  html: brandShell({
    title: 'Nuevo usuario · Jaime',
    preheader: 'Jaime acaba de confirmar su email (Bluebull Partners).',
    content: `
${brandKicker('Admin · alta confirmada')}
${brandHeadline('Nuevo usuario en la porra.')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:6px 0 24px;">
  ${[
    { k: 'Usuario',  v: 'Jaime' },
    { k: 'Email',    v: 'jpelaez@bluebullpartners.com' },
    { k: 'Empresa',  v: 'Bluebull Partners' },
    { k: 'Fecha',    v: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }) },
  ].map((r, i, arr) => `
    <tr><td style="padding:14px 0;border-top:1px solid ${BRAND.rule};${i === arr.length - 1 ? `border-bottom:1px solid ${BRAND.rule};` : ''}">
      <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;">${r.k}</div>
      <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};margin-top:4px;${r.k === 'Usuario' ? 'font-weight:600;' : ''}">${escHtml(r.v)}</div>
    </td></tr>`).join('')}
</table>`,
    footerNote: 'Notificación interna · admin Porra de Empresas.',
    appUrl: APP_URL,
  }),
}

// ── Pre-Mundial reminder · 48h ────────────────────────────────────────────────
const reminder48 = {
  subject: '[Muestra] Queda 2 días para el Mundial · envía tu pronóstico',
  html: brandShell({
    title: 'Quedan 48 horas',
    preheader: 'Quedan 48 horas para el pitido inicial — entra antes de que cierren los marcadores.',
    content: `
${brandKicker('Aviso · 48 horas')}
${brandHeadline('Te quedan dos días para entrar a la porra.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola <strong>${escHtml(username)}</strong>, todavía no has enviado tu pronóstico para el Mundial 2026. Una vez arranque el primer partido se cierran los marcadores del torneo entero — no hay segunda oportunidad.
</p>
<div style="margin:0 0 24px;">
  ${brandStatTile({ kicker: 'Tiempo restante', value: `48 <span style="font-size:18px;opacity:.7;">h</span>`, sub: 'Hasta el pitido inicial · 11 jun 2026, 21:00 CET' })}
</div>
${brandButton({ href: fakeUrl, label: 'Entrar y pronosticar' })}
<p style="margin:26px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.ink};opacity:.65;text-align:center;">
  Predice marcadores, compite en ligas privadas y suma puntos con los extras.
</p>`,
    footerNote: `Recibes este email porque tienes los recordatorios activados. Puedes desactivarlos en tu perfil: ${APP_URL}/perfil`,
    appUrl: APP_URL,
  }),
}

// ── Pre-Mundial reminder · 24h ────────────────────────────────────────────────
const reminder24 = {
  subject: '[Muestra] Queda 1 día para el Mundial · envía tu pronóstico',
  html: brandShell({
    title: 'Queda 24 horas',
    preheader: 'Mañana pita el árbitro. Última llamada para tus pronósticos.',
    content: `
${brandKicker('Aviso · 24 horas')}
${brandHeadline('Mañana pita el árbitro.')}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Hola <strong>${escHtml(username)}</strong>, todavía no has enviado tu pronóstico. Cuando arranque el primer partido se cierran los marcadores del torneo entero.
</p>
<div style="margin:0 0 24px;">
  ${brandStatTile({ kicker: 'Tiempo restante', value: `24 <span style="font-size:18px;opacity:.7;">h</span>`, sub: 'Última llamada · 11 jun 2026, 21:00 CET' })}
</div>
${brandButton({ href: fakeUrl, label: 'Entrar y pronosticar' })}`,
    footerNote: `Recibes este email porque tienes los recordatorios activados. Puedes desactivarlos en tu perfil: ${APP_URL}/perfil`,
    appUrl: APP_URL,
  }),
}

// ── Daily digest sample (datos ficticios) ─────────────────────────────────────
const digestRows = [
  { home: 'Argentina', away: 'México',    score: '2 – 1', pred: '2 – 1', pts: 3 },
  { home: 'Francia',   away: 'Marruecos', score: '1 – 1', pred: '2 – 1', pts: 1 },
  { home: 'Brasil',    away: 'Croacia',   score: '3 – 0', pred: '1 – 2', pts: 0 },
]
const todayMatches = [
  { home: 'España', away: 'Inglaterra', time: '21:00' },
  { home: 'Países Bajos', away: 'Senegal', time: '18:00' },
]

const ayerRowsHtml = digestRows.map(r => {
  const badgeBg = r.pts === 3 ? BRAND.green : r.pts === 1 ? BRAND.inkSoft : 'transparent'
  const badgeFg = r.pts === 0 ? BRAND.ink : BRAND.cream
  const badgeTx = r.pts === 3 ? '+3' : r.pts === 1 ? '+1' : '0'
  const badgeBd = r.pts === 0 ? `1px solid ${BRAND.ink}` : 'none'
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${BRAND.rule};">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};font-weight:600;">
          ${r.home} <span style="font-family:'Instrument Serif',Georgia,serif;font-size:18px;color:${BRAND.terra};">${r.score}</span> ${r.away}
        </div>
        <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;margin-top:4px;">Tu pronóstico · ${r.pred}</div>
      </td>
      <td style="padding:12px 0 12px 16px;border-bottom:1px solid ${BRAND.rule};text-align:right;white-space:nowrap;vertical-align:middle;">
        <span style="display:inline-block;background:${badgeBg};color:${badgeFg};border:${badgeBd};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:11px;letter-spacing:.08em;padding:4px 10px;">${badgeTx}</span>
      </td>
    </tr>`
}).join('')
const hoyRowsHtml = todayMatches.map(m => `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.rule};font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};">
      ${m.home} <span style="color:${BRAND.terra};font-family:'Instrument Serif',Georgia,serif;font-style:italic;">vs</span> ${m.away}
    </td>
    <td style="padding:10px 0 10px 16px;border-bottom:1px solid ${BRAND.rule};font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.1em;color:${BRAND.ink};opacity:.7;text-align:right;white-space:nowrap;">${m.time} CET</td>
  </tr>`).join('')

const digest = {
  subject: '[Muestra] Tu resumen · 4 pts · jueves 18 junio',
  html: brandShell({
    title: 'Resumen diario',
    preheader: 'Sumaste 4 puntos en los partidos de ayer. Hoy juega España.',
    content: `
${brandKicker('Resumen diario')}
${brandHeadline(`Bien jugado, ${escHtml(username)}.`)}
<div style="margin:0 0 24px;">
  ${brandKicker('Ayer · miércoles 17 junio')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
    ${ayerRowsHtml}
  </table>
</div>
<div style="margin:0 0 24px;">
  ${brandStatTile({ kicker: 'Posición global', value: `#27 <span style="font-family:Inter,-apple-system,sans-serif;font-size:14px;opacity:.55;">/ 184</span>`, sub: 'Sumaste 4 puntos ayer.' })}
</div>
<div style="margin:0 0 28px;">
  ${brandKicker('Hoy · jueves 18 junio')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;">
    ${hoyRowsHtml}
  </table>
</div>
${brandButton({ href: APP_URL, label: 'Ver clasificación' })}`,
    footerNote: `Recibes este resumen porque tienes los recordatorios activados. Puedes desactivarlos en tu perfil: ${APP_URL}/perfil`,
    appUrl: APP_URL,
  }),
}

// ── Auth templates (con URLs de ejemplo en lugar de placeholders Go) ──────────
const sampleAuthUrl = `${APP_URL}/auth/callback?token=sample-token-for-preview-only`

function authSample({ subjectTag, title, preheader, kicker, headline, body, cta, footerNote }) {
  return {
    subject: `[Muestra] ${subjectTag}`,
    html: brandShell({
      title, preheader,
      content: `
${brandKicker(kicker)}
${brandHeadline(headline)}
<p style="margin:0 0 22px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">${body}</p>
${brandButton({ href: sampleAuthUrl, label: cta })}
<p style="margin:24px 0 0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.55;text-align:center;">
  ¿No funciona el botón? Copia este enlace en tu navegador:<br>
  <span style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:${BRAND.ink};word-break:break-all;opacity:.85;">${sampleAuthUrl}</span>
</p>`,
      footerNote, appUrl: APP_URL,
    }),
  }
}

const confirmSignup = authSample({
  subjectTag: 'Confirma tu email · Porra de Empresas',
  title: 'Confirma tu email', preheader: 'Confirma tu email para entrar a la porra del Mundial 2026.',
  kicker: 'Confirma tu email', headline: 'Estamos a un clic.',
  body: `Gracias por unirte a la <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Porra de Empresas</em> del Mundial 2026. Confirma tu email para activar tu cuenta y empezar a pronosticar.`,
  cta: 'Confirmar mi email',
  footerNote: 'Este enlace caduca pasadas 24 horas por seguridad.',
})

const magicLink = authSample({
  subjectTag: 'Tu enlace para entrar · Porra de Empresas',
  title: 'Tu enlace de acceso', preheader: 'Un solo clic y entras a la porra. Sin contraseña.',
  kicker: 'Inicio de sesión', headline: 'Entra sin contraseña.',
  body: `Pediste un enlace de acceso a la <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Porra de Empresas</em>. Toca el botón y te llevamos directo a tu cuenta.`,
  cta: 'Entrar a la app',
  footerNote: 'El enlace es de un solo uso y caduca pasada 1 hora.',
})

const recovery = authSample({
  subjectTag: 'Restablece tu contraseña · Porra de Empresas',
  title: 'Restablece tu contraseña', preheader: 'Pediste cambiar tu contraseña — aquí tienes el enlace.',
  kicker: 'Recuperar contraseña', headline: 'Vuelve a la porra.',
  body: 'Pediste restablecer tu contraseña. Pulsa el botón y elige una nueva — el resto de la cuenta sigue intacta.',
  cta: 'Elegir nueva contraseña',
  footerNote: 'El enlace caduca pasada 1 hora por seguridad.',
})

// ── Recordatorio admin → miembro de liga (edge function send-reminder) ────────
const adminReminder = {
  subject: '[Muestra] Recordatorio · envía tu pronóstico para Bluebull League',
  html: brandShell({
    title: 'Recordatorio · Bluebull League',
    preheader: 'Pedro te recuerda enviar tu pronóstico para Bluebull League.',
    content: `
${brandKicker('Recordatorio · liga Bluebull League')}
${brandHeadline(`${escHtml(username)}, falta tu pronóstico.`)}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  <strong>Pedro</strong>, admin de tu liga <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Bluebull League</em>, te recuerda que aún no has enviado tus pronósticos para el Mundial 2026.
</p>
<p style="margin:0 0 24px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.ink};opacity:.78;">
  El plazo cierra <strong>30 minutos antes del primer partido</strong>. Una vez pite el árbitro, no hay segunda oportunidad.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;border-collapse:collapse;">
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">01</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Pronósticos</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Predice el marcador exacto de todos los partidos.</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};border-bottom:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">02</td>
      <td valign="top">
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Extras</div>
        <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Preguntas especiales (campeón, bota de oro…) para puntos bonus.</div>
      </td>
    </tr></table>
  </td></tr>
</table>
${brandButton({ href: `${APP_URL}/pronosticos`, label: 'Enviar pronóstico' })}`,
    footerNote: 'Recibes este email porque un admin de tu liga te lo ha pedido. Puedes desactivarlos desde tu perfil.',
    appUrl: APP_URL,
  }),
}

// ── Envío ─────────────────────────────────────────────────────────────────────

async function sendEmail(subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${res.status}: ${body}`)
  }
}

const samples = [
  { label: '1/9 Welcome',           ...welcome },
  { label: '2/9 Admin notif',       ...adminNotif },
  { label: '3/9 Reminder 48h',      ...reminder48 },
  { label: '4/9 Reminder 24h',      ...reminder24 },
  { label: '5/9 Daily digest',      ...digest },
  { label: '6/9 Admin → miembro',   ...adminReminder },
  { label: '7/9 Auth confirm',      ...confirmSignup },
  { label: '8/9 Auth magic link',   ...magicLink },
  { label: '9/9 Auth recovery',     ...recovery },
]

console.log(`Enviando ${samples.length} muestras a ${to}...\n`)
for (const s of samples) {
  try {
    await sendEmail(s.subject, s.html)
    console.log(`  ✓ ${s.label} · ${s.subject}`)
  } catch (err) {
    console.error(`  ✗ ${s.label}: ${err.message}`)
  }
  // Pequeña pausa para no atascar la cola de Brevo
  await new Promise(r => setTimeout(r, 350))
}
console.log('\nListo. Revisa tu bandeja (también la carpeta de spam).')
