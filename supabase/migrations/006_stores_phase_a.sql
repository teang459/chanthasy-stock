-- ====================================================
-- Multi-store rollout — Phase A (additive, no behavior change)
--
-- Scope (per MULTI_STORE_PLAN.md):
--   1. New tables: stores, store_members
--   2. New columns (nullable): store_id on data tables, payment_method on movements
--   3. New helper functions: my_store_ids, is_super_admin, is_store_admin, has_perm
--   4. RLS only on the new tables (existing tables still use owner_id model)
--
-- This migration must be runnable on a live database without disrupting
-- current users. Phase B (migration 007) backfills data; Phase C (008)
-- cuts policies over. Daily settlement (migration 009) comes later.
-- ====================================================

-- ============================================
-- 1. New tables
-- ============================================

CREATE TABLE IF NOT EXISTS stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  address       TEXT,
  phone         TEXT,
  tax_id        TEXT,
  vat_rate      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate BETWEEN 0 AND 100),
  vat_inclusive BOOLEAN      NOT NULL DEFAULT true,
  currency      TEXT         NOT NULL DEFAULT 'THB' CHECK (currency IN ('THB','LAK')),
  -- Reserved for future per-store timezone support (Q5 decision: hardcode TH for v1)
  timezone      TEXT         NOT NULL DEFAULT 'Asia/Bangkok',
  active        BOOLEAN      NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID NOT NULL REFERENCES stores(id)     ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('store_admin','staff','viewer')),
  perm_sell          BOOLEAN NOT NULL DEFAULT true,
  perm_receive       BOOLEAN NOT NULL DEFAULT true,
  perm_adjust        BOOLEAN NOT NULL DEFAULT false,
  perm_manage_plants BOOLEAN NOT NULL DEFAULT false,
  perm_view_reports  BOOLEAN NOT NULL DEFAULT false,
  perm_finance       BOOLEAN NOT NULL DEFAULT false,
  perm_settle        BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, user_id)
);

CREATE INDEX IF NOT EXISTS store_members_user_idx  ON store_members(user_id);
CREATE INDEX IF NOT EXISTS store_members_store_idx ON store_members(store_id);

-- Auto-update updated_at on stores
DROP TRIGGER IF EXISTS stores_updated_at ON stores;
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 2. store_id columns on existing data tables (nullable for now)
-- ============================================

ALTER TABLE plants          ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE movements       ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE categories      ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE suppliers       ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS plants_store_idx          ON plants(store_id);
CREATE INDEX IF NOT EXISTS movements_store_idx       ON movements(store_id);
CREATE INDEX IF NOT EXISTS categories_store_idx      ON categories(store_id);
CREATE INDEX IF NOT EXISTS suppliers_store_idx       ON suppliers(store_id);
CREATE INDEX IF NOT EXISTS calendar_events_store_idx ON calendar_events(store_id);
CREATE INDEX IF NOT EXISTS finance_entries_store_idx ON finance_entries(store_id);

-- payment_method enables settlement reconciliation (Q2 decision: ship all 4 from day 1)
ALTER TABLE movements ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IN ('cash','transfer','credit','other'));

-- ============================================
-- 3. Helper functions
-- ============================================

-- Return the UUID[] of stores the caller belongs to (empty array if none).
CREATE OR REPLACE FUNCTION public.my_store_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(store_id), ARRAY[]::UUID[])
  FROM store_members WHERE user_id = auth.uid()
$$;

-- Super admin = explicit 'super_admin' role OR the legacy global admin
-- (role='admin' AND manager_id IS NULL). Handles both Phase A and Phase B+.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (role = 'super_admin'
            OR (role = 'admin' AND manager_id IS NULL))
  )
$$;

-- Is the caller the store_admin of this specific store?
CREATE OR REPLACE FUNCTION public.is_store_admin(p_store UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_members
     WHERE user_id = auth.uid() AND store_id = p_store AND role = 'store_admin'
  )
$$;

-- has_perm('sell'), has_perm('receive'), etc. — super admin always true.
CREATE OR REPLACE FUNCTION public.has_perm(p_store UUID, p_perm TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v BOOLEAN; col TEXT;
BEGIN
  IF is_super_admin() THEN RETURN TRUE; END IF;
  col := 'perm_' || p_perm;
  IF col NOT IN ('perm_sell','perm_receive','perm_adjust','perm_manage_plants',
                 'perm_view_reports','perm_finance','perm_settle') THEN
    RAISE EXCEPTION 'Unknown permission: %', p_perm USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT %I FROM store_members WHERE user_id = $1 AND store_id = $2', col)
    INTO v USING auth.uid(), p_store;
  RETURN COALESCE(v, FALSE);
END $$;

GRANT EXECUTE ON FUNCTION public.my_store_ids()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_admin(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_perm(UUID, TEXT)        TO authenticated;

-- ============================================
-- 4. RLS on new tables (existing tables untouched in Phase A)
-- ============================================

ALTER TABLE stores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_members  ENABLE ROW LEVEL SECURITY;

-- Stores: super sees all, members see only their stores.
DROP POLICY IF EXISTS stores_select       ON stores;
DROP POLICY IF EXISTS stores_super_admin  ON stores;

CREATE POLICY stores_select ON stores FOR SELECT
  USING (is_super_admin() OR id = ANY(my_store_ids()));

-- Only super admin can create/modify/delete stores in Phase A.
-- Store admins editing their own store settings will land in a later policy revision.
CREATE POLICY stores_super_admin ON stores FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- store_members:
--   - super admin: full access
--   - store_admin: see + manage members in their store
--   - everyone: see their own row (so the frontend can read their perms)
DROP POLICY IF EXISTS store_members_select  ON store_members;
DROP POLICY IF EXISTS store_members_self    ON store_members;
DROP POLICY IF EXISTS store_members_manage  ON store_members;

CREATE POLICY store_members_select ON store_members FOR SELECT
  USING (
    is_super_admin()
    OR user_id = auth.uid()
    OR is_store_admin(store_id)
  );

CREATE POLICY store_members_manage ON store_members FOR ALL
  USING      (is_super_admin() OR is_store_admin(store_id))
  WITH CHECK (is_super_admin() OR is_store_admin(store_id));
