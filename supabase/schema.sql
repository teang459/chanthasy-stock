-- ================================================================
-- Chanthasy Stock — Supabase Schema (Production)
--
-- Consolidated source of truth for a fresh deploy. Bundles migrations
-- 001–008. Running this on an empty project produces the post-Phase-C
-- production state where RLS is driven by store_id + store_members.
--
-- Multi-store rollout status:
--   - Phase A (006) — stores, store_members, helpers
--   - Phase B (007) — data backfill (DML; only relevant for upgrades, not fresh deploys)
--   - Phase C (008) — RLS cutover + NOT NULL + role enum migration  ← applied here
--   - Phase E (009) — daily settlement                              (NOT YET APPLIED)
--
-- The legacy owner_id columns are still present on data tables as
-- dead weight; the frontend dual-writes them until a follow-up
-- cleanup migration drops them.
-- ================================================================

-- ====================================================
-- Tables
-- ====================================================

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin','member')),
  initials      TEXT NOT NULL DEFAULT '',
  shop_name     TEXT,
  manager_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,   -- legacy, kept for one more release
  currency      TEXT NOT NULL DEFAULT 'THB' CHECK (currency IN ('THB','LAK')),
  tax_id        TEXT,
  vat_rate      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate BETWEEN 0 AND 100),
  vat_inclusive BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  owner_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- legacy
  code       TEXT NOT NULL,
  name_th    TEXT NOT NULL,
  hue        INTEGER NOT NULL DEFAULT 140,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_code_per_store ON categories(store_id, code);
