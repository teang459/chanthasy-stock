-- ====================================================
-- B4 — Customer database
--
-- Per-store customer rows that 'out' movements can be linked to. Lets the
-- system answer: who bought what, how much have they spent, reorder
-- reminders, top customers report. Customer info also lands on the
-- invoice (name, address, tax_id) when present.
-- ====================================================

CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code        TEXT,                                 -- optional short code (CUS001)
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  line_id     TEXT,
  address     TEXT,
  tax_id      TEXT,                                 -- for B2B / ใบกำกับภาษีเต็มรูป
  note        TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_store_idx     ON customers(store_id);
CREATE INDEX IF NOT EXISTS customers_store_name_idx ON customers(store_id, name);
-- Optional: enforce per-store unique code when code is provided
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_per_store
  ON customers(store_id, code) WHERE code IS NOT NULL AND code <> '';

DROP TRIGGER IF EXISTS customers_updated_at ON customers;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Link 'out' movements to a customer (nullable — walk-in sales OK)
ALTER TABLE movements
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS movements_customer_idx ON movements(customer_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select ON customers;
DROP POLICY IF EXISTS customers_insert ON customers;
DROP POLICY IF EXISTS customers_update ON customers;
DROP POLICY IF EXISTS customers_delete ON customers;

-- Any member of the store can read/write customer rows; only store_admin
-- can delete (customers carry purchase history references)
CREATE POLICY customers_select ON customers FOR SELECT
  USING (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY customers_update ON customers FOR UPDATE
  USING      (is_super_admin() OR store_id = ANY(my_store_ids()))
  WITH CHECK (is_super_admin() OR store_id = ANY(my_store_ids()));
CREATE POLICY customers_delete ON customers FOR DELETE
  USING (is_super_admin() OR is_store_admin(store_id));

-- ============================================
-- adjust_stock — accept optional p_customer for 'out' movements
-- ============================================
DROP FUNCTION IF EXISTS public.adjust_stock(UUID, TEXT, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_plant_id UUID,
  p_type     TEXT,
  p_qty      INTEGER,
  p_note     TEXT,
  p_payment  TEXT DEFAULT NULL,
  p_customer UUID DEFAULT NULL
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
  v_payment    TEXT;
  v_customer   UUID := NULL;
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

  -- Validate payment / customer for 'out'
  IF p_type = 'out' THEN
    v_payment := COALESCE(NULLIF(TRIM(p_payment), ''), 'cash');
    IF v_payment NOT IN ('cash','transfer','credit','other') THEN
      RAISE EXCEPTION 'Invalid payment_method: %', v_payment USING ERRCODE = '22023';
    END IF;
    IF p_customer IS NOT NULL THEN
      PERFORM 1 FROM customers WHERE id = p_customer AND store_id = v_plant.store_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found in this store' USING ERRCODE = '42501';
      END IF;
      v_customer := p_customer;
    END IF;
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

  UPDATE plants SET stock = v_new_stock, updated_at = NOW() WHERE id = p_plant_id;

  INSERT INTO movements (store_id, plant_id, type, qty, note, created_by, payment_method, customer_id)
  VALUES (v_plant.store_id, p_plant_id, p_type, v_qty_signed, p_note, auth.uid(), v_payment, v_customer);
END;
$adjust$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, INTEGER, TEXT, TEXT, UUID) TO authenticated;
