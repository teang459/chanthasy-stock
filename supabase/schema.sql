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
--   - Phase C (008) — RLS cutover + NOT NULL + role enum migration
--   - Phase E (009) — daily settlement
--   - 010 — adjust_stock RPC accepts p_payment for cash/transfer/credit/other
--   - 011 — stores_admin_update policy (store_admin edits own store)
--   - 012 — legacy owner_id / manager_id / shop_name / VAT / currency
--           columns dropped; profiles is now just (id, name, role,
--           initials, updated_at)
--   - 013 — customers table + movements.customer_id + adjust_stock
--           gains p_customer for sale → customer linkage
--   - 014 — purchase_orders + purchase_order_lines + receive_po_line
--           RPC. Plus a side fix: dropped plants_log_movement trigger
--           and log_stock_movement function (was double-logging every
--           adjust_stock call post-Phase C).
--   - 015 — one-off data cleanup: removed the 4 phantom movements the
--           dropped trigger had already produced; recomputed the
--           affected settlement snapshot with an audit note.
--   - 016 — audit_logs table + triggers on stores/store_members and
--           profile.role + log inside reopen_settlement. Edge Function
--           writes user.create / user.delete rows.
--   - 017 — audit triggers FK-safe on store delete (store_id → NULL
--           when parent gone) + handle_new_user role 'staff' → 'member'
--           realignment with profiles_role_check enum.
--   - 018 — report_stats() RPC: server-side aggregate for Reports page
--           (replaced 50k row client-side aggregation).            ← applied here
-- ================================================================

-- ====================================================
-- Tables
-- ====================================================

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin','member')),
  initials   TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  plant_id       UUID REFERENCES plants(id) ON DELETE CASCADE,
  customer_id    UUID,  -- FK added after customers table is declared
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

-- (removed in migration 014: log_stock_movement / plants_log_movement
--  trigger was double-logging adjust_stock movements after Phase C.
--  adjust_stock is now the sole writer of stock change movements.)

-- ====================================================
-- RPCs
-- ====================================================

