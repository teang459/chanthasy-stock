-- ====================================================
-- Allow store admins to update their own store's metadata
--
-- After Phase C the only writer of stores was the super_admin via the
-- stores_super_admin FOR ALL policy. Settings UI gives each store admin
-- a "store info" form (name/address/phone/tax_id/VAT/currency) so they
-- need UPDATE on their own row.
--
-- INSERT and DELETE on stores remain super_admin only.
-- ====================================================

DROP POLICY IF EXISTS stores_admin_update ON stores;
CREATE POLICY stores_admin_update ON stores FOR UPDATE
  USING      (is_store_admin(id))
  WITH CHECK (is_store_admin(id));

-- Relax legacy finance_entries.owner_id (the only legacy column still
-- declared NOT NULL after Phase C) so the frontend can drop its
-- owner_id dual-write before migration 012 removes the column entirely.
ALTER TABLE finance_entries ALTER COLUMN owner_id DROP NOT NULL;
