-- ====================================================
-- Multi-store rollout — Phase C cutover
--
-- Replaces the legacy owner_id RLS model with the new store_id /
-- store_members / has_perm model. After this migration:
--
-- * RLS on every data table uses store_id + has_perm()
-- * adjust_stock, log_plant_event, log_stock_movement, and
--   get_all_shops_for_admin all use store_id and is_super_admin/has_perm
-- * profiles.role is restricted to ('super_admin','member')
-- * Legacy helpers effective_owner_id / can_write / can_delete / is_admin
--   are dropped
-- * store_id is NOT NULL on every data table
-- * UNIQUE constraints (plants.sku, categories.code, suppliers.code) are
--   now per-store instead of per-owner
--
-- What is intentionally NOT done here:
-- * Dropping owner_id and manager_id columns. The frontend still writes
--   owner_id on inserts (dual-write) and that won't be removed until the
--   new model has been live for at least one deploy cycle. A follow-up
--   migration 010 will drop those columns once dual-write is gone.
-- ====================================================

-- ============================================
-- 1. Update triggers to use store_id (no longer owner_id)
-- ============================================

CREATE OR REPLACE FUNCTION public.log_plant_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $logplant$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO movements (plant_id, type, qty, note, created_by, store_id)
    VALUES (NEW.id, 'new', NEW.stock, NEW.name, auth.uid(), NEW.store_id);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Skip the log row when the store itself is being cascade-deleted
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
    VALUES (
      NEW.id,
      v_type,
      v_delta,
      v_note,
      auth.uid(),
      NEW.store_id
    );
  END IF;
  RETURN NEW;
END;
$logmove$;

-- ============================================
-- 2. adjust_stock RPC — gate by has_perm based on type, write store_id
-- ============================================
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

  UPDATE plants
     SET stock = v_new_stock,
         updated_at = NOW()
   WHERE id = p_plant_id;

  INSERT INTO movements (store_id, plant_id, type, qty, note, created_by)
  VALUES (v_plant.store_id, p_plant_id, p_type, v_qty_signed, p_note, auth.uid());
END;
$adjust$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;

-- ============================================
-- 3. get_all_shops_for_admin — use is_super_admin (drop is_admin call)
-- ============================================
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

-- ============================================
-- 4. Migrate profiles.role enum
-- ============================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
UPDATE profiles SET role = 'super_admin' WHERE role = 'admin' AND manager_id IS NULL;
UPDATE profiles SET role = 'member'      WHERE role NOT IN ('super_admin');
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin','member'));

-- ============================================
-- 5. NOT NULL on store_id (verified zero NULLs before this migration)
-- ============================================
ALTER TABLE plants          ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE movements       ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE categories      ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE suppliers       ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE calendar_events ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE finance_entries ALTER COLUMN store_id SET NOT NULL;

-- ============================================
-- 6. UNIQUE indexes: per-owner → per-store
-- ============================================
DROP INDEX IF EXISTS plants_sku_per_owner;
DROP INDEX IF EXISTS categories_code_per_owner;
DROP INDEX IF EXISTS suppliers_code_per_owner;

CREATE UNIQUE INDEX IF NOT EXISTS plants_sku_per_store      ON plants(store_id, sku);
CREATE UNIQUE INDEX IF NOT EXISTS categories_code_per_store ON categories(store_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_code_per_store  ON suppliers(store_id, code);

-- ============================================
-- 7. New RLS policies on data tables (drop old + create new)
-- ============================================

-- Plants
DROP POLICY IF EXISTS plants_select ON plants;
DROP POLICY IF EXISTS plants_insert ON plants;
DROP POLICY IF EXISTS plants_update ON plants;
DROP POLICY IF EXISTS plants_delete ON plants;
DROP POLICY IF EXISTS plants_admin  ON plants;
DROP POLICY IF EXISTS admin_bypass  ON plants;
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
DROP POLICY IF EXISTS categories_admin  ON categories;
DROP POLICY IF EXISTS admin_bypass      ON categories;
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
DROP POLICY IF EXISTS suppliers_admin  ON suppliers;
DROP POLICY IF EXISTS admin_bypass     ON suppliers;
CREATE POLICY suppliers_select ON suppliers FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY suppliers_insert ON suppliers FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'));
CREATE POLICY suppliers_update ON suppliers FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'manage_plants'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'manage_plants'));
CREATE POLICY suppliers_delete ON suppliers FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Movements (per-type WITH CHECK for inserts; only store_admin can edit/delete history)
DROP POLICY IF EXISTS movements_select ON movements;
DROP POLICY IF EXISTS movements_insert ON movements;
DROP POLICY IF EXISTS movements_update ON movements;
DROP POLICY IF EXISTS movements_delete ON movements;
DROP POLICY IF EXISTS movements_admin  ON movements;
DROP POLICY IF EXISTS admin_bypass     ON movements;
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
DROP POLICY IF EXISTS calendar_admin  ON calendar_events;
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
DROP POLICY IF EXISTS finance_admin  ON finance_entries;
CREATE POLICY finance_select ON finance_entries FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY finance_insert ON finance_entries FOR INSERT
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'finance'));
CREATE POLICY finance_update ON finance_entries FOR UPDATE
  USING      (is_super_admin() OR has_perm(store_id, 'finance'))
  WITH CHECK (is_super_admin() OR has_perm(store_id, 'finance'));
CREATE POLICY finance_delete ON finance_entries FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- Profiles: replace the admin_bypass policy that referenced is_admin()
DROP POLICY IF EXISTS admin_bypass     ON profiles;
DROP POLICY IF EXISTS profiles_admin   ON profiles;
CREATE POLICY profiles_admin ON profiles FOR ALL
  USING      (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================
-- 8. Drop legacy helpers (no policies or functions reference them anymore)
-- ============================================
DROP FUNCTION IF EXISTS public.effective_owner_id();
DROP FUNCTION IF EXISTS public.can_write();
DROP FUNCTION IF EXISTS public.can_delete();
DROP FUNCTION IF EXISTS public.is_admin();