DROP FUNCTION IF EXISTS public.adjust_stock(UUID, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.adjust_stock(UUID, TEXT, INTEGER, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_plant_id UUID,
  p_type     TEXT,
  p_qty      INTEGER,
  p_note     TEXT,
  p_payment  TEXT DEFAULT NULL,
  p_customer UUID DEFAULT NULL
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
  v_payment    TEXT;
  v_customer   UUID := NULL;
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

  IF p_type = 'out' THEN
    v_payment := COALESCE(NULLIF(TRIM(p_payment), ''), 'cash');
    IF v_payment NOT IN ('cash','transfer','credit','other') THEN
      RAISE EXCEPTION 'Invalid payment_method: %', v_payment USING ERRCODE = '22023';
    END IF;
    IF p_customer IS NOT NULL THEN
      PERFORM 1 FROM customers WHERE id = p_customer AND store_id = v_plant.store_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found in this store' USING ERRCODE = '42501';
      END IF;
      v_customer := p_customer;
    END IF;
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

  INSERT INTO movements (store_id, plant_id, type, qty, note, created_by, payment_method, customer_id)
  VALUES (v_plant.store_id, p_plant_id, p_type, v_qty_signed, p_note, auth.uid(), v_payment, v_customer);
END;
$adjust$;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, INTEGER, TEXT, TEXT, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.get_all_shops_for_admin();
CREATE OR REPLACE FUNCTION public.get_all_shops_for_admin()
RETURNS TABLE(
  id          UUID,
  name        TEXT,
  role        TEXT,
  plant_count BIGINT,
  updated_at  TIMESTAMPTZ,
  email       TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $shops$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      p.id, p.name, p.role,
      COALESCE((SELECT COUNT(*) FROM plants WHERE store_id = p.id), 0) AS plant_count,
      p.updated_at,
      u.email::TEXT
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.updated_at DESC NULLS LAST;
END;
$shops$;
GRANT EXECUTE ON FUNCTION public.get_all_shops_for_admin() TO authenticated;

-- ====================================================
-- Reports aggregate (migration 018)
-- Replaces client-side aggregation of up to 50k movement rows with a
-- single JSON blob. Page renders from this; movement CSV export still
-- fetches raw rows lazily.
-- ====================================================
DROP FUNCTION IF EXISTS public.report_stats(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.report_stats(
  p_store_id    UUID,
  p_range_days  INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_from       TIMESTAMPTZ;
  v_summary    JSONB;
  v_cat_rows   JSONB;
  v_top_stock  JSONB;
  v_top_value  JSONB;
  v_top_cust   JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR has_perm(p_store_id, 'view_reports')) THEN
    RAISE EXCEPTION 'Not permitted to view reports' USING ERRCODE = '42501';
  END IF;

  IF p_range_days IS NOT NULL AND p_range_days > 0 THEN
    v_from := date_trunc('day', NOW() - make_interval(days => p_range_days));
  END IF;

  SELECT jsonb_build_object(
    'total',       COUNT(*),
    'outCount',    COUNT(*) FILTER (WHERE stock <= 0),
    'lowCount',    COUNT(*) FILTER (WHERE stock > 0 AND stock <= min_stock),
    'okCount',     COUNT(*) FILTER (WHERE stock > min_stock),
    'totalStock',  COALESCE(SUM(stock), 0),
    'totalValue',  COALESCE(SUM(stock * price), 0),
    'totalCost',   COALESCE(SUM(stock * COALESCE(cost, 0)), 0)
  )
  INTO v_summary
  FROM plants
  WHERE store_id = p_store_id;

  v_summary := v_summary || jsonb_build_object(
    'movesCount',
    (SELECT COUNT(*) FROM movements
      WHERE store_id = p_store_id
        AND (v_from IS NULL OR created_at >= v_from))
  );

  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY (c.value)::NUMERIC DESC), '[]'::jsonb)
  INTO v_cat_rows
  FROM (
    SELECT
      COALESCE(cat.name_th, 'ไม่มีหมวดหมู่') AS name,
      COUNT(p.id)                            AS count,
      COALESCE(SUM(p.stock), 0)              AS stock,
      COALESCE(SUM(p.stock * p.price), 0)    AS value
    FROM plants p
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE p.store_id = p_store_id
    GROUP BY COALESCE(cat.name_th, 'ไม่มีหมวดหมู่')
  ) c;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_stock
  FROM (
    SELECT id, name, sku, stock, price
    FROM plants WHERE store_id = p_store_id
    ORDER BY stock DESC, name ASC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_value
  FROM (
    SELECT id, name, sku, stock, price
    FROM plants WHERE store_id = p_store_id
    ORDER BY (stock * price) DESC, name ASC LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t.total)::NUMERIC DESC), '[]'::jsonb)
  INTO v_top_cust
  FROM (
    SELECT
      cu.id, cu.name, cu.code,
      COUNT(m.id)::INTEGER                                   AS count,
      COALESCE(SUM(ABS(m.qty) * COALESCE(pl.price, 0)), 0)  AS total
    FROM movements m
    JOIN customers cu ON cu.id = m.customer_id
    LEFT JOIN plants pl ON pl.id = m.plant_id
    WHERE m.store_id = p_store_id
      AND m.type = 'out'
      AND m.customer_id IS NOT NULL
      AND (v_from IS NULL OR m.created_at >= v_from)
    GROUP BY cu.id, cu.name, cu.code
    ORDER BY total DESC LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'summary',      v_summary,
    'catRows',      v_cat_rows,
    'topStock',     v_top_stock,
    'topValue',     v_top_value,
    'topCustomers', v_top_cust
  );
END;
$func$;
GRANT EXECUTE ON FUNCTION public.report_stats(UUID, INTEGER) TO authenticated;

-- ====================================================
-- Phase E: Daily Settlement (migration 009)
-- ====================================================

CREATE TABLE IF NOT EXISTS daily_settlements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  business_date  DATE NOT NULL,
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opening_cash   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closed_at      TIMESTAMPTZ,
  closed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closing_cash   NUMERIC(12,2),
  total_sales    NUMERIC(12,2),
  total_vat      NUMERIC(12,2),
  total_cost     NUMERIC(12,2),
  total_income   NUMERIC(12,2),
  total_expense  NUMERIC(12,2),
  net_sales      NUMERIC(12,2),
  expected_cash  NUMERIC(12,2),
  difference     NUMERIC(12,2),
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','reopened')),
  UNIQUE(store_id, business_date)
);
CREATE INDEX IF NOT EXISTS daily_settlements_store_date_idx ON daily_settlements(store_id, business_date DESC);
CREATE INDEX IF NOT EXISTS daily_settlements_status_idx     ON daily_settlements(store_id, status);