CREATE INDEX IF NOT EXISTS categories_store_idx ON categories(store_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  owner_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- legacy
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  contact    TEXT,
  phone      TEXT,
  email      TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_code_per_store ON suppliers(store_id, code);
CREATE INDEX IF NOT EXISTS suppliers_store_idx ON suppliers(store_id);

CREATE TABLE IF NOT EXISTS plants (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- legacy
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
CREATE UNIQUE INDEX IF NOT EXISTS plants_sku_per_store ON plants(store_id, sku);
CREATE INDEX IF NOT EXISTS plants_store_idx ON plants(store_id);

CREATE TABLE IF NOT EXISTS movements (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  owner_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- legacy
  plant_id       UUID REFERENCES plants(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('in','out','adjust','new','delete','rename')),
  qty            INTEGER NOT NULL,
  note           TEXT,
  payment_method TEXT CHECK (payment_method IN ('cash','transfer','credit','other')),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS movements_store_idx ON movements(store_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  owner_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- legacy
  title      TEXT NOT NULL,
  date       DATE NOT NULL,
  time       TEXT,
  type       TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general','delivery','order','reminder','maintenance')),
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS calendar_events_store_idx ON calendar_events(store_id);

CREATE TABLE IF NOT EXISTS finance_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- legacy (still NOT NULL)
  type       TEXT NOT NULL CHECK (type IN ('income','expense')),
  category   TEXT NOT NULL DEFAULT 'other',
  title      TEXT NOT NULL,
  amount     NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS finance_entries_store_idx ON finance_entries(store_id);
CREATE INDEX IF NOT EXISTS finance_entries_owner_date_idx ON finance_entries(owner_id, date DESC);

-- ====================================================
-- Helper functions (SECURITY DEFINER bypasses RLS internally)
-- ====================================================

CREATE OR REPLACE FUNCTION public.my_store_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT COALESCE(array_agg(store_id), ARRAY[]::UUID[])
  FROM store_members WHERE user_id = auth.uid()
$func$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid() AND role = 'super_admin'
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

-- Profiles
DROP POLICY IF EXISTS profiles_self  ON profiles;
DROP POLICY IF EXISTS profiles_admin ON profiles;
CREATE POLICY profiles_self  ON profiles FOR ALL
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin ON profiles FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Plants
DROP POLICY IF EXISTS plants_select ON plants;
DROP POLICY IF EXISTS plants_insert ON plants;
DROP POLICY IF EXISTS plants_update ON plants;
DROP POLICY IF EXISTS plants_delete ON plants;
CREATE POLICY plants_select ON plants FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY plants_insert ON plants FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'));
CREATE POLICY plants_update ON plants FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'manage_plants'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'));
CREATE POLICY plants_delete ON plants FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Categories
DROP POLICY IF EXISTS categories_select ON categories;
DROP POLICY IF EXISTS categories_insert ON categories;
DROP POLICY IF EXISTS categories_update ON categories;
DROP POLICY IF EXISTS categories_delete ON categories;
CREATE POLICY categories_select ON categories FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY categories_insert ON categories FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'));
CREATE POLICY categories_update ON categories FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'manage_plants'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'));
CREATE POLICY categories_delete ON categories FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Suppliers
DROP POLICY IF EXISTS suppliers_select ON suppliers;
DROP POLICY IF EXISTS suppliers_insert ON suppliers;
DROP POLICY IF EXISTS suppliers_update ON suppliers;
DROP POLICY IF EXISTS suppliers_delete ON suppliers;
CREATE POLICY suppliers_select ON suppliers FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY suppliers_insert ON suppliers FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'))
;
CREATE POLICY suppliers_update ON suppliers FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'manage_plants'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'));
CREATE POLICY suppliers_delete ON suppliers FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Movements
DROP POLICY IF EXISTS movements_select ON movements;
DROP POLICY IF EXISTS movements_insert ON movements;
DROP POLICY IF EXISTS movements_update ON movements;
DROP POLICY IF EXISTS movements_delete ON movements;
CREATE POLICY movements_select ON movements FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY movements_insert ON movements FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      store_id = ANY(my_store_ids())
      AND CASE type
            WHEN 'out'    THEN has_perm(store_id, 'sell')
            WHEN 'in'     THEN has_perm(store_id, 'receive')
            WHEN 'adjust' THEN has_perm(store_id, 'adjust')
            ELSE has_perm(store_id, 'manage_plants')
          END
    )
  );
CREATE POLICY movements_update ON movements FOR UPDATE
  USING      (is_super_admin() OR is_store_admin(store_id))
  WITH CHECK (is_super_admin() OR is_store_admin(store_id));
CREATE POLICY movements_delete ON movements FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Calendar
DROP POLICY IF EXISTS calendar_select ON calendar_events;
DROP POLICY IF EXISTS calendar_insert ON calendar_events;
DROP POLICY IF EXISTS calendar_update ON calendar_events;
DROP POLICY IF EXISTS calendar_delete ON calendar_events;
CREATE POLICY calendar_select ON calendar_events FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY calendar_insert ON calendar_events FOR INSERT
  WITH CHECK (is_super_admin() OR (store_id = ANY(my_store_ids())));
CREATE POLICY calendar_update ON calendar_events FOR UPDATE
  USING      (is_super_admin() OR store_id = ANY(my_store_ids()))
  WITH CHECK (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY calendar_delete ON calendar_events FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Finance entries
DROP POLICY IF EXISTS finance_select ON finance_entries;
DROP POLICY IF EXISTS finance_insert ON finance_entries;
DROP POLICY IF EXISTS finance_update ON finance_entries;
DROP POLICY IF EXISTS finance_delete ON finance_entries;
CREATE POLICY finance_select ON finance_entries FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY finance_insert ON finance_entries FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'finance'));
CREATE POLICY finance_update ON finance_entries FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'finance'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'finance'));
CREATE POLICY finance_delete ON finance_entries FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Stores
DROP POLICY IF EXISTS stores_select      ON stores;
DROP POLICY IF EXISTS stores_super_admin ON stores;
CREATE POLICY stores_select ON stores FOR SELECT
  USING (is_super_admin() OR id = ANY(my_store_ids()));
CREATE POLICY stores_super_admin ON stores FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Store members
DROP POLICY IF EXISTS store_members_select ON store_members;
DROP POLICY IF EXISTS store_members_manage ON store_members;
CREATE POLICY store_members_select ON store_members FOR SELECT
  USING (is_super_admin() OR user_id = auth.uid() OR is_store_admin(store_id));
