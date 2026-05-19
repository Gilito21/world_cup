// notify-new-user
//
// 1) Notifica al admin de un nuevo registro CONFIRMADO.
// 2) Envía email de bienvenida al nuevo usuario.
//
// POST body: { email: string, username: string, company?: string }
//
// IMPORTANTE: la función comprueba en auth.users que el email del body
// tiene email_confirmed_at IS NOT NULL antes de enviar. Esto blinda
// frente a:
//   - código cliente viejo que invocaba directamente esta función al
//     hacer signUp (antes de que el usuario verificase su email)
//   - cualquier futuro caller que dispare a destiempo
// Si el usuario no está confirmado devolvemos 200 con
// { skipped: 'not_confirmed' } para que el caller no rompa, pero sin
// mandar correos.
//
// El caller esperado es el trigger sync_email_confirmed (migración
// 024) vía pg_net, que dispara cuando email_confirmed_at flip de NULL
// a NOT NULL.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set([
  'https://porradeempresas.com',
  'https://www.porradeempresas.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.porradeempresas.com'
  return {
    'Access-Control-Allow-Origin':  allow,
    'Vary':                         'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const ADMIN_EMAIL = 'jpelaez@bluebullpartners.com'
const FROM_EMAIL  = 'porra@porradeempresas.com'
const FROM_NAME   = 'Porra Mundial 2026'
const APP_URL     = 'https://www.porradeempresas.com'
const BREVO_API   = 'https://api.brevo.com/v3/smtp/email'

// ── Brand shell editorial (duplicado de scripts/_brand-email.js porque
//    Deno no puede importar módulos de Node desde este edge function). ────
const BRAND = {
  cream:    '#F4ECD6',
  paper:    '#EDE3C4',
  ink:      '#0E2A18',
  inkSoft:  '#1C4D2C',
  terra:    '#C8552B',
  rule:     'rgba(14,42,24,0.18)',
} as const

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wordmark(): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;">
  <tr>
    <td valign="middle" style="font-family:'Boldonse','Anton','Arial Black',Impact,Helvetica,sans-serif;font-weight:900;font-size:38px;color:${BRAND.ink};letter-spacing:-.02em;line-height:1;padding:0;">P</td>
    <td valign="middle" style="padding:0 3px;line-height:0;">
      <span style="display:inline-block;width:30px;height:30px;border-radius:50%;background-color:${BRAND.ink};background-image:radial-gradient(circle at 36% 30%,#ffffff 0 26%,${BRAND.ink} 27% 31%,#ffffff 32% 62%,${BRAND.ink} 63% 67%,#ffffff 68% 100%);box-shadow:inset 0 0 0 2px ${BRAND.ink};vertical-align:middle;">&nbsp;</span>
    </td>
    <td valign="middle" style="font-family:'Boldonse','Anton','Arial Black',Impact,Helvetica,sans-serif;font-weight:900;font-size:38px;color:${BRAND.ink};letter-spacing:-.02em;line-height:1;padding:0;">RRA</td>
    <td valign="middle" style="padding:0 0 0 12px;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;font-size:30px;color:${BRAND.terra};line-height:.9;">de empresas</td>
  </tr>
</table>`
}

function brandKicker(text: string): string {
  return `<div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;margin:0 0 8px;">${esc(text)}</div>`
}

function brandHeadline(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:'Instrument Serif',Georgia,'Times New Roman',serif;font-weight:400;font-size:34px;line-height:1.05;color:${BRAND.ink};letter-spacing:-.01em;">${esc(text)}</h1>`
}

function brandButton({ href, label }: { href: string; label: string }): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${BRAND.ink}" style="background-color:${BRAND.ink};border:1px solid ${BRAND.ink};">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700;font-size:15px;line-height:1;letter-spacing:.01em;color:${BRAND.cream};text-decoration:none;">${esc(label)} &rarr;</a>
    </td>
  </tr>
