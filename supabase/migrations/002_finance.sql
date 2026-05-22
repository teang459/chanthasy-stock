-- ====================================================
-- Finance entries: manual income/expense tracking
-- (Stock movements provide auto income/cost separately)
-- ====================================================

CREATE TABLE IF NOT EXISTS finance_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category   TEXT NOT NULL DEFAULT 'other',
  title      TEXT NOT NULL,
  amount     NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  note       TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finance_entries_owner_date_idx ON finance_entries(owner_id, date DESC);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_select ON finance_entries FOR SELECT USING (owner_id = effective_owner_id());
CREATE POLICY finance_insert ON finance_entries FOR INSERT WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY finance_update ON finance_entries FOR UPDATE USING (owner_id = effective_owner_id() AND can_write()) WITH CHECK (owner_id = effective_owner_id() AND can_write());
CREATE POLICY finance_delete ON finance_entries FOR DELETE USING (owner_id = effective_owner_id() AND can_delete());
CREATE POLICY finance_admin  ON finance_entries FOR ALL USING (is_admin()) WITH CHECK (is_admin());
