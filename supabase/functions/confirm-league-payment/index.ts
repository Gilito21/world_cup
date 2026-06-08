// confirm-league-payment
//
// Tras el pago en el frontend (stripe.confirmPayment), verificamos contra
// Stripe que el PaymentIntent está realmente succeeded y, si es así,
// creamos la liga + añadimos al usuario como admin. Idempotente.
//
// POST body: { payment_intent_id: string }
// Auth: Bearer <user JWT>
//
// Devuelve: { league: { id, name, invite_code, role: 'admin' } }

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

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ── Notificación por email ───────────────────────────────────────────────────
// Mismo branding que notify-new-user. Duplicado aquí porque Deno no puede
// importar el módulo de Node scripts/_brand-email.js desde este edge function.
const ADMIN_EMAIL = 'jpelaez@bluebullpartners.com'
const FROM_EMAIL  = 'porra@porradeempresas.com'
const FROM_NAME   = 'Porra Mundial 2026'
const APP_URL     = 'https://www.porradeempresas.com'
const BREVO_API   = 'https://api.brevo.com/v3/smtp/email'

const BRAND = {
  cream:   '#F4ECD6',
  paper:   '#EDE3C4',
  ink:     '#0E2A18',
  inkSoft: '#1C4D2C',
  terra:   '#C8552B',
  rule:    'rgba(14,42,24,0.18)',
} as const

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: (currency || 'eur').toUpperCase() })
      .format((cents ?? 0) / 100)
  } catch {
    return `${((cents ?? 0) / 100).toFixed(2)} ${(currency || 'EUR').toUpperCase()}`
  }
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

function brandRow(kicker: string, value: string): string {
  return `
  <tr><td style="padding:14px 0;border-top:1px solid ${BRAND.rule};">
    <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.ink};opacity:.55;">${esc(kicker)}</div>
    <div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND.ink};margin-top:4px;">${value}</div>
  </td></tr>`
}

