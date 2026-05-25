-- ====================================================
-- C1 (REVIEW.md): adjust_stock RPC must enforce tenant + role.
--
-- Previous version (SECURITY DEFINER) bypassed RLS and only read
-- auth.uid(); a logged-in user could mutate another shop's stock
-- if they knew the plant_id. This migration enforces:
--   1. plant.owner_id matches the caller's effective_owner_id
--   2. caller has can_write() (admin/staff on the team, or shop owner)
-- ====================================================

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_plant_id UUID,
  p_type     TEXT,
  p_qty      INTEGER,
  p_note     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_plant      plants%ROWTYPE;
  v_owner      UUID;
  v_new_stock  INTEGER;
  v_qty_signed INTEGER;
BEGIN
  -- Resolve caller context (raises if not authenticated)
  v_owner := effective_owner_id();
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT can_write() THEN
    RAISE EXCEPTION 'Not permitted to write' USING ERRCODE = '42501';
  END IF;

  -- Fetch the plant AND enforce tenant match in one go.
  SELECT * INTO v_plant
  FROM plants
  WHERE id = p_plant_id
    AND owner_id = v_owner;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plant not found or not permitted' USING ERRCODE = '42501';
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
  ELSE
    RAISE EXCEPTION 'Invalid adjustment type' USING ERRCODE = '22023';
  END IF;

  UPDATE plants
     SET stock = v_new_stock,
         updated_at = NOW()
   WHERE id = p_plant_id;

  INSERT INTO movements (owner_id, plant_id, type, qty, note, created_by)
  VALUES (v_plant.owner_id, p_plant_id, p_type, v_qty_signed, p_note, auth.uid());
END;
$func$;

GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, TEXT, INTEGER, TEXT) TO authenticated;
