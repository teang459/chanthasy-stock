// Stripe webhook handler.
//
// Verifies signature with STRIPE_WEBHOOK_SECRET, then projects relevant
// events onto the subscriptions table. Uses Stripe SDK's async signature
// verification (constructEventAsync) because Deno's Web Crypto APIs are
// async-only — the sync constructEvent does not work on Edge runtime.
//
// IMPORTANT: This function must be deployed with --no-verify-jwt because
// Stripe is the caller, not a Supabase-authenticated user.
//
// Required env:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_PRO
//   STRIPE_PRICE_BUSINESS
//   SUPABASE_URL              auto-injected
//   SUPABASE_SERVICE_ROLE_KEY auto-injected

import Stripe from 'npm:stripe@17.5.0'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

function tierFromPriceId(priceId: string | null | undefined): 'pro' | 'business' | null {
  if (!priceId) return null
  if (priceId === Deno.env.get('STRIPE_PRICE_PRO'))      return 'pro'
  if (priceId === Deno.env.get('STRIPE_PRICE_BUSINESS')) return 'business'
  return null
}

function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':           return 'trialing'
    case 'active':             return 'active'
    case 'past_due':           return 'past_due'
    case 'unpaid':             return 'past_due'
    case 'incomplete':         return 'past_due'
    case 'incomplete_expired': return 'expired'
    case 'canceled':           return 'canceled'
    case 'paused':             return 'past_due'
    default:                   return 'active'
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
  const WH_SECRET  = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const SUPA_URL   = Deno.env.get('SUPABASE_URL')!
  const SVC_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!STRIPE_KEY || !WH_SECRET) {
    return new Response('Stripe env not configured', { status: 500 })
  }

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-12-18.acacia' })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing stripe-signature', { status: 400 })

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, WH_SECRET)
  } catch (err) {
    console.error('[stripe-webhook] signature verify failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  const svc = createClient(SUPA_URL, SVC_KEY)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const storeId = session.metadata?.store_id
        const subId   = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        if (!storeId || !subId) break
        const sub = await stripe.subscriptions.retrieve(subId)
        const tier = tierFromPriceId(sub.items.data[0]?.price?.id) ?? 'pro'
        await svc.from('subscriptions').update({
          tier,
          status:               mapStatus(sub.status),
          provider:             'stripe',
          provider_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          provider_subscription_id: sub.id,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:   new Date(sub.current_period_end * 1000).toISOString(),
          trial_end:            sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          cancel_at_period_end: sub.cancel_at_period_end,
        }).eq('store_id', storeId)
        break
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription
        const storeId = sub.metadata?.store_id
        if (!storeId) break
        const tier = tierFromPriceId(sub.items.data[0]?.price?.id)
        const patch: Record<string, unknown> = {
          status:                   mapStatus(sub.status),
          provider:                 'stripe',
          provider_subscription_id: sub.id,
          current_period_start:     new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:       new Date(sub.current_period_end * 1000).toISOString(),
          trial_end:                sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          cancel_at_period_end:     sub.cancel_at_period_end,
        }
        if (tier) patch.tier = tier
        await svc.from('subscriptions').update(patch).eq('store_id', storeId)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const storeId = sub.metadata?.store_id
        if (!storeId) break
        // Drop back to free instead of leaving the row at canceled — the
        // free tier is what they actually have access to going forward.
        await svc.from('subscriptions').update({
          tier:                     'free',
          status:                   'canceled',
          cancel_at_period_end:     false,
          provider_subscription_id: null,
        }).eq('store_id', storeId)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
        if (!subId) break
        await svc.from('subscriptions').update({ status: 'past_due' }).eq('provider_subscription_id', subId)
        break
      }

      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice
        const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
        if (!subId) break
        await svc.from('subscriptions').update({ status: 'active' }).eq('provider_subscription_id', subId)
        break
      }

      default:
        // Other events are fine to ignore for now.
        break
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler failed for ${event.type}:`, err)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
