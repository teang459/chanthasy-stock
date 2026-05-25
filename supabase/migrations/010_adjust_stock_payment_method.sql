-- ====================================================
-- adjust_stock now records payment_method
--
-- Adds an optional p_payment parameter to the RPC so 'out' (sale)
-- movements can be classified as cash / transfer / credit / other.
-- The classification feeds the settle_day cash reconciliation.
-- ====================================================

DROP FUNCTION IF EXISTS public.adjust_stock(UUID, TEXT, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_plant_id UUID,
  p_type     TEXT,
  p_qty      INTEGER,
  p_note     TEXT,
  p_payment  TEXT DEFAULT NULL
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

  -- Only 'out' movements record a payment method; default to cash if caller omits one.
  IF p_type = 'out' THEN
    v_payment := COALESCE(NULLIF(TRIM(p_payment), ''), 'cash');
    IF v_payment NOT IN ('cash','transfer','credit','other') THEN
      RAISE EXCEPTION 'Invalid payment_method: %', v_payment USING ERRCODE = '22023';
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

  INSERT INTO movements (store_id, plant_id, type, qty, note, created_by, payment_method)
  VALUES (v_plant.store_id, p_plant_id, p_type, v_qty_signed, p_note, auth.uid(), v_payment);
END;
$adjust$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
