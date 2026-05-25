-- ====================================================
-- B7 — Purchase Order workflow
--
-- Plus an incidental fix: drop the plants_log_movement trigger because
-- it was double-logging every adjust_stock call. The trigger originally
-- swallowed errors when owner_id was NULL (pre-Phase C); after Phase C
-- backfilled store_id NOT NULL the trigger's INSERT started succeeding,
-- creating a phantom partner movement for every legitimate adjust.
-- adjust_stock already INSERTs its own movement, so the trigger is
-- pure duplication.
-- ====================================================

-- 1. Drop the duplicating trigger + function
DROP TRIGGER IF EXISTS plants_log_movement ON plants;
DROP FUNCTION IF EXISTS public.log_stock_movement();

-- 2. Purchase orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  po_number       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','submitted','partial','received','cancelled')),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  received_date   DATE,
  total_amount    NUMERIC(12,2),
  note            TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, po_number)
);
CREATE INDEX IF NOT EXISTS purchase_orders_store_idx    ON purchase_orders(store_id, order_date DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx   ON purchase_orders(store_id, status);

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  plant_id        UUID REFERENCES plants(id) ON DELETE SET NULL,
  plant_name      TEXT NOT NULL,             -- snapshot in case plant is deleted
  plant_sku       TEXT,                       -- snapshot
  qty_ordered     INTEGER NOT NULL CHECK (qty_ordered > 0),
  qty_received    INTEGER NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_cost       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS po_lines_po_idx    ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS po_lines_plant_idx ON purchase_order_lines(plant_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- Anyone in the store can SELECT a PO. INSERT/UPDATE needs perm_receive
-- (the same people who can receive stock can create / edit POs). DELETE
-- and CANCEL are store_admin only.
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

-- Lines piggy-back on the parent PO's store via a subquery.
DROP POLICY IF EXISTS po_lines_select ON purchase_order_lines;
DROP POLICY IF EXISTS po_lines_insert ON purchase_order_lines;
DROP POLICY IF EXISTS po_lines_update ON purchase_order_lines;
DROP POLICY IF EXISTS po_lines_delete ON purchase_order_lines;

CREATE POLICY po_lines_select ON purchase_order_lines FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM purchase_orders po
                WHERE po.id = po_id AND po.store_id = ANY(my_store_ids()))
  );
CREATE POLICY po_lines_insert ON purchase_order_lines FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM purchase_orders po
                WHERE po.id = po_id AND has_perm(po.store_id, 'receive'))
  );
CREATE POLICY po_lines_update ON purchase_order_lines FOR UPDATE
  USING (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM purchase_orders po
                WHERE po.id = po_id AND has_perm(po.store_id, 'receive'))
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM purchase_orders po
                WHERE po.id = po_id AND has_perm(po.store_id, 'receive'))
  );
CREATE POLICY po_lines_delete ON purchase_order_lines FOR DELETE
  USING (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM purchase_orders po
                WHERE po.id = po_id AND is_store_admin(po.store_id))
  );

-- ============================================
-- Helpers
-- ============================================

-- Next PO number for a store: PO-YYYY-### per calendar year.
CREATE OR REPLACE FUNCTION public.next_po_number(p_store UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_year  TEXT := to_char((NOW() AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY');
  v_count INTEGER;
BEGIN
  IF NOT (is_super_admin() OR has_perm(p_store, 'receive')) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT COUNT(*) INTO v_count FROM purchase_orders
   WHERE store_id = p_store AND po_number LIKE 'PO-' || v_year || '-%';
  RETURN 'PO-' || v_year || '-' || LPAD((v_count + 1)::text, 3, '0');
END $func$;
GRANT EXECUTE ON FUNCTION public.next_po_number(UUID) TO authenticated;

-- Receive (or partially receive) a PO line. Inserts a movement.type='in'
-- with a back-reference to the PO in the note column, increments the
-- plant's stock, then updates line.qty_received and rolls the PO
-- header's status forward.
CREATE OR REPLACE FUNCTION public.receive_po_line(
  p_line_id UUID,
  p_qty     INTEGER,
  p_note    TEXT DEFAULT NULL
)
RETURNS purchase_order_lines
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_line  purchase_order_lines%ROWTYPE;
  v_po    purchase_orders%ROWTYPE;
  v_plant plants%ROWTYPE;
  v_new   INTEGER;
  v_remaining INTEGER;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'qty must be > 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_line FROM purchase_order_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO line not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_line.po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO not found' USING ERRCODE = 'P0002'; END IF;

  IF NOT (is_super_admin() OR has_perm(v_po.store_id, 'receive')) THEN
    RAISE EXCEPTION 'Not permitted to receive' USING ERRCODE = '42501';
  END IF;

  IF v_po.status NOT IN ('submitted','partial') THEN
    RAISE EXCEPTION 'PO % is not receivable (status=%)', v_po.po_number, v_po.status USING ERRCODE = '22023';
  END IF;

  v_new := v_line.qty_received + p_qty;
  IF v_new > v_line.qty_ordered THEN
    RAISE EXCEPTION 'รับเข้า % เกินกว่าสั่ง %', v_new, v_line.qty_ordered USING ERRCODE = '22023';
  END IF;

  -- Increment plant stock + log a single 'in' movement
  IF v_line.plant_id IS NOT NULL THEN
    SELECT * INTO v_plant FROM plants WHERE id = v_line.plant_id;
    IF FOUND THEN
      UPDATE plants SET stock = stock + p_qty, updated_at = NOW() WHERE id = v_line.plant_id;
      INSERT INTO movements (store_id, plant_id, type, qty, note, created_by)
      VALUES (
        v_po.store_id, v_line.plant_id, 'in', p_qty,
        'รับเข้าจาก ' || v_po.po_number || COALESCE(' • ' || p_note, ''),
        auth.uid()
      );
    END IF;
  END IF;

  -- Update line
  UPDATE purchase_order_lines SET qty_received = v_new WHERE id = p_line_id
   RETURNING * INTO v_line;

  -- Roll up header status
  SELECT COUNT(*) INTO v_remaining FROM purchase_order_lines
    WHERE po_id = v_po.id AND qty_received < qty_ordered;

  IF v_remaining = 0 THEN
    UPDATE purchase_orders SET status = 'received', received_date = CURRENT_DATE
     WHERE id = v_po.id;
  ELSE
    UPDATE purchase_orders SET status = 'partial' WHERE id = v_po.id;
  END IF;

  RETURN v_line;
END $func$;
GRANT EXECUTE ON FUNCTION public.receive_po_line(UUID, INTEGER, TEXT) TO authenticated;

-- ============================================
-- Update is_super_admin to drop the legacy compat branch (manager_id
-- was dropped in migration 012, so the OR clause currently fails).
-- ============================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $func$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
$func$;
