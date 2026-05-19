// create-league-payment
//
// Inicia el cobro de €7,99 para crear una liga. Devuelve el client_secret
// del PaymentIntent para que el frontend lo confirme con Stripe Elements.
//
// POST body: { league_name: string }
// Auth: Bearer <user JWT> (requerido)
//
// Variables de entorno necesarias en Supabase:
//   STRIPE_SECRET_KEY      sk_live_... (set manualmente en el dashboard)
//   SUPABASE_URL           (auto-provisto)
//   SUPABASE_SERVICE_ROLE_KEY (auto-provisto)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const PRICE_CENTS = 799          // €7,99
const CURRENCY    = 'eur'

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

  // ── Auth: extrae el user del JWT (verify_jwt=true ya valida la firma) ──
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase   = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'unauthorized' }, 401)
  const user = userRes.user

  // ── Parse + valida body ──
  let body: { league_name?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const leagueName = (body.league_name ?? '').trim()
  if (leagueName.length < 2 || leagueName.length > 40) {
    return json({ error: 'invalid_league_name' }, 400)
  }

  // ── Crea PaymentIntent en Stripe ──
  const form = new URLSearchParams()
  form.set('amount',                    String(PRICE_CENTS))
  form.set('currency',                  CURRENCY)
  form.set('automatic_payment_methods[enabled]', 'true')
  form.set('metadata[user_id]',         user.id)
  form.set('metadata[user_email]',      user.email ?? '')
  form.set('metadata[league_name]',     leagueName)
  form.set('metadata[product]',         'porra-mundial-2026-league')
  form.set('description',               `Crear liga "${leagueName}" — Porra Mundial 2026`)
  form.set('statement_descriptor_suffix', 'PORRA MUNDIAL')
  form.set('receipt_email',             user.email ?? '')

  const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })

  const intent = await stripeRes.json()
  if (!stripeRes.ok) {
    console.error('stripe error', intent)
    return json({ error: 'stripe_error', detail: intent?.error?.message }, 502)
  }

  // ── Persiste el intento (service_role bypasea RLS) ──
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { error: dbErr } = await admin
    .from('league_payments')
    .insert({
      user_id:           user.id,
      payment_intent_id: intent.id,
      league_name:       leagueName,
      amount_cents:      PRICE_CENTS,
      currency:          CURRENCY,
      status:            'pending',
    })
  if (dbErr) {
    console.error('db insert error', dbErr)
    return json({ error: 'db_error', detail: dbErr.message }, 500)
  }

  return json({
    client_secret:     intent.client_secret,
    payment_intent_id: intent.id,
    amount_cents:      PRICE_CENTS,
    currency:          CURRENCY,
  })
})
