// Stripe Billing Portal session — lets paying customers update card,
// see invoices, and cancel. Same auth/membership model as checkout.
//
// Required env:
//   STRIPE_SECRET_KEY
//   APP_URL
//   SUPABASE_URL              auto-injected
//   SUPABASE_SERVICE_ROLE_KEY auto-injected

import Stripe from 'npm:stripe@17.5.0'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

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

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Missing bearer token' })

  let body: { store_id?: string }
  try { body = await req.json() }
  catch { return json(400, { error: 'Invalid JSON' }) }
  const { store_id } = body
  if (!store_id) return json(400, { error: 'store_id required' })

  const userClient = createClient(SUPA_URL, SVC_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json(401, { error: 'Invalid session' })
  const user = userData.user

  const svc = createClient(SUPA_URL, SVC_KEY)

  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isSuperAdmin = profile?.role === 'super_admin'
  if (!isSuperAdmin) {
    const { data: m } = await svc.from('store_members').select('role')
      .eq('store_id', store_id).eq('user_id', user.id).maybeSingle()
    if (m?.role !== 'store_admin') return json(403, { error: 'Only store_admin or super_admin can manage billing' })
  }

  const { data: sub } = await svc
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('store_id', store_id)
    .maybeSingle()
  if (!sub?.provider_customer_id) {
    return json(400, { error: 'No Stripe customer on file — start a checkout first' })
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-12-18.acacia' })
  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.provider_customer_id,
    return_url: `${APP_URL}/#/settings`,
  })

  return json(200, { url: session.url })
})
