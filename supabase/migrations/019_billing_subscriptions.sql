-- ====================================================
-- B1: Billing / Subscription foundation
--
-- Adds the data model and read-only RPCs needed for the in-app
-- pricing / billing UI. Payment-provider wiring (Stripe checkout
-- sessions, webhooks) is intentionally deferred — it lives behind
-- Edge Functions and writes to this table via service_role, so the
-- schema is provider-agnostic.
--
-- Every store gets a free-tier row on creation; existing stores are
-- backfilled. The free row stays even after upgrade — only its tier /
-- status / period fields change, so there is at most one row per store.
-- ====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 UUID NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  tier                     TEXT NOT NULL DEFAULT 'free'
                             CHECK (tier IN ('free','pro','business')),
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','trialing','past_due','canceled','expired')),
  trial_end                TIMESTAMPTZ,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,
  provider                 TEXT CHECK (provider IN ('stripe','omise') OR provider IS NULL),
  provider_customer_id     TEXT,
  provider_subscription_id TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE INDEX IF NOT EXISTS subscriptions_provider_sub_idx
  ON subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

-- updated_at maintenance
DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS — members read their store's row; writes only via service_role
-- (webhooks) or super_admin. Members CANNOT change their own tier
-- by direct UPDATE; they must go through the checkout flow.
-- ============================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subs_select ON subscriptions;
CREATE POLICY subs_select ON subscriptions FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));

DROP POLICY IF EXISTS subs_super_admin_write ON subscriptions;
CREATE POLICY subs_super_admin_write ON subscriptions FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================
-- Auto-create free subscription on store insert
-- ============================================
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  INSERT INTO subscriptions (store_id, tier, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS stores_create_subscription ON stores;
CREATE TRIGGER stores_create_subscription
  AFTER INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION create_default_subscription();

-- Backfill: every existing store gets a free-tier row.
INSERT INTO subscriptions (store_id, tier, status)
SELECT id, 'free', 'active' FROM stores
ON CONFLICT (store_id) DO NOTHING;

-- ============================================
-- RPC: get_store_usage(store_id) — counts the metered resources
-- so the UI can render usage bars without leaking raw rows.
-- ============================================
DROP FUNCTION IF EXISTS public.get_store_usage(UUID);
CREATE OR REPLACE FUNCTION public.get_store_usage(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_plants    INTEGER;
  v_moves_30d INTEGER;
  v_members   INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR p_store_id = ANY(my_store_ids())) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_plants     FROM plants     WHERE store_id = p_store_id;
  SELECT COUNT(*) INTO v_moves_30d  FROM movements  WHERE store_id = p_store_id AND created_at >= NOW() - INTERVAL '30 days';
  SELECT COUNT(*) INTO v_members    FROM store_members WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'plants',       v_plants,
    'movements30d', v_moves_30d,
    'members',      v_members
  );
END $func$;

GRANT EXECUTE ON FUNCTION public.get_store_usage(UUID) TO authenticated;

-- ============================================
-- Audit hook: log tier changes on subscriptions
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_subscription_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM log_audit(
      'subscription.change',
      'subscription',
      NEW.id,
      NEW.store_id,
      jsonb_build_object(
        'before_tier',   OLD.tier,   'after_tier',   NEW.tier,
        'before_status', OLD.status, 'after_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS subscriptions_audit ON subscriptions;
CREATE TRIGGER subscriptions_audit
  AFTER UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION audit_subscription_trigger();
