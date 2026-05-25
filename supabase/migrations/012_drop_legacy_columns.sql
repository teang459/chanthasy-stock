-- ====================================================
-- Multi-store rollout — final cleanup
--
-- Drops the owner_id columns on every data table, drops the legacy
-- bookkeeping fields on profiles (manager_id, shop_name, tax_id,
-- vat_rate, vat_inclusive, currency), and refreshes
-- get_all_shops_for_admin so it no longer selects the removed manager_id
-- column.
--
-- Cleanup-1 (commit 9e86ebb) already removed every JS site that wrote
-- owner_id and made finance_entries.owner_id nullable, so dropping the
-- columns here is safe.
-- ====================================================

-- 1. Drop owner_id from each data table
ALTER TABLE plants          DROP COLUMN IF EXISTS owner_id;
ALTER TABLE movements       DROP COLUMN IF EXISTS owner_id;
ALTER TABLE categories      DROP COLUMN IF EXISTS owner_id;
ALTER TABLE suppliers       DROP COLUMN IF EXISTS owner_id;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS owner_id;
ALTER TABLE finance_entries DROP COLUMN IF EXISTS owner_id;

-- The finance_entries (owner_id, date DESC) index hangs off owner_id,
-- so it goes with the column.

-- 2. Drop legacy profile fields (shop info now lives on stores)
ALTER TABLE profiles DROP COLUMN IF EXISTS manager_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS shop_name;
ALTER TABLE profiles DROP COLUMN IF EXISTS tax_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS vat_rate;
ALTER TABLE profiles DROP COLUMN IF EXISTS vat_inclusive;
ALTER TABLE profiles DROP COLUMN IF EXISTS currency;

-- 3. Refresh get_all_shops_for_admin — it still references manager_id
DROP FUNCTION IF EXISTS public.get_all_shops_for_admin();
CREATE OR REPLACE FUNCTION public.get_all_shops_for_admin()
RETURNS TABLE(
  id          UUID,
  name        TEXT,
  role        TEXT,
  plant_count BIGINT,
  updated_at  TIMESTAMPTZ,
  email       TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
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
$func$;
GRANT EXECUTE ON FUNCTION public.get_all_shops_for_admin() TO authenticated;
