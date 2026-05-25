-- ================================================================
-- Chanthasy Stock — Supabase Schema (Production)
--
-- This file is the CONSOLIDATED source of truth for a fresh deploy.
-- It bundles migrations 001–006 so running it on an empty project
-- produces the same state as the current production database.
--
-- Migration 006 (Phase A) adds the multi-store scaffolding additively:
-- stores, store_members, store_id columns (nullable), and the new
-- helper functions. The legacy owner_id-based RLS still drives access
-- on the data tables until Phase C cutover (migration 008).
--
-- For an existing project, prefer running the individual files in
-- supabase/migrations/ in order.
-- ================================================================

-- ====================================================
-- Tables
-- ====================================================

-- Profiles (linked to auth.users; owner = self, staff = manager_id set)
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff','viewer')),
  initials      TEXT NOT NULL DEFAULT '',
  shop_name     TEXT,
  manager_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  currency      TEXT NOT NULL DEFAULT 'THB' CHECK (currency IN ('THB','LAK')),
  tax_id        TEXT,
  vat_rate      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  vat_inclusive BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Categories (per-owner)
CREATE TABLE IF NOT EXISTS categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name_th    TEXT NOT NULL,
  hue        INTEGER NOT NULL DEFAULT 140,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_code_per_owner ON categories(owner_id, code);

-- Suppliers (per-owner)
CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_code_per_owner ON suppliers(owner_id, code);

-- Plants (per-owner)
CREATE TABLE IF NOT EXISTS plants (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_sci    TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock   INTEGER NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  price       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost        NUMERIC(10,2) CHECK (cost >= 0),
  note        TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS plants_sku_per_owner ON plants(owner_id, sku);

-- Movements (stock history; extended types from migration 001)
CREATE TABLE IF NOT EXISTS movements (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id   UUID REFERENCES plants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('in','out','adjust','new','delete','rename')),
  qty        INTEGER NOT NULL,
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar Events
CREATE TABLE IF NOT EXISTS calendar_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  date       DATE NOT NULL,
  time       TEXT,
  type       TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general','delivery','order','reminder','maintenance')),
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Finance entries (migration 002: manual income/expense ledger)
CREATE TABLE IF NOT EXISTS finance_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('income','expense')),
  category   TEXT NOT NULL DEFAULT 'other',
  title      TEXT NOT NULL,
  amount     NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS finance_entries_owner_date_idx ON finance_entries(owner_id, date DESC);

-- ====================================================
-- Phase A multi-store scaffolding (migration 006)
-- store_id columns are nullable until Phase C cutover (008).
-- ====================================================

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

-- store_id columns on existing data tables
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

ALTER TABLE movements ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IN ('cash','transfer','credit','other'));

-- ====================================================
-- Helper functions (SECURITY DEFINER bypasses RLS internally)
-- ====================================================

-- Effective owner: self for shop owners, manager for staff
CREATE OR REPLACE FUNCTION public.effective_owner_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT COALESCE(manager_id, id) FROM profiles WHERE id = auth.uid()
$func$;

-- Can write = team owner OR (admin/staff role within a team)
CREATE OR REPLACE FUNCTION public.can_write()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT (manager_id IS NULL OR role IN ('admin','staff'))
  FROM profiles WHERE id = auth.uid()
$func$;

-- Can delete = team owner OR admin role within a team
CREATE OR REPLACE FUNCTION public.can_delete()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT (manager_id IS NULL OR role = 'admin')
  FROM profiles WHERE id = auth.uid()
$func$;

-- Global admin check (cross-tenant)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND manager_id IS NULL)
$func$;

-- Phase A multi-store helpers (migration 006).
CREATE OR REPLACE FUNCTION public.my_store_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT COALESCE(array_agg(store_id), ARRAY[]::UUID[])
  FROM store_members WHERE user_id = auth.uid()
$func$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND (role = 'super_admin'
            OR (role = 'admin' AND manager_id IS NULL))
  )
$func$;

