# Stripe Billing Setup

Foundation in migration 019 and `src/lib/billing.js` runs without
Stripe. Real payments need the three Edge Functions in
`supabase/functions/{create-checkout-session,stripe-webhook,create-portal-session}/`
to be deployed with the env vars below.

## 1. Stripe dashboard

1. Sign up at https://stripe.com (start in **test mode**).
2. In **Products → Add product**, create two recurring products:
   - **Pro** — 299 THB / month → copy `price_…` ID
   - **Business** — 999 THB / month → copy `price_…` ID
3. In **Developers → Webhooks → Add endpoint**:
   - URL: `https://kdsjqsfiunjhnajstwgi.functions.supabase.co/stripe-webhook`
   - Listen for events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
   - Copy the **Signing secret** (`whsec_…`)
4. In **Settings → Billing → Customer portal**, enable the portal and
   pick the cancellation / update behaviors you want users to control.

## 2. Supabase env vars

Set these under **Project → Settings → Edge Functions → Secrets**:

| Name | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` from Stripe |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook endpoint |
| `STRIPE_PRICE_PRO` | `price_…` for Pro |
| `STRIPE_PRICE_BUSINESS` | `price_…` for Business |
| `APP_URL` | `https://teang459.github.io/chanthasy-stock` (or custom domain) |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by
the platform — no action needed.

## 3. Deploy the functions

```sh
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

The `--no-verify-jwt` flag on the webhook is required because Stripe
is the caller, not a Supabase-authenticated user.

## 4. Test the flow

1. Open `/pricing` while signed in.
2. Click **เลือกแพ็กเกจนี้** on Pro → redirected to Stripe Checkout.
3. Use Stripe test card `4242 4242 4242 4242` with any future date and
   any CVC.
4. After payment, you should land back on `/settings?checkout=success`
   and `BillingCard` should show **Pro** as the active tier.
5. Click **จัดการการเรียกเก็บ** to open the Stripe customer portal.

## 5. Going live

When switching from test → live mode:

1. Re-create the Products / Prices in live mode (test prices do not
   carry over) and update `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS`.
2. Re-create the webhook endpoint in live mode and update
   `STRIPE_WEBHOOK_SECRET`.
3. Swap `STRIPE_SECRET_KEY` to `sk_live_…`.
4. Tax registration in Thailand — enable Stripe Tax if you need
   automatic 7 % VAT collection.
