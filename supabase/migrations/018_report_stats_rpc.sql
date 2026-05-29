-- ====================================================
-- H3 (ROADMAP): ReportsPage was loading up to 50,000 movement rows
-- client-side just to compute a handful of aggregates. That burns
-- bandwidth, ties up memory on the user's device, and silently
-- truncates real numbers once a shop crosses the cap.
--
-- This migration moves the math to the database. report_stats()
-- returns a single JSON blob with everything the page needs to
-- render: stock-level summary, category breakdown, top-10 lists
-- (stock / value / customers). One round-trip, indexed scans,
-- no row caps.
--
-- Movement CSV export still needs raw rows — ReportsPage fetches
-- those lazily when the user clicks the export button.
-- ====================================================

DROP FUNCTION IF EXISTS public.report_stats(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.report_stats(
  p_store_id    UUID,
  p_range_days  INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_from       TIMESTAMPTZ;
  v_summary    JSONB;
  v_cat_rows   JSONB;
  v_top_stock  JSONB;
  v_top_value  JSONB;
  v_top_cust   JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR has_perm(p_store_id, 'view_reports')) THEN
    RAISE EXCEPTION 'Not permitted to view reports' USING ERRCODE = '42501';
  END IF;

  IF p_range_days IS NOT NULL AND p_range_days > 0 THEN
    v_from := date_trunc('day', NOW() - make_interval(days => p_range_days));
  END IF;

  -- Stock-level summary (plant snapshot, no time range)
  SELECT jsonb_build_object(
    'total',       COUNT(*),
    'outCount',    COUNT(*) FILTER (WHERE stock <= 0),
    'lowCount',    COUNT(*) FILTER (WHERE stock > 0 AND stock <= min_stock),
    'okCount',     COUNT(*) FILTER (WHERE stock > min_stock),
    'totalStock',  COALESCE(SUM(stock), 0),
    'totalValue',  COALESCE(SUM(stock * price), 0),
    'totalCost',   COALESCE(SUM(stock * COALESCE(cost, 0)), 0)
  )
  INTO v_summary
  FROM plants
  WHERE store_id = p_store_id;

  -- Movement count for the selected range (page sub-header)
  v_summary := v_summary || jsonb_build_object(
    'movesCount',
    (SELECT COUNT(*) FROM movements
      WHERE store_id = p_store_id
        AND (v_from IS NULL OR created_at >= v_from))
  );

  -- Category breakdown — name, count, stock, value
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY (c.value)::NUMERIC DESC), '[]'::jsonb)
  INTO v_cat_rows
  FROM (
    SELECT
      COALESCE(cat.name_th, 'ไม่มีหมวดหมู่') AS name,
      COUNT(p.id)                            AS count,
      COALESCE(SUM(p.stock), 0)              AS stock,
      COALESCE(SUM(p.stock * p.price), 0)    AS value
    FROM plants p
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE p.store_id = p_store_id
    GROUP BY COALESCE(cat.name_th, 'ไม่มีหมวดหมู่')
  ) c;

  -- Top 10 by stock
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_stock
  FROM (
    SELECT id, name, sku, stock, price
    FROM plants
    WHERE store_id = p_store_id
    ORDER BY stock DESC, name ASC
    LIMIT 10
  ) t;

  -- Top 10 by stock value
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_value
  FROM (
    SELECT id, name, sku, stock, price
    FROM plants
    WHERE store_id = p_store_id
    ORDER BY (stock * price) DESC, name ASC
    LIMIT 10
  ) t;

  -- Top 10 customers — sale movements (type='out') in the range
  -- "total" mirrors the client logic: qty × current plant price.
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY (t.total)::NUMERIC DESC), '[]'::jsonb)
  INTO v_top_cust
  FROM (
    SELECT
      cu.id,
      cu.name,
      cu.code,
      COUNT(m.id)::INTEGER                                   AS count,
      COALESCE(SUM(ABS(m.qty) * COALESCE(pl.price, 0)), 0)  AS total
    FROM movements m
    JOIN customers cu ON cu.id = m.customer_id
    LEFT JOIN plants pl ON pl.id = m.plant_id
    WHERE m.store_id = p_store_id
      AND m.type = 'out'
      AND m.customer_id IS NOT NULL
      AND (v_from IS NULL OR m.created_at >= v_from)
    GROUP BY cu.id, cu.name, cu.code
    ORDER BY total DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'summary',      v_summary,
    'catRows',      v_cat_rows,
    'topStock',     v_top_stock,
    'topValue',     v_top_value,
    'topCustomers', v_top_cust
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.report_stats(UUID, INTEGER) TO authenticated;
