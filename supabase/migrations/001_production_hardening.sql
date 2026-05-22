-- ====================================================
-- C1: Per-owner UNIQUE indexes (replace global)
-- ====================================================
ALTER TABLE plants     DROP CONSTRAINT IF EXISTS plants_sku_key;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_code_key;
ALTER TABLE suppliers  DROP CONSTRAINT IF EXISTS suppliers_code_key;

DROP INDEX IF EXISTS plants_sku_per_owner;
DROP INDEX IF EXISTS categories_code_per_owner;
DROP INDEX IF EXISTS suppliers_code_per_owner;

CREATE UNIQUE INDEX plants_sku_per_owner       ON plants(owner_id, sku);
CREATE UNIQUE INDEX categories_code_per_owner  ON categories(owner_id, code);
CREATE UNIQUE INDEX suppliers_code_per_owner   ON suppliers(owner_id, code);

-- ====================================================
-- Movements: extend type CHECK to allow new/delete/rename
-- ====================================================
ALTER TABLE movements DROP CONSTRAINT IF EXISTS movements_type_check;
ALTER TABLE movements ADD CONSTRAINT movements_type_check
  CHECK (type IN ('in', 'out', 'adjust', 'new', 'delete', 'rename'));

-- ====================================================
-- H1: currency column for per-shop currency preference
-- ====================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'THB'
  CHECK (currency IN ('THB', 'LAK'));

-- ====================================================
-- C6: Role-based RLS helpers + policies
-- ====================================================
CREATE OR REPLACE FUNCTION public.effective_owner_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT COALESCE(manager_id, id) FROM profiles WHERE id = auth.uid()
$func$;

CREATE OR REPLACE FUNCTION public.can_write()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT (manager_id IS NULL OR role IN ('admin', 'staff'))
  FROM profiles WHERE id = auth.uid()
$func$;

CREATE OR REPLACE FUNCTION public.can_delete()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT (manager_id IS NULL OR role = 'admin')
  FROM profiles WHERE id = auth.uid()
$func$;

-- Drop ALL existing policies on data tables (keep admin_bypass)
DO $cleanup$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('plants', 'categories', 'suppliers', 'movements', 'calendar_events')
      AND policyname <> 'admin_bypass'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $cleanup$;

-- Plants
CREATE POLICY plants_select ON plants FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY plants_insert ON plants FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY plants_update ON plants FOR UPDATE USING (owner_id = effective_owner_id() AND can_write()) WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY plants_delete ON plants FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());

-- Categories
CREATE POLICY categories_select ON categories FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY categories_insert ON categories FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY categories_update ON categories FOR UPDATE USING (owner_id = effective_owner_id() AND can_write()) WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY categories_delete ON categories FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());

-- Suppliers
CREATE POLICY suppliers_select ON suppliers FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY suppliers_insert ON suppliers FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY suppliers_update ON suppliers FOR UPDATE USING (owner_id = effective_owner_id() AND can_write()) WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY suppliers_delete ON suppliers FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());

-- Movements (writeable for staff+admin, readable for all, no delete except admin)
CREATE POLICY movements_select ON movements FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY movements_insert ON movements FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY movements_update ON movements FOR UPDATE USING (owner_id = effective_owner_id() AND can_delete()) WITH CHECK (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY movements_delete ON movements FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());

-- Calendar
CREATE POLICY calendar_select ON calendar_events FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY calendar_insert ON calendar_events FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY calendar_update ON calendar_events FOR UPDATE USING (owner_id = effective_owner_id() AND can_write()) WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY calendar_delete ON calendar_events FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());

-- ====================================================
-- H10: get_all_shops_for_admin includes email and manager_id
-- ====================================================
DROP FUNCTION IF EXISTS get_all_shops_for_admin();
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
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
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
$func$;

GRANT EXECUTE ON FUNCTION get_all_shops_for_admin() TO authenticated;
