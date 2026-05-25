-- ====================================================
-- Cleanup: phantom movements created by the now-dropped
-- plants_log_movement trigger
--
-- For each duplicate pair (same plant_id + type + qty + created_at) the
-- row with payment_method IS NULL was the trigger's phantom; the row
-- with payment_method='cash' (or any non-NULL value) is the real one
-- written by adjust_stock. Delete the phantoms only.
--
-- This migration also recomputes the snapshot of any closed settlement
-- whose totals were inflated by the duplicates, leaving an audit line
-- in daily_settlements.note. Fresh deploys with no duplicates simply
-- noop through this file.
-- ====================================================

-- 1. Snapshot which settlements will be affected, so we can recompute
DO $cleanup$
DECLARE
  v_affected UUID[];
BEGIN
  WITH dup_groups AS (
    SELECT plant_id, type, qty, created_at,
           COUNT(*) AS gs,
           BOOL_OR(payment_method IS NULL) AS has_null_payment,
           BOOL_OR(payment_method IS NOT NULL) AS has_real_payment
    FROM movements
    GROUP BY plant_id, type, qty, created_at
    HAVING COUNT(*) > 1
  ),
  phantom_rows AS (
    SELECT m.id, m.settlement_id
    FROM movements m
    JOIN dup_groups g
      ON g.plant_id IS NOT DISTINCT FROM m.plant_id
     AND g.type        = m.type
     AND g.qty         = m.qty
     AND g.created_at  = m.created_at
    WHERE m.payment_method IS NULL
      AND g.has_null_payment
      AND g.has_real_payment   -- both NULL + non-NULL present in same group
  )
  SELECT COALESCE(array_agg(DISTINCT settlement_id) FILTER (WHERE settlement_id IS NOT NULL), ARRAY[]::UUID[])
    INTO v_affected
    FROM phantom_rows;

  -- 2. Delete the phantom rows
  DELETE FROM movements WHERE id IN (
    SELECT m.id
    FROM movements m
    JOIN (
      SELECT plant_id, type, qty, created_at
      FROM movements
      GROUP BY plant_id, type, qty, created_at
      HAVING COUNT(*) > 1
         AND BOOL_OR(payment_method IS NULL)
         AND BOOL_OR(payment_method IS NOT NULL)
    ) g
      ON g.plant_id IS NOT DISTINCT FROM m.plant_id
     AND g.type        = m.type
     AND g.qty         = m.qty
     AND g.created_at  = m.created_at
    WHERE m.payment_method IS NULL
  );

  -- 3. Recompute each affected (still-existing) settlement's snapshot
  IF v_affected <> ARRAY[]::UUID[] THEN
    DECLARE
      v_id            UUID;
      v_store         stores%ROWTYPE;
      v_opening       NUMERIC(12,2);
      v_closing       NUMERIC(12,2);
      v_sales         NUMERIC(12,2);
      v_cash_sales    NUMERIC(12,2);
      v_cost          NUMERIC(12,2);
      v_vat           NUMERIC(12,2);
      v_income        NUMERIC(12,2);
      v_expense       NUMERIC(12,2);
    BEGIN
      FOREACH v_id IN ARRAY v_affected LOOP
        SELECT s.* INTO v_store
          FROM stores s JOIN daily_settlements ds ON ds.store_id = s.id
         WHERE ds.id = v_id;

        SELECT opening_cash, closing_cash INTO v_opening, v_closing
          FROM daily_settlements WHERE id = v_id;

        SELECT
          COALESCE(SUM(ABS(mv.qty) * COALESCE(p.price, 0)), 0),
          COALESCE(SUM(ABS(mv.qty) * COALESCE(p.price, 0))
                   FILTER (WHERE COALESCE(mv.payment_method, 'cash') = 'cash'), 0),
          COALESCE(SUM(ABS(mv.qty) * COALESCE(p.cost, 0)),  0)
        INTO v_sales, v_cash_sales, v_cost
        FROM movements mv
        LEFT JOIN plants p ON p.id = mv.plant_id
        WHERE mv.settlement_id = v_id AND mv.type = 'out';

        SELECT
          COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0),
          COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)
        INTO v_income, v_expense
        FROM finance_entries WHERE settlement_id = v_id;

        v_vat := CASE
          WHEN v_store.vat_rate > 0 AND v_store.vat_inclusive
            THEN v_sales * v_store.vat_rate / (100 + v_store.vat_rate)
          WHEN v_store.vat_rate > 0
            THEN v_sales * v_store.vat_rate / 100
          ELSE 0
        END;

        UPDATE daily_settlements SET
          total_sales   = v_sales,
          total_cost    = v_cost,
          total_vat     = v_vat,
          total_income  = v_income,
          total_expense = v_expense,
          net_sales     = v_sales - v_cost + v_income - v_expense,
          expected_cash = v_opening + v_cash_sales + v_income - v_expense,
          difference    = COALESCE(v_closing, 0) - (v_opening + v_cash_sales + v_income - v_expense),
          note          = COALESCE(note, '')
                          || E'\n[recompute ' || to_char(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
                          || '] Snapshot recomputed after removing phantom trigger movements (migration 015)'
        WHERE id = v_id;
      END LOOP;
    END;
  END IF;
END $cleanup$;
