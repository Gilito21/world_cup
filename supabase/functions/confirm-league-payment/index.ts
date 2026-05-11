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

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
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
    .select('id, status, league_id, user_id, league_name')
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

  return json({ league: { ...league, role: 'admin' } })
})