CREATE POLICY store_members_manage ON store_members FOR ALL
  USING      (is_super_admin() OR is_store_admin(store_id))
  WITH CHECK (is_super_admin() OR is_store_admin(store_id));

-- ====================================================
-- Triggers
-- ====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $handle$
BEGIN
  INSERT INTO public.profiles (id, name, role, initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'member',
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

DROP TRIGGER IF EXISTS stores_updated_at ON stores;
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Plant lifecycle audit
CREATE OR REPLACE FUNCTION public.log_plant_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $logplant$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO movements (plant_id, type, qty, note, created_by, store_id)
    VALUES (NEW.id, 'new', NEW.stock, NEW.name, auth.uid(), NEW.store_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM stores WHERE id = OLD.store_id) THEN
      INSERT INTO movements (plant_id, type, qty, note, created_by, store_id)
      VALUES (NULL, 'delete', OLD.stock, OLD.name, auth.uid(), OLD.store_id);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO movements (plant_id, type, qty, note, created_by, store_id)
    VALUES (NEW.id, 'rename', 0, OLD.name || ' > ' || NEW.name, auth.uid(), NEW.store_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$logplant$;

DROP TRIGGER IF EXISTS plants_log_event ON plants;
CREATE TRIGGER plants_log_event
  AFTER INSERT OR UPDATE OR DELETE ON plants
  FOR EACH ROW EXECUTE FUNCTION public.log_plant_event();

-- Stock change audit (fires on UPDATE only when stock changes)
CREATE OR REPLACE FUNCTION public.log_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $logmove$
DECLARE
  v_type  text;
  v_note  text;
  v_delta integer;
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock THEN
    v_delta := NEW.stock - OLD.stock;
    v_type  := COALESCE(
      nullif(current_setting('app.movement_type', true), ''),
      CASE WHEN v_delta > 0 THEN 'in' WHEN v_delta < 0 THEN 'out' ELSE 'adjust' END
    );
    v_note  := nullif(current_setting('app.movement_note', true), '');
    INSERT INTO movements (plant_id, type, qty, note, created_by, store_id)
    VALUES (NEW.id, v_type, v_delta, v_note, auth.uid(), NEW.store_id);
  END IF;
  RETURN NEW;
END;
$logmove$;

DROP TRIGGER IF EXISTS plants_log_movement ON plants;
CREATE TRIGGER plants_log_movement
  AFTER UPDATE ON plants
  FOR EACH ROW EXECUTE FUNCTION public.log_stock_movement();

-- ====================================================
-- RPCs
-- ====================================================

DROP FUNCTION IF EXISTS public.adjust_stock(UUID, TEXT, INTEGER, TEXT);
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
  v_new_stock  INTEGER;
  v_qty_signed INTEGER;
  v_perm       TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plant FROM plants WHERE id = p_plant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plant not found' USING ERRCODE = '42501';
  END IF;

  v_perm := CASE p_type
    WHEN 'in'     THEN 'receive'
    WHEN 'out'    THEN 'sell'
    WHEN 'adjust' THEN 'adjust'
    ELSE NULL
  END;
  IF v_perm IS NULL THEN
    RAISE EXCEPTION 'Invalid adjustment type' USING ERRCODE = '22023';
  END IF;

  IF NOT has_perm(v_plant.store_id, v_perm) THEN
    RAISE EXCEPTION 'Not permitted to %', v_perm USING ERRCODE = '42501';
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
  END IF;

  UPDATE plants SET stock = v_new_stock, updated_at = NOW() WHERE id = p_plant_id;

  INSERT INTO movements (store_id, plant_id, type, qty, note, created_by)
  VALUES (v_plant.store_id, p_plant_id, p_type, v_qty_signed, p_note, auth.uid());
END;
$adjust$;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;

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
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      p.id, p.name, p.shop_name, p.role,
      COALESCE((SELECT COUNT(*) FROM plants WHERE store_id = p.id), 0) AS plant_count,
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