ALTER TABLE movements       ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES daily_settlements(id) ON DELETE SET NULL;
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES daily_settlements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS movements_settlement_idx       ON movements(settlement_id);
CREATE INDEX IF NOT EXISTS finance_entries_settlement_idx ON finance_entries(settlement_id);

ALTER TABLE daily_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_select ON daily_settlements;
DROP POLICY IF EXISTS settlement_insert ON daily_settlements;
DROP POLICY IF EXISTS settlement_update ON daily_settlements;
DROP POLICY IF EXISTS settlement_delete ON daily_settlements;
CREATE POLICY settlement_select ON daily_settlements FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY settlement_insert ON daily_settlements FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'settle'));
CREATE POLICY settlement_update ON daily_settlements FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'settle'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'settle'));
CREATE POLICY settlement_delete ON daily_settlements FOR DELETE
  USING (is_super_admin());

-- Lock movements / finance once their settlement is closed. The earlier
-- movements_update / finance_update policies are replaced here.
DROP POLICY IF EXISTS movements_update ON movements;
CREATE POLICY movements_update ON movements FOR UPDATE
  USING (
    is_super_admin()
    OR (is_store_admin(store_id) AND (
          settlement_id IS NULL
          OR EXISTS (SELECT 1 FROM daily_settlements WHERE id = movements.settlement_id AND status <> 'closed')))
  )
  WITH CHECK (
    is_super_admin()
    OR (is_store_admin(store_id) AND (
          settlement_id IS NULL
          OR EXISTS (SELECT 1 FROM daily_settlements WHERE id = movements.settlement_id AND status <> 'closed')))
  );

DROP POLICY IF EXISTS movements_delete ON movements;
CREATE POLICY movements_delete ON movements FOR DELETE
  USING (
    is_super_admin()
    OR (is_store_admin(store_id) AND (
          settlement_id IS NULL
          OR EXISTS (SELECT 1 FROM daily_settlements WHERE id = movements.settlement_id AND status <> 'closed')))
  );

DROP POLICY IF EXISTS finance_update ON finance_entries;
CREATE POLICY finance_update ON finance_entries FOR UPDATE
  USING (
    is_super_admin()
    OR (has_perm(store_id, 'finance') AND (
          settlement_id IS NULL
          OR EXISTS (SELECT 1 FROM daily_settlements WHERE id = finance_entries.settlement_id AND status <> 'closed')))
  )
  WITH CHECK (
    is_super_admin()
    OR (has_perm(store_id, 'finance') AND (
          settlement_id IS NULL
          OR EXISTS (SELECT 1 FROM daily_settlements WHERE id = finance_entries.settlement_id AND status <> 'closed')))
  );

DROP POLICY IF EXISTS finance_delete ON finance_entries;
CREATE POLICY finance_delete ON finance_entries FOR DELETE
  USING (
    is_super_admin()
    OR (is_store_admin(store_id) AND (
          settlement_id IS NULL
          OR EXISTS (SELECT 1 FROM daily_settlements WHERE id = finance_entries.settlement_id AND status <> 'closed')))
  );

