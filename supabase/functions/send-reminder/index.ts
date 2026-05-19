// send-reminder
//
// Permite a un admin de liga enviar un recordatorio a un miembro que aún
// no ha enviado sus pronósticos o extras. Limitado a un recordatorio por
// (liga, miembro objetivo) cada 24h.
//
// POST body: { league_id: string, target_user_id: string }
// Requiere: Authorization: Bearer <jwt> (admin de la liga)
//
// IMPORTANTE: este archivo se incorporó al repo en la rama de rebrand de
// emails — antes vivía solo desplegado en Supabase. Si haces cambios,
// recuerda redeployar con `supabase functions deploy send-reminder` o
// pegando el contenido en el dashboard, porque la edge function no se
// publica desde aquí automáticamente.

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

const FROM_EMAIL  = 'porra@porradeempresas.com'
const FROM_NAME   = 'Porra Mundial 2026'
const APP_URL     = 'https://www.porradeempresas.com'
const BREVO_API   = 'https://api.brevo.com/v3/smtp/email'
const COOLDOWN_H  = 24

// ── Brand shell editorial (duplicado de scripts/_brand-email.js porque
//    Deno no puede importar módulos de Node desde este edge function).
//    Mantener sincronizado a mano si cambia la marca. ─────────────────
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

async function sendEmail(apiKey: string, to: string, toName: string, leagueName: string, senderName: string) {
  const subject = `Recordatorio · envía tu pronóstico para ${leagueName}`
  const content = `
${brandKicker('Recordatorio · liga ' + leagueName)}
${brandHeadline(`${toName}, falta tu pronóstico.`)}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  <strong>${esc(senderName)}</strong>, admin de tu liga <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">${esc(leagueName)}</em>, te recuerda que aún no has enviado tus pronósticos para el Mundial 2026.
</p>
<p style="margin:0 0 24px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${BRAND.ink};opacity:.78;">
  El plazo cierra <strong>una hora antes del primer partido</strong>. Una vez pite el árbitro, no hay segunda oportunidad.
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
${brandButton({ href: `${APP_URL}/pronosticos`, label: 'Enviar pronóstico' })}`

  const html = brandShell({
    title: subject,
    preheader: `${senderName} te recuerda enviar tu pronóstico para ${leagueName}.`,
    content,
    footerNote: 'Recibes este email porque un admin de tu liga te lo ha pedido. Puedes desactivarlos desde tu perfil.',
  })

  const res = await fetch(BREVO_API, {
    method:  'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to, name: toName }],
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
  if (!BREVO_KEY) return json({ error: 'email_not_configured' }, 500)

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!

  // Use caller's JWT for RLS checks
  const authHeader = req.headers.get('Authorization') ?? ''
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  // Service role for reading auth.users email
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let body: { league_id?: string; target_user_id?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const { league_id, target_user_id } = body
  if (!league_id || !target_user_id) return json({ error: 'missing_fields' }, 400)

  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'unauthorized' }, 401)

  // Verify caller is admin of this league
  const { data: callerMember } = await callerClient
    .from('league_members')
    .select('role')
    .eq('league_id', league_id)
    .eq('user_id', caller.id)
    .single()

  if (!callerMember || callerMember.role !== 'admin') {
    return json({ error: 'not_admin' }, 403)
  }

  // Verify target is a member of this league
  const { data: targetMember } = await callerClient
    .from('league_members')
    .select('user_id')
    .eq('league_id', league_id)
    .eq('user_id', target_user_id)
    .single()

  if (!targetMember) return json({ error: 'target_not_member' }, 404)

  // Rate limit: one reminder per 24h per (league, target)
  const cooldownSince = new Date(Date.now() - COOLDOWN_H * 60 * 60 * 1000).toISOString()
  const { data: recentLog } = await callerClient
    .from('reminder_logs')
    .select('id')
    .eq('league_id', league_id)
    .eq('target_user_id', target_user_id)
    .gte('sent_at', cooldownSince)
    .limit(1)
    .maybeSingle()

  if (recentLog) return json({ error: 'cooldown', cooldown_hours: COOLDOWN_H }, 429)

  // Get league name
  const { data: league } = await adminClient
    .from('leagues')
    .select('name')
    .eq('id', league_id)
    .single()

  // Get target user email and username
  const { data: targetAuth } = await adminClient.auth.admin.getUserById(target_user_id)
  const targetEmail = targetAuth?.user?.email
  if (!targetEmail) return json({ error: 'target_email_not_found' }, 404)

  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('username')
    .eq('id', target_user_id)
    .single()

  const targetName = targetProfile?.username ?? targetEmail.split('@')[0]

  // Sender name (the admin that triggered the reminder) — para personalizar el copy.
  const { data: senderProfile } = await adminClient
    .from('profiles')
    .select('username')
    .eq('id', caller.id)
    .single()
  const senderName = senderProfile?.username ?? 'Un admin de tu liga'

  try {
    await sendEmail(BREVO_KEY, targetEmail, targetName, league?.name ?? 'tu liga', senderName)
  } catch (err) {
    console.error('Failed to send reminder:', err)
    return json({ error: 'email_failed' }, 500)
  }

  await callerClient.from('reminder_logs').insert({
    league_id,
    target_user_id,
    sent_by: caller.id,
  })

  return json({ ok: true })
})
