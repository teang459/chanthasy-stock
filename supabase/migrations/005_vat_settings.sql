-- ====================================================
-- B2 (REVIEW.md): VAT / Tax Invoice support
--
-- Adds three optional columns to profiles so each shop can issue
-- proper Thai tax invoices:
--   tax_id        — เลขผู้เสียภาษี (13 digits TH, free text for other markets)
--   vat_rate      — VAT %, default 0 = no VAT (existing shops unaffected)
--   vat_inclusive — true (retail; prices in plants.price include VAT)
--                   false (B2B; VAT added on top of plants.price)
--
-- All three are nullable / have safe defaults — no data migration needed.
-- Self / admin RLS policies already allow updating any column on profiles,
-- so no policy changes are required.
-- ====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tax_id        TEXT,
  ADD COLUMN IF NOT EXISTS vat_rate      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN      NOT NULL DEFAULT true;