function brandShell({ title, preheader = '', content, footerNote }: {
  title: string; preheader?: string; content: string; footerNote: string;
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
            <a href="${APP_URL}" style="color:${BRAND.ink};text-decoration:none;opacity:.7;">porradeempresas.com</a>
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

// Avisa al admin y manda recibo al comprador. No bloquea ni revierte la
// compra: si el email falla, la liga ya está creada y solo logueamos.
async function notifyLeaguePurchase(admin: ReturnType<typeof createClient>, opts: {
  league: { id: string; name: string; invite_code: string }
  buyerEmail: string | null
  buyerId: string
  amountCents: number
  currency: string
}) {
  const BREVO_KEY = Deno.env.get('BREVO_API_KEY')
  if (!BREVO_KEY) { console.error('BREVO_API_KEY not set — skipping purchase notification'); return }

  const { data: profile } = await admin
    .from('profiles')
    .select('username')
    .eq('id', opts.buyerId)
    .maybeSingle()
  const username = (profile?.username ?? '').trim()
  const amountStr = fmtAmount(opts.amountCents, opts.currency)
  const ts = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

  // ── 1. Aviso al admin ──
  const adminContent = `
${brandKicker('Admin · liga comprada')}
${brandHeadline('Nueva liga de pago.')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:6px 0 24px;">
  ${brandRow('Liga', esc(opts.league.name))}
  ${brandRow('Comprador', esc(username || '—'))}
  ${brandRow('Email', esc(opts.buyerEmail || '—'))}
  ${brandRow('Importe', esc(amountStr))}
  ${brandRow('Código de invitación', esc(opts.league.invite_code))}
  ${brandRow('Fecha', esc(ts))}
</table>`
  const adminHtml = brandShell({
    title: `Liga comprada · ${opts.league.name}`,
    preheader: `${username || opts.buyerEmail || 'Alguien'} compró la liga "${opts.league.name}" (${amountStr}).`,
    content: adminContent,
    footerNote: 'Notificación interna · admin Porra de Empresas.',
  })

  // ── 2. Recibo al comprador ──
  const buyerContent = `
${brandKicker('Compra confirmada · Edición ’26')}
${brandHeadline(`Tu liga ya está activa${username ? `, ${username}` : ''}.`)}
<p style="margin:0 0 18px;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.ink};">
  Has creado <em style="font-family:'Instrument Serif',Georgia,serif;color:${BRAND.terra};font-style:italic;">${esc(opts.league.name)}</em>. Comparte el código de invitación para que tu gente se una y empiece a pronosticar.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:6px 0 24px;">
  ${brandRow('Liga', esc(opts.league.name))}
  ${brandRow('Código de invitación', `<span style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:20px;letter-spacing:.18em;color:${BRAND.terra};">${esc(opts.league.invite_code)}</span>`)}
  ${brandRow('Importe pagado', esc(amountStr))}
  ${brandRow('Fecha', esc(ts))}
</table>
${brandButton({ href: APP_URL, label: 'Entrar a mi liga' })}`
  const buyerHtml = brandShell({
    title: 'Tu liga ya está activa · Porra de Empresas',
    preheader: `Liga "${opts.league.name}" creada. Código: ${opts.league.invite_code}.`,
    content: buyerContent,
    footerNote: '¿Preguntas? Responde a este email y te leemos.',
  })

  const results = await Promise.allSettled([
    sendEmail(BREVO_KEY, ADMIN_EMAIL, `Liga comprada · ${opts.league.name} · Porra de Empresas`, adminHtml),
    opts.buyerEmail ? sendEmail(BREVO_KEY, opts.buyerEmail, `Tu liga "${opts.league.name}" ya está activa`, buyerHtml) : Promise.resolve(),
  ])
  if (results[0].status === 'rejected') console.error('Admin purchase notice failed:', (results[0] as PromiseRejectedResult).reason)
  if (results[1].status === 'rejected') console.error('Buyer receipt failed:', (results[1] as PromiseRejectedResult).reason)
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST')    return json({ error: 'method_not_allowed' }, 405)

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return json({ error: 'stripe_not_configured' }, 500)

  // ── Auth ──
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase   = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'unauthorized' }, 401)
  const user = userRes.user

  // ── Parse body ──
  let body: { payment_intent_id?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const pi = (body.payment_intent_id ?? '').trim()
  if (!pi.startsWith('pi_')) return json({ error: 'invalid_payment_intent' }, 400)

  // ── Cliente admin (service_role bypasea RLS) ──
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Idempotencia: si ya creamos la liga para este intent, devuélvela ──
  const { data: existingPay } = await admin
    .from('league_payments')
    .select('id, status, league_id, user_id, league_name, amount_cents, currency')
    .eq('payment_intent_id', pi)
    .maybeSingle()

  if (!existingPay) return json({ error: 'unknown_intent' }, 404)
  if (existingPay.user_id !== user.id) return json({ error: 'forbidden' }, 403)

  if (existingPay.league_id) {
    const { data: existingLeague } = await admin
      .from('leagues')
      .select('id, name, invite_code')
      .eq('id', existingPay.league_id)
      .maybeSingle()
    if (existingLeague) {
      return json({ league: { ...existingLeague, role: 'admin' } })
    }
  }

  // ── Verifica con Stripe que el pago salió bien ──
  const stripeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${pi}`, {
    headers: { 'Authorization': `Bearer ${stripeKey}` },
  })
  const intent = await stripeRes.json()
  if (!stripeRes.ok) {
    console.error('stripe retrieve error', intent)
    return json({ error: 'stripe_error', detail: intent?.error?.message }, 502)
  }

  if (intent.metadata?.user_id !== user.id) {
    return json({ error: 'mismatched_intent' }, 403)
  }

  if (intent.status !== 'succeeded') {
    // Pago aún no completado o falló
    await admin
      .from('league_payments')
      .update({ status: intent.status === 'canceled' ? 'canceled' : 'pending' })
      .eq('payment_intent_id', pi)
    return json({ error: 'payment_not_completed', stripe_status: intent.status }, 402)
  }

  // ── Comprobar que no existe ya una liga con ese nombre (case-insensitive) ──
  const { data: existingLeagueName } = await admin
    .from('leagues')
    .select('id')
    .ilike('name', existingPay.league_name)
    .maybeSingle()
  if (existingLeagueName) return json({ error: 'league_name_taken' }, 409)

  // ── Crea la liga + admin membership ──
  // Genera invite_code único — reintenta en colisión (muy raro).
  let inviteCode = generateInviteCode()
  let league: { id: string; name: string; invite_code: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from('leagues')
      .insert({
        name:              existingPay.league_name,
        invite_code:       inviteCode,
        created_by:        user.id,
        payment_intent_id: pi,
        paid_at:           new Date().toISOString(),
      })
      .select('id, name, invite_code')
      .single()
    if (!error) { league = data; break }
    // 23505 = unique_violation (probably invite_code dupe)
    if ((error as { code?: string }).code !== '23505') {
      console.error('league insert error', error)
      return json({ error: 'db_error', detail: (error as Error).message }, 500)
    }
    inviteCode = generateInviteCode()
  }

  if (!league) return json({ error: 'could_not_allocate_code' }, 500)

  // ── Añade al creador como admin ──
  const { error: memberErr } = await admin
    .from('league_members')
    .insert({ league_id: league.id, user_id: user.id, role: 'admin' })
  if (memberErr) {
    console.error('member insert error', memberErr)
    // Revertimos para no dejar liga huérfana sin admin
    await admin.from('leagues').delete().eq('id', league.id)
    return json({ error: 'member_insert_failed', detail: memberErr.message }, 500)
  }

  // ── Marca el pago como succeeded ──
  await admin
    .from('league_payments')
    .update({ status: 'succeeded', league_id: league.id })
    .eq('payment_intent_id', pi)

  // ── Avisa al admin + recibo al comprador (no bloquea la compra) ──
  try {
    await notifyLeaguePurchase(admin, {
      league,
      buyerEmail:  user.email ?? null,
      buyerId:     user.id,
      amountCents: existingPay.amount_cents,
      currency:    existingPay.currency,
    })
  } catch (err) {
    console.error('notifyLeaguePurchase threw:', err)
  }

  return json({ league: { ...league, role: 'admin' } })
})