</table>`
}

function brandShell({ title, preheader = '', content, footerNote, appUrl = APP_URL }: {
  title: string; preheader?: string; content: string; footerNote: string; appUrl?: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${esc(title)}</title>
  <!--[if mso]>
  <style type="text/css">table, td { mso-line-height-rule:exactly; }</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink};">
  <div style="display:none !important;font-size:1px;color:${BRAND.cream};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.cream}" style="background:${BRAND.cream};">
    <tr><td align="center" style="padding:36px 16px 28px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:4px 0 28px;">${wordmark()}</td></tr>
        <tr><td bgcolor="${BRAND.paper}" style="background:${BRAND.paper};border:1px solid ${BRAND.ink};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:36px 36px 32px;">${content}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:22px 8px 6px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:${BRAND.ink};opacity:.65;line-height:1;">
            ATLAS MUNDIAL &nbsp;<span style="color:${BRAND.terra};opacity:1;">★</span>&nbsp; EDICIÓN &rsquo;26
          </div>
        </td></tr>
        <tr><td align="center" style="padding:10px 24px 0;">
          <p style="margin:0 0 6px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.62;">${esc(footerNote)}</p>
          <p style="margin:0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.ink};opacity:.45;">
            <a href="${appUrl}" style="color:${BRAND.ink};text-decoration:none;opacity:.7;">porradeempresas.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch(BREVO_API, {
    method:  'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error(`Brevo error sending to ${to}:`, err)
    throw new Error(`brevo_${res.status}`)
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405)

  const BREVO_KEY = Deno.env.get('BREVO_API_KEY')
  if (!BREVO_KEY) {
    console.error('BREVO_API_KEY not set')
    return json({ error: 'email_not_configured' }, 500)
  }

  let body: { email?: string; username?: string; company?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const email    = (body.email    ?? '').trim()
  const username = (body.username ?? '').trim()
  const company  = (body.company  ?? '').trim()
  const ts       = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  // ── Gate: solo notificar cuando el usuario YA está confirmado ────────────
  // Esto convierte la función en idempotente respecto al momento en que
  // se dispara: tanto si la llaman al hacer signUp (viejo cliente) como
  // al confirmar (trigger), solo se envía una vez — la primera vez que
  // ambos requisitos coinciden (= al confirmar).
  if (email) {
    const supaUrl = Deno.env.get('SUPABASE_URL')
    const supaKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (supaUrl && supaKey) {
      const admin = createClient(supaUrl, supaKey)
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 })
      if (error) {
        console.error('listUsers failed (gate disabled):', error)
        // Sin gate: continuamos para no romper en caso de outage de auth.
      } else {
        const match = data.users.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())
        if (!match) {
          return json({ skipped: 'user_not_found', email })
        }
        if (!match.email_confirmed_at) {
          return json({ skipped: 'not_confirmed', email })
        }
      }
    }
  }

  // ── 1. Email al admin ─────────────────────────────────────────────────────
  const adminContent = `
${brandKicker('Admin · alta confirmada')}
${brandHeadline('Nuevo usuario en la porra.')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:6px 0 24px;">
  <tr><td style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;">Usuario</div>
    <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND.ink};margin-top:4px;">${esc(username) || '—'}</div>
  </td></tr>
  <tr><td style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;">Email</div>
    <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};margin-top:4px;">${esc(email) || '—'}</div>
  </td></tr>
  ${company ? `<tr><td style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;">Empresa</div>
    <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};margin-top:4px;">${esc(company)}</div>
  </td></tr>` : ''}
  <tr><td style="padding:14px 0;border-top:1px solid ${BRAND.rule};border-bottom:1px solid ${BRAND.rule};">
    <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;">Fecha</div>
    <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:${BRAND.ink};margin-top:4px;">${esc(ts)}</div>
  </td></tr>
</table>`
  const adminHtml = brandShell({
    title: `Nuevo usuario · ${username || email}`,
    preheader: `${username || email} acaba de confirmar su email${company ? ` (${company})` : ''}.`,
    content: adminContent,
    footerNote: 'Notificación interna · admin Porra de Empresas.',
  })

  // ── 2. Email de bienvenida al usuario ─────────────────────────────────────
  const welcomeContent = `
${brandKicker('Bienvenido · Edición ’26')}
${brandHeadline(`Hola ${username || 'crack'}, ya estás dentro.`)}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Bienvenido a la <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">Porra de Empresas</em> del Mundial 2026. El torneo arranca el <strong>11 de junio de 2026</strong> en México, Canadá y Estados Unidos — tienes tiempo de sobra para preparar tus pronósticos.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;border-collapse:collapse;">
  <tr><td valign="top" style="padding:14px 0 14px 0;border-top:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">01</td>
        <td valign="top">
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Pronósticos</div>
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Predice el marcador exacto de cada partido del torneo.</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">02</td>
        <td valign="top">
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Ligas privadas</div>
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Compite con amigos o con tu empresa en clasificaciones propias.</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td valign="top" style="padding:14px 0;border-top:1px solid ${BRAND.rule};border-bottom:1px solid ${BRAND.rule};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="top" width="32" style="font-family:'Instrument Serif',Georgia,serif;font-size:24px;color:${BRAND.terra};line-height:1;padding-right:14px;">03</td>
        <td valign="top">
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-weight:700;font-size:14px;color:${BRAND.ink};">Extras</div>
          <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.ink};opacity:.78;margin-top:2px;">Preguntas especiales (campeón, bota de oro, sorpresas) para sumar bonus.</div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>

${brandButton({ href: APP_URL, label: 'Entrar a la app' })}
`
  const welcomeHtml = brandShell({
    title: 'Bienvenido a la Porra de Empresas',
    preheader: 'Ya eres parte de la porra del Mundial 2026. Edición ’26.',
    content: welcomeContent,
    footerNote: '¿Preguntas? Responde a este email y te leemos.',
  })

  const results = await Promise.allSettled([
    sendEmail(BREVO_KEY, ADMIN_EMAIL, `Nuevo usuario · ${username || email} · Porra de Empresas`, adminHtml),
    email ? sendEmail(BREVO_KEY, email, 'Bienvenido a la Porra de Empresas · Mundial 2026', welcomeHtml) : Promise.resolve(),
  ])

  const adminFailed   = results[0].status === 'rejected'
  const welcomeFailed = results[1].status === 'rejected'

  if (adminFailed) console.error('Admin notification failed:', (results[0] as PromiseRejectedResult).reason)
  if (welcomeFailed) console.error('Welcome email failed:', (results[1] as PromiseRejectedResult).reason)

  return json({ ok: true, adminFailed, welcomeFailed })
})