-- Settlement helpers
CREATE OR REPLACE FUNCTION public.today_in_store(p_store UUID)
RETURNS DATE LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT (NOW() AT TIME ZONE COALESCE((SELECT timezone FROM stores WHERE id = p_store), 'Asia/Bangkok'))::date
$func$;

CREATE OR REPLACE FUNCTION public.attach_settlement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.settlement_id IS NULL AND NEW.store_id IS NOT NULL THEN
    SELECT id INTO NEW.settlement_id FROM daily_settlements
     WHERE store_id = NEW.store_id AND business_date = today_in_store(NEW.store_id)
       AND status IN ('open','reopened')
     LIMIT 1;
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS movements_attach_settlement ON movements;
CREATE TRIGGER movements_attach_settlement BEFORE INSERT ON movements
  FOR EACH ROW EXECUTE FUNCTION public.attach_settlement();

DROP TRIGGER IF EXISTS finance_attach_settlement ON finance_entries;
CREATE TRIGGER finance_attach_settlement BEFORE INSERT ON finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.attach_settlement();

-- Settlement RPCs (open_day, settle_day, reopen_settlement)
-- See supabase/migrations/009_daily_settlement.sql for the full bodies.

-- ====================================================
-- Customers (migration 013)
-- ====================================================
CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code       TEXT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  line_id    TEXT,
  address    TEXT,
  tax_id     TEXT,
  note       TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customers_store_idx      ON customers(store_id);
CREATE INDEX IF NOT EXISTS customers_store_name_idx ON customers(store_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_per_store
  ON customers(store_id, code) WHERE code IS NOT NULL AND code <> '';

DROP TRIGGER IF EXISTS customers_updated_at ON customers;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Wire movements.customer_id now that customers exists
ALTER TABLE movements
  DROP CONSTRAINT IF EXISTS movements_customer_id_fkey,
  ADD CONSTRAINT movements_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS movements_customer_idx ON movements(customer_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_select ON customers;
DROP POLICY IF EXISTS customers_insert ON customers;
DROP POLICY IF EXISTS customers_update ON customers;
DROP POLICY IF EXISTS customers_delete ON customers;
CREATE POLICY customers_select ON customers FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY customers_update ON customers FOR UPDATE
  USING      (is_super_admin() OR store_id = ANY(my_store_ids()))
  WITH CHECK (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY customers_delete ON customers FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- ====================================================
-- Purchase Orders (migration 014)
-- ====================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  po_number     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','partial','received','cancelled')),
  order_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  received_date DATE,
  total_amount  NUMERIC(12,2),
  note          TEXT,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, po_number)
);
CREATE INDEX IF NOT EXISTS purchase_orders_store_idx    ON purchase_orders(store_id, order_date DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx   ON purchase_orders(store_id, status);

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  plant_id      UUID REFERENCES plants(id) ON DELETE SET NULL,
  plant_name    TEXT NOT NULL,
  plant_sku     TEXT,
  qty_ordered   INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received  INTEGER NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_cost     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS po_lines_po_idx    ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS po_lines_plant_idx ON purchase_order_lines(plant_id);

ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_select ON purchase_orders;
DROP POLICY IF EXISTS po_insert ON purchase_orders;
DROP POLICY IF EXISTS po_update ON purchase_orders;
DROP POLICY IF EXISTS po_delete ON purchase_orders;
CREATE POLICY po_select ON purchase_orders FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY po_insert ON purchase_orders FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'receive'));
CREATE POLICY po_update ON purchase_orders FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'receive'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'receive'));
CREATE POLICY po_delete ON purchase_orders FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

DROP POLICY IF EXISTS po_lines_select ON purchase_order_lines;
DROP POLICY IF EXISTS po_lines_insert ON purchase_order_lines;
DROP POLICY IF EXISTS po_lines_update ON purchase_order_lines;
DROP POLICY IF EXISTS po_lines_delete ON purchase_order_lines;
CREATE POLICY po_lines_select ON purchase_order_lines FOR SELECT
  USING (is_super_admin()
         OR EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = po_id AND po.store_id = ANY(my_store_ids())));
