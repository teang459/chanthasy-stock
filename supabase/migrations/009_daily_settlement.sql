-- ====================================================
-- Multi-store rollout — Phase E: Daily Settlement
--
-- Adds the daily settlement (ปิดยอด) workflow on top of the now-cutover
-- store_id RBAC model. A settlement row represents one business day for
-- one store; staff with perm_settle open and close it; closed rows lock
-- the movement/finance entries that were attached during the open window.
--
-- Q5 decision: business_date is computed in Asia/Bangkok time-zone for
-- v1 (both THB and LAK shops are UTC+7); stores.timezone column is
-- reserved for future per-store overrides.
-- ====================================================

-- ============================================
-- 1. daily_settlements table
-- ============================================
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

  -- Snapshots written at close time
  total_sales    NUMERIC(12,2),   -- sum of (qty * price) for 'out' movements
  total_vat      NUMERIC(12,2),   -- VAT portion of total_sales (per store.vat_rate)
  total_cost     NUMERIC(12,2),   -- sum of (qty * cost) for 'out'
  total_income   NUMERIC(12,2),   -- finance_entries.income
  total_expense  NUMERIC(12,2),   -- finance_entries.expense
  net_sales      NUMERIC(12,2),   -- sales - cost + income - expense
  expected_cash  NUMERIC(12,2),   -- opening + cash-sales + income - expense
  difference     NUMERIC(12,2),   -- closing - expected (can be negative)

  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','reopened')),

  UNIQUE(store_id, business_date)
);

CREATE INDEX IF NOT EXISTS daily_settlements_store_date_idx
  ON daily_settlements(store_id, business_date DESC);
CREATE INDEX IF NOT EXISTS daily_settlements_status_idx
  ON daily_settlements(store_id, status);

-- ============================================
-- 2. settlement_id link columns on movements + finance_entries
-- ============================================
ALTER TABLE movements
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES daily_settlements(id) ON DELETE SET NULL;
ALTER TABLE finance_entries
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES daily_settlements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movements_settlement_idx       ON movements(settlement_id);
CREATE INDEX IF NOT EXISTS finance_entries_settlement_idx ON finance_entries(settlement_id);

-- ============================================
-- 3. Helper: today_in_store — DATE in the store's timezone (defaults to Asia/Bangkok)
-- ============================================
CREATE OR REPLACE FUNCTION public.today_in_store(p_store UUID)
RETURNS DATE LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT (NOW() AT TIME ZONE COALESCE(
            (SELECT timezone FROM stores WHERE id = p_store),
            'Asia/Bangkok'
          ))::date
$func$;

-- ============================================
-- 4. attach_settlement trigger — link new movements/finance to the open day
-- ============================================
CREATE OR REPLACE FUNCTION public.attach_settlement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.settlement_id IS NULL AND NEW.store_id IS NOT NULL THEN
    SELECT id INTO NEW.settlement_id
    FROM daily_settlements
    WHERE store_id = NEW.store_id
      AND business_date = today_in_store(NEW.store_id)
      AND status IN ('open','reopened')
    LIMIT 1;
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS movements_attach_settlement ON movements;
CREATE TRIGGER movements_attach_settlement
  BEFORE INSERT ON movements
  FOR EACH ROW EXECUTE FUNCTION attach_settlement();

DROP TRIGGER IF EXISTS finance_attach_settlement ON finance_entries;
CREATE TRIGGER finance_attach_settlement
  BEFORE INSERT ON finance_entries
  FOR EACH ROW EXECUTE FUNCTION attach_settlement();