CREATE OR REPLACE FUNCTION public.is_store_admin(p_store UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT EXISTS (
    SELECT 1 FROM store_members
     WHERE user_id = auth.uid() AND store_id = p_store AND role = 'store_admin'
  )
$func$;

CREATE OR REPLACE FUNCTION public.has_perm(p_store UUID, p_perm TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $func$
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
END $func$;

GRANT EXECUTE ON FUNCTION public.my_store_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_perm(UUID, TEXT) TO authenticated;

-- ====================================================
-- Row Level Security
-- ====================================================

ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_members    ENABLE ROW LEVEL SECURITY;

-- Profiles: self_only + admin_bypass
DROP POLICY IF EXISTS profiles_self  ON profiles;
DROP POLICY IF EXISTS profiles_admin ON profiles;
CREATE POLICY profiles_self  ON profiles FOR ALL
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin ON profiles FOR ALL
  USING (is_admin())      WITH CHECK (is_admin());

-- Plants
DROP POLICY IF EXISTS plants_select ON plants;
DROP POLICY IF EXISTS plants_insert ON plants;
DROP POLICY IF EXISTS plants_update ON plants;
DROP POLICY IF EXISTS plants_delete ON plants;
DROP POLICY IF EXISTS plants_admin  ON plants;
CREATE POLICY plants_select ON plants FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY plants_insert ON plants FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY plants_update ON plants FOR UPDATE USING (owner_id = effective_owner_id() AND can_write())  WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY plants_delete ON plants FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY plants_admin  ON plants FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Categories
DROP POLICY IF EXISTS categories_select ON categories;
DROP POLICY IF EXISTS categories_insert ON categories;
DROP POLICY IF EXISTS categories_update ON categories;
DROP POLICY IF EXISTS categories_delete ON categories;
DROP POLICY IF EXISTS categories_admin  ON categories;
CREATE POLICY categories_select ON categories FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY categories_insert ON categories FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY categories_update ON categories FOR UPDATE USING (owner_id = effective_owner_id() AND can_write())  WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY categories_delete ON categories FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY categories_admin  ON categories FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Suppliers
DROP POLICY IF EXISTS suppliers_select ON suppliers;
DROP POLICY IF EXISTS suppliers_insert ON suppliers;
DROP POLICY IF EXISTS suppliers_update ON suppliers;
DROP POLICY IF EXISTS suppliers_delete ON suppliers;
DROP POLICY IF EXISTS suppliers_admin  ON suppliers;
CREATE POLICY suppliers_select ON suppliers FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY suppliers_insert ON suppliers FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY suppliers_update ON suppliers FOR UPDATE USING (owner_id = effective_owner_id() AND can_write())  WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY suppliers_delete ON suppliers FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY suppliers_admin  ON suppliers FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Movements (no UPDATE/DELETE for staff, only owner/admin)
DROP POLICY IF EXISTS movements_select ON movements;
DROP POLICY IF EXISTS movements_insert ON movements;
DROP POLICY IF EXISTS movements_update ON movements;
DROP POLICY IF EXISTS movements_delete ON movements;
DROP POLICY IF EXISTS movements_admin  ON movements;
CREATE POLICY movements_select ON movements FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY movements_insert ON movements FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY movements_update ON movements FOR UPDATE USING (owner_id = effective_owner_id() AND can_delete())  WITH CHECK (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY movements_delete ON movements FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY movements_admin  ON movements FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Calendar
DROP POLICY IF EXISTS calendar_select ON calendar_events;
DROP POLICY IF EXISTS calendar_insert ON calendar_events;
DROP POLICY IF EXISTS calendar_update ON calendar_events;
DROP POLICY IF EXISTS calendar_delete ON calendar_events;
DROP POLICY IF EXISTS calendar_admin  ON calendar_events;
CREATE POLICY calendar_select ON calendar_events FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY calendar_insert ON calendar_events FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY calendar_update ON calendar_events FOR UPDATE USING (owner_id = effective_owner_id() AND can_write())  WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY calendar_delete ON calendar_events FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY calendar_admin  ON calendar_events FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Finance entries
DROP POLICY IF EXISTS finance_select ON finance_entries;
DROP POLICY IF EXISTS finance_insert ON finance_entries;
DROP POLICY IF EXISTS finance_update ON finance_entries;
DROP POLICY IF EXISTS finance_delete ON finance_entries;
DROP POLICY IF EXISTS finance_admin  ON finance_entries;
CREATE POLICY finance_select ON finance_entries FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY finance_insert ON finance_entries FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY finance_update ON finance_entries FOR UPDATE USING (owner_id = effective_owner_id() AND can_write())  WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY finance_delete ON finance_entries FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY finance_admin  ON finance_entries FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Stores + store_members (Phase A; existing tables still use owner_id model)
DROP POLICY IF EXISTS stores_select      ON stores;
DROP POLICY IF EXISTS stores_super_admin ON stores;
CREATE POLICY stores_select ON stores FOR SELECT
  USING (is_super_admin() OR id = ANY(my_store_ids()));
CREATE POLICY stores_super_admin ON stores FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS store_members_select ON store_members;
DROP POLICY IF EXISTS store_members_manage ON store_members;
CREATE POLICY store_members_select ON store_members FOR SELECT
  USING (is_super_admin() OR user_id = auth.uid() OR is_store_admin(store_id));
CREATE POLICY store_members_manage ON store_members FOR ALL
  USING      (is_super_admin() OR is_store_admin(store_id))
  WITH CHECK (is_super_admin() OR is_store_admin(store_id));

-- ====================================================
-- Trigger: create profile when user signs up (migration 003)
-- ====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $handle$
BEGIN
  INSERT INTO public.profiles (id, name, role, initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'staff',
    upper(left(split_part(NEW.email, '@', 1), 2))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$handle$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS plants_updated_at ON plants;
CREATE TRIGGER plants_updated_at BEFORE UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ====================================================
-- Trigger: log plant lifecycle events into movements (migration 003)
-- Skips the DELETE log row when the owner is being cascade-deleted,
-- so removing an auth.user does not fail on the FK.
-- ====================================================

CREATE OR REPLACE FUNCTION public.log_plant_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $logplant$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO movements (plant_id, type, qty, note, created_by, owner_id)
    VALUES (NEW.id, 'new', NEW.stock, NEW.name, auth.uid(), NEW.owner_id);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.owner_id) THEN
      INSERT INTO movements (plant_id, type, qty, note, created_by, owner_id)
      VALUES (NULL, 'delete', OLD.stock, OLD.name, auth.uid(), OLD.owner_id);
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO movements (plant_id, type, qty, note, created_by, owner_id)
    VALUES (NEW.id, 'rename', 0, OLD.name || ' > ' || NEW.name, auth.uid(), NEW.owner_id);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$logplant$;

DROP TRIGGER IF EXISTS plants_log_event ON plants;
CREATE TRIGGER plants_log_event
  AFTER INSERT OR UPDATE OR DELETE ON plants
  FOR EACH ROW EXECUTE FUNCTION public.log_plant_event();

-- ====================================================
-- RPC: adjust_stock (migration 004 — secure version)
-- Enforces tenant + role inside the function because
-- SECURITY DEFINER bypasses RLS.
-- ====================================================

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_plant_id UUID,
  p_type     TEXT,
  p_qty      INTEGER,
  p_note     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $adjust$
DECLARE
  v_plant      plants%ROWTYPE;
  v_owner      UUID;
  v_new_stock  INTEGER;
  v_qty_signed INTEGER;
BEGIN
  v_owner := effective_owner_id();
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT can_write() THEN
    RAISE EXCEPTION 'Not permitted to write' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plant
  FROM plants
  WHERE id = p_plant_id
    AND owner_id = v_owner;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plant not found or not permitted' USING ERRCODE = '42501';
  END IF;

  IF p_type = 'in' THEN
    IF p_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0 for in' USING ERRCODE = '22023'; END IF;
    v_new_stock  := v_plant.stock + p_qty;
    v_qty_signed := p_qty;
  ELSIF p_type = 'out' THEN
    IF p_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0 for out' USING ERRCODE = '22023'; END IF;
    v_new_stock  := v_plant.stock - p_qty;
    v_qty_signed := -p_qty;
    IF v_new_stock < 0 THEN RAISE EXCEPTION 'Insufficient stock' USING ERRCODE = '23514'; END IF;
  ELSIF p_type = 'adjust' THEN
    IF p_qty < 0 THEN RAISE EXCEPTION 'qty must be >= 0 for adjust' USING ERRCODE = '22023'; END IF;
    v_new_stock  := p_qty;
    v_qty_signed := p_qty - v_plant.stock;
  ELSE
    RAISE EXCEPTION 'Invalid adjustment type' USING ERRCODE = '22023';
  END IF;

  UPDATE plants
     SET stock = v_new_stock,
         updated_at = NOW()
   WHERE id = p_plant_id;

  INSERT INTO movements (owner_id, plant_id, type, qty, note, created_by)
  VALUES (v_plant.owner_id, p_plant_id, p_type, v_qty_signed, p_note, auth.uid());
END;
$adjust$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;

-- ====================================================
-- RPC: get_all_shops_for_admin
-- ====================================================

DROP FUNCTION IF EXISTS public.get_all_shops_for_admin();
CREATE OR REPLACE FUNCTION public.get_all_shops_for_admin()
RETURNS TABLE(
  id UUID,
  name TEXT,
  shop_name TEXT,
  role TEXT,
  plant_count BIGINT,
  updated_at TIMESTAMPTZ,
  email TEXT,
  manager_id UUID
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $shops$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      p.id, p.name, p.shop_name, p.role,
      COALESCE((SELECT COUNT(*) FROM plants WHERE owner_id = p.id), 0) AS plant_count,
      p.updated_at,
      u.email::TEXT,
      p.manager_id
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.updated_at DESC NULLS LAST;
END;
$shops$;

GRANT EXECUTE ON FUNCTION public.get_all_shops_for_admin() TO authenticated;

-- ====================================================
-- Storage bucket: plant-images
-- ====================================================
-- Create bucket via Dashboard or:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('plant-images','plant-images', true);
-- Storage policies should allow authenticated users to upload to their own owner_id folder.
