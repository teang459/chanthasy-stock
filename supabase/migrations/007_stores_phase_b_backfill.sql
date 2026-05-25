-- ====================================================
-- Multi-store rollout — Phase B (data backfill)
--
-- Populates the Phase A scaffolding from the existing owner_id model:
--   1. One stores row per current "owner" (profiles.manager_id IS NULL),
--      reusing profile.id as store.id for a clean 1:1 mapping so invoice
--      numbers and any FK that points at owner_id keep their identity.
--   2. store_id on the six data tables filled from owner_id.
--   3. store_members rows: owners → store_admin (full perms); existing
--      team staff/viewer → store_members.staff or viewer with permissions
--      that mirror what they could already do under the legacy model.
--
-- Every step is idempotent (ON CONFLICT DO NOTHING / WHERE IS NULL) so
-- this migration can be re-run safely if Phase A is applied to a fresh
-- project later. RLS on data tables is unchanged — old owner_id policies
-- still drive access. Phase C (migration 008) flips the policies over.
-- ====================================================

-- ============================================
-- B1. stores: one row per existing owner
-- ============================================
-- Use the profile.id as store.id (1:1) so downstream backfills become
-- trivial column copies and invoice numbering stays stable.
-- code = STR001, STR002, ... assigned by updated_at order for determinism.

WITH owner_seq AS (
  SELECT
    p.id,
    p.shop_name,
    p.name,
    p.tax_id,
    p.vat_rate,
    p.vat_inclusive,
    p.currency,
    ROW_NUMBER() OVER (ORDER BY p.updated_at NULLS LAST, p.id) AS rn
  FROM profiles p
  WHERE p.manager_id IS NULL
)
INSERT INTO stores (
  id, code, name,
  tax_id, vat_rate, vat_inclusive, currency,
  created_by
)
SELECT
  o.id,
  'STR' || LPAD(o.rn::text, 3, '0'),
  COALESCE(NULLIF(TRIM(o.shop_name), ''), NULLIF(TRIM(o.name), ''), 'Store ' || o.rn),
  o.tax_id, o.vat_rate, o.vat_inclusive, o.currency,
  o.id
FROM owner_seq o
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- B2. store_id on data tables (= owner_id thanks to 1:1)
-- ============================================
UPDATE plants          SET store_id = owner_id WHERE store_id IS NULL;
UPDATE movements       SET store_id = owner_id WHERE store_id IS NULL;
UPDATE categories      SET store_id = owner_id WHERE store_id IS NULL;
UPDATE suppliers       SET store_id = owner_id WHERE store_id IS NULL;
UPDATE calendar_events SET store_id = owner_id WHERE store_id IS NULL;
UPDATE finance_entries SET store_id = owner_id WHERE store_id IS NULL;

-- ============================================
-- B3a. Owners → store_admin of their own store (full perms)
-- ============================================
INSERT INTO store_members (
  store_id, user_id, role,
  perm_sell, perm_receive, perm_adjust, perm_manage_plants,
  perm_view_reports, perm_finance, perm_settle
)
SELECT
  p.id, p.id, 'store_admin',
  true, true, true, true, true, true, true
FROM profiles p
WHERE p.manager_id IS NULL
ON CONFLICT (store_id, user_id) DO NOTHING;

-- ============================================
-- B3b. Existing team members (manager_id IS NOT NULL)
-- ============================================
-- Mapping from legacy profiles.role to the new model:
--   admin  → store_admin, all perms true
--   staff  → staff, sell + receive + view_reports
--   viewer → viewer, no perms (default false for everything except sell/receive
--            which we explicitly null below)
INSERT INTO store_members (
  store_id, user_id, role,
  perm_sell, perm_receive, perm_adjust, perm_manage_plants,
  perm_view_reports, perm_finance, perm_settle
)
SELECT
  p.manager_id, p.id,
  CASE
    WHEN p.role = 'admin'  THEN 'store_admin'
    WHEN p.role = 'viewer' THEN 'viewer'
    ELSE 'staff'
  END,
  -- perm_sell
  (p.role IN ('admin', 'staff')),
  -- perm_receive
  (p.role IN ('admin', 'staff')),
  -- perm_adjust
  (p.role = 'admin'),
  -- perm_manage_plants
  (p.role = 'admin'),
  -- perm_view_reports
  (p.role IN ('admin', 'staff')),
  -- perm_finance
  (p.role = 'admin'),
  -- perm_settle
  (p.role = 'admin')
FROM profiles p
WHERE p.manager_id IS NOT NULL
ON CONFLICT (store_id, user_id) DO NOTHING;
