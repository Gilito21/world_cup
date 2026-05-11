// create-league-free
//
// Crea una liga sin cobrar, exclusivamente para usuarios marcados con
// profiles.is_founder = true. Cualquier otro usuario recibe 403.
//
// POST body: { league_name: string }
// Auth: Bearer <user JWT>

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

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase   = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'unauthorized' }, 401)
  const user = userRes.user

  let body: { league_name?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  const leagueName = (body.league_name ?? '').trim()
  if (leagueName.length < 2 || leagueName.length > 40) {
    return json({ error: 'invalid_league_name' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Gate: solo founders pueden crear sin pagar ──
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, is_founder')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) return json({ error: 'db_error', detail: profileErr.message }, 500)
  if (!profile?.is_founder) return json({ error: 'payment_required' }, 402)

  // ── Crea la liga + admin membership (reintenta en colisión de código) ──
  let inviteCode = generateInviteCode()
  let league: { id: string; name: string; invite_code: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await admin
      .from('leagues')
      .insert({
        name:        leagueName,
        invite_code: inviteCode,
        created_by:  user.id,
        paid_at:     new Date().toISOString(),
      })
      .select('id, name, invite_code')
      .single()
    if (!error) { league = data; break }
    if ((error as { code?: string }).code !== '23505') {
      console.error('league insert error', error)
      return json({ error: 'db_error', detail: (error as Error).message }, 500)
    }
    inviteCode = generateInviteCode()
  }

  if (!league) return json({ error: 'could_not_allocate_code' }, 500)

  const { error: memberErr } = await admin
    .from('league_members')
    .insert({ league_id: league.id, user_id: user.id, role: 'admin' })
  if (memberErr) {
    console.error('member insert error', memberErr)
    await admin.from('leagues').delete().eq('id', league.id)
    return json({ error: 'member_insert_failed', detail: memberErr.message }, 500)
  }

  return json({ league: { ...league, role: 'admin' } })
})