CREATE POLICY po_lines_insert ON purchase_order_lines FOR INSERT
  WITH CHECK (is_super_admin()
              OR EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = po_id AND has_perm(po.store_id, 'receive')));
CREATE POLICY po_lines_update ON purchase_order_lines FOR UPDATE
  USING      (is_super_admin()
              OR EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = po_id AND has_perm(po.store_id, 'receive')))
  WITH CHECK (is_super_admin()
              OR EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = po_id AND has_perm(po.store_id, 'receive')));
CREATE POLICY po_lines_delete ON purchase_order_lines FOR DELETE
  USING (is_super_admin()
         OR EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = po_id AND is_store_admin(po.store_id)));

-- PO helper RPCs: next_po_number, receive_po_line.
-- See supabase/migrations/014_purchase_orders.sql for full bodies.

-- ====================================================
-- Audit log (migration 016)
-- ====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  store_id    UUID REFERENCES stores(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx   ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_store_idx   ON audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx  ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select ON audit_logs;
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (
    is_super_admin()
    OR (store_id IS NOT NULL AND is_store_admin(store_id))
  );
-- No INSERT/UPDATE/DELETE policies; writes go through SECURITY DEFINER
-- triggers + the log_audit helper below.

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action       TEXT,
  p_entity_type  TEXT,
  p_entity_id    UUID,
  p_store_id     UUID,
  p_metadata     JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email::text INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, store_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), v_email, p_store_id, p_action, p_entity_type, p_entity_id, p_metadata);
END $func$;

-- stores trigger — FK-safe on DELETE (store_id NULL'd so AFTER DELETE doesn't
-- violate audit_logs.store_id → stores(id) FK; entity_id keeps original id).
CREATE OR REPLACE FUNCTION public.audit_stores_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_action TEXT;
  v_meta   JSONB;
  v_id     UUID;
  v_store  UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'store.create';
    v_meta   := jsonb_build_object('after', to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'store.update';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'store.delete';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD));
    v_id     := OLD.id;
    v_store  := NULL;
  END IF;
  PERFORM log_audit(v_action, 'store', v_id, v_store, v_meta);
  RETURN COALESCE(NEW, OLD);
END $func$;

DROP TRIGGER IF EXISTS stores_audit ON stores;
CREATE TRIGGER stores_audit
  AFTER INSERT OR UPDATE OR DELETE ON stores
  FOR EACH ROW EXECUTE FUNCTION audit_stores_trigger();

-- store_members trigger — FK-safe when parent store is cascade-deleted.
CREATE OR REPLACE FUNCTION public.audit_store_members_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_action TEXT;
  v_meta   JSONB;
  v_id     UUID;
  v_store  UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'member.add';
    v_meta   := jsonb_build_object('after',  to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.store_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'member.update';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.store_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'member.remove';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD));
    v_id     := OLD.id;
    IF EXISTS (SELECT 1 FROM stores WHERE id = OLD.store_id) THEN
      v_store := OLD.store_id;
    ELSE
      v_store := NULL;
    END IF;
  END IF;
  PERFORM log_audit(v_action, 'store_member', v_id, v_store, v_meta);
  RETURN COALESCE(NEW, OLD);
END $func$;

DROP TRIGGER IF EXISTS store_members_audit ON store_members;
CREATE TRIGGER store_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON store_members
  FOR EACH ROW EXECUTE FUNCTION audit_store_members_trigger();

-- profiles trigger — log only on role change (super_admin ↔ member).
CREATE OR REPLACE FUNCTION public.audit_profile_role_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM log_audit(
      'profile.role_change',
      'profile',
      NEW.id,
      NULL,
      jsonb_build_object('before_role', OLD.role, 'after_role', NEW.role,
                          'name', NEW.name)
    );
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS profiles_role_audit ON profiles;
CREATE TRIGGER profiles_role_audit
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_profile_role_trigger();

-- ====================================================
-- Storage bucket: plant-images
-- ====================================================
-- Create bucket via Dashboard or:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('plant-images','plant-images', true);