-- ============================================
-- 5. RPC open_day — idempotent open for today
-- ============================================
CREATE OR REPLACE FUNCTION public.open_day(p_store UUID, p_opening NUMERIC DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_id   UUID;
  v_date DATE;
BEGIN
  IF NOT has_perm(p_store, 'settle') THEN
    RAISE EXCEPTION 'Not permitted to settle' USING ERRCODE = '42501';
  END IF;
  IF p_opening < 0 THEN
    RAISE EXCEPTION 'opening_cash must be >= 0' USING ERRCODE = '22023';
  END IF;

  v_date := today_in_store(p_store);

  INSERT INTO daily_settlements (store_id, business_date, opened_by, opening_cash, status)
  VALUES (p_store, v_date, auth.uid(), p_opening, 'open')
  ON CONFLICT (store_id, business_date) DO UPDATE
    SET opening_cash = CASE
          WHEN daily_settlements.status = 'closed'
          THEN daily_settlements.opening_cash         -- never overwrite a closed day
          ELSE EXCLUDED.opening_cash
        END
  RETURNING id INTO v_id;

  RETURN v_id;
END $func$;

GRANT EXECUTE ON FUNCTION public.open_day(UUID, NUMERIC) TO authenticated;

-- ============================================
-- 6. RPC settle_day — compute snapshots and lock the day
-- ============================================
CREATE OR REPLACE FUNCTION public.settle_day(
  p_store    UUID,
  p_date     DATE,
  p_closing  NUMERIC,
  p_note     TEXT DEFAULT NULL
)
RETURNS daily_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_row           daily_settlements%ROWTYPE;
  v_store         stores%ROWTYPE;
  v_sales         NUMERIC(12,2) := 0;
  v_cash_sales    NUMERIC(12,2) := 0;
  v_cost          NUMERIC(12,2) := 0;
  v_vat           NUMERIC(12,2) := 0;
  v_income        NUMERIC(12,2) := 0;
  v_expense       NUMERIC(12,2) := 0;
BEGIN
  IF NOT has_perm(p_store, 'settle') THEN
    RAISE EXCEPTION 'Not permitted to settle' USING ERRCODE = '42501';
  END IF;
  IF p_closing IS NULL OR p_closing < 0 THEN
    RAISE EXCEPTION 'closing_cash must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_store FROM stores WHERE id = p_store;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM daily_settlements
   WHERE store_id = p_store AND business_date = p_date
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No settlement open for %', p_date USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'closed' THEN
    RAISE EXCEPTION 'Settlement already closed' USING ERRCODE = '22023';
  END IF;

  -- Aggregate sales / cost from 'out' movements linked to this settlement
  SELECT
    COALESCE(SUM(ABS(mv.qty) * COALESCE(p.price, 0)), 0),
    COALESCE(SUM(ABS(mv.qty) * COALESCE(p.price, 0))
             FILTER (WHERE COALESCE(mv.payment_method, 'cash') = 'cash'), 0),
    COALESCE(SUM(ABS(mv.qty) * COALESCE(p.cost, 0)),  0)
  INTO v_sales, v_cash_sales, v_cost
  FROM movements mv
  LEFT JOIN plants p ON p.id = mv.plant_id
  WHERE mv.settlement_id = v_row.id AND mv.type = 'out';

  -- VAT portion (per store snapshot at close time)
  IF v_store.vat_rate > 0 THEN
    IF v_store.vat_inclusive THEN
      v_vat := v_sales * v_store.vat_rate / (100 + v_store.vat_rate);
    ELSE
      v_vat := v_sales * v_store.vat_rate / 100;
    END IF;
  END IF;

  -- Income / expense from manual finance entries
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)
  INTO v_income, v_expense
  FROM finance_entries
  WHERE settlement_id = v_row.id;

  UPDATE daily_settlements SET
    closed_at     = NOW(),
    closed_by     = auth.uid(),
    closing_cash  = p_closing,
    total_sales   = v_sales,
    total_vat     = v_vat,
    total_cost    = v_cost,
    total_income  = v_income,
    total_expense = v_expense,
    net_sales     = v_sales - v_cost + v_income - v_expense,
    expected_cash = v_row.opening_cash + v_cash_sales + v_income - v_expense,
    difference    = p_closing - (v_row.opening_cash + v_cash_sales + v_income - v_expense),
    note          = COALESCE(p_note, v_row.note),
    status        = 'closed'
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END $func$;

GRANT EXECUTE ON FUNCTION public.settle_day(UUID, DATE, NUMERIC, TEXT) TO authenticated;

-- ============================================
-- 7. RPC reopen_settlement — super admin only, appends an audit line
-- ============================================
CREATE OR REPLACE FUNCTION public.reopen_settlement(p_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden — super admin only' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE daily_settlements
     SET status = 'reopened',
         note   = COALESCE(note, '')
                  || E'\n[reopen ' || to_char(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
                  || ' by ' || COALESCE(auth.uid()::text, 'unknown') || '] ' || p_reason
   WHERE id = p_id;
END $func$;

GRANT EXECUTE ON FUNCTION public.reopen_settlement(UUID, TEXT) TO authenticated;

-- ============================================
-- 8. RLS on daily_settlements
-- ============================================
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

-- ============================================
-- 9. Lock movements / finance once their settlement is closed
-- ============================================
-- Super admin always bypasses; everyone else can only modify rows whose
-- settlement_id is NULL, open, or reopened. 'closed' rows are read-only.

DROP POLICY IF EXISTS movements_update ON movements;
CREATE POLICY movements_update ON movements FOR UPDATE
  USING (
    is_super_admin()
    OR (
      is_store_admin(store_id)
      AND (
        settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM daily_settlements
                    WHERE id = movements.settlement_id AND status <> 'closed')
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      is_store_admin(store_id)
      AND (
        settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM daily_settlements
                    WHERE id = movements.settlement_id AND status <> 'closed')
      )
    )
  );

DROP POLICY IF EXISTS movements_delete ON movements;
CREATE POLICY movements_delete ON movements FOR DELETE
  USING (
    is_super_admin()
    OR (
      is_store_admin(store_id)
      AND (
        settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM daily_settlements
                    WHERE id = movements.settlement_id AND status <> 'closed')
      )
    )
  );

DROP POLICY IF EXISTS finance_update ON finance_entries;
CREATE POLICY finance_update ON finance_entries FOR UPDATE
  USING (
    is_super_admin()
    OR (
      has_perm(store_id, 'finance')
      AND (
        settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM daily_settlements
                    WHERE id = finance_entries.settlement_id AND status <> 'closed')
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      has_perm(store_id, 'finance')
      AND (
        settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM daily_settlements
                    WHERE id = finance_entries.settlement_id AND status <> 'closed')
      )
    )
  );

DROP POLICY IF EXISTS finance_delete ON finance_entries;
CREATE POLICY finance_delete ON finance_entries FOR DELETE
  USING (
    is_super_admin()
    OR (
      is_store_admin(store_id)
      AND (
        settlement_id IS NULL
        OR EXISTS (SELECT 1 FROM daily_settlements
                    WHERE id = finance_entries.settlement_id AND status <> 'closed')
      )
    )
  );
