// Stripe Checkout session creation.
//
// Auth: caller passes their Supabase JWT via Authorization header. We
// resolve the user with auth.getUser() and verify they are a member of
// the requested store before creating a Stripe customer (or reusing the
// one already pinned to that store's subscription row).
//
// Required env:
//   STRIPE_SECRET_KEY        sk_test_… / sk_live_…
//   STRIPE_PRICE_PRO         price_… for Pro 299 THB/mo
//   STRIPE_PRICE_BUSINESS    price_… for Business 999 THB/mo
//   APP_URL                  Where Stripe sends the user back
//   SUPABASE_URL             Auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  Auto-injected — needed to update subs row

import Stripe from 'npm:stripe@17.5.0'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

type Body = { store_id?: string; tier?: 'pro' | 'business' }

const PRICE_BY_TIER: Record<string, string | undefined> = {
  pro:      Deno.env.get('STRIPE_PRICE_PRO'),
  business: Deno.env.get('STRIPE_PRICE_BUSINESS'),
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json(405, { error: 'Method not allowed' })

  const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
  const APP_URL    = Deno.env.get('APP_URL') ?? 'https://teang459.github.io/chanthasy-stock'
  const SUPA_URL   = Deno.env.get('SUPABASE_URL')!
  const SVC_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!STRIPE_KEY) return json(500, { error: 'STRIPE_SECRET_KEY not set' })

  // Caller's JWT for user resolution
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Missing bearer token' })

  let body: Body
  try { body = await req.json() }
  catch { return json(400, { error: 'Invalid JSON' }) }

  const { store_id, tier } = body
  if (!store_id || !tier) return json(400, { error: 'store_id and tier required' })
  const priceId = PRICE_BY_TIER[tier]
  if (!priceId) return json(400, { error: `No Stripe price configured for tier "${tier}"` })

  // Use the caller's JWT to verify identity
  const userClient = createClient(SUPA_URL, SVC_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json(401, { error: 'Invalid session' })
  const user = userData.user

  // Service client for DB checks + subscription update
  const svc = createClient(SUPA_URL, SVC_KEY)

  // Membership check (must be store_admin to start a checkout)
  const { data: membership, error: memberErr } = await svc
    .from('store_members')
    .select('role')
    .eq('store_id', store_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberErr) return json(500, { error: memberErr.message })

  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isSuperAdmin = profile?.role === 'super_admin'
  if (!isSuperAdmin && membership?.role !== 'store_admin') {
    return json(403, { error: 'Only store_admin or super_admin can manage billing' })
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-12-18.acacia' })

  // Reuse the Stripe customer pinned to this store, if any
  const { data: existingSub } = await svc
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('store_id', store_id)
    .maybeSingle()

  let customerId = existingSub?.provider_customer_id ?? null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { store_id, supabase_user_id: user.id },
    })
    customerId = customer.id
    await svc
      .from('subscriptions')
      .update({ provider: 'stripe', provider_customer_id: customerId })
      .eq('store_id', store_id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/settings?checkout=success`,
    cancel_url:  `${APP_URL}/pricing?checkout=cancelled`,
    metadata: { store_id, tier },
    subscription_data: { metadata: { store_id, tier } },
    allow_promotion_codes: true,
  })

  return json(200, { url: session.url })
})
