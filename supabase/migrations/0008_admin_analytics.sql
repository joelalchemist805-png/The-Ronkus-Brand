-- Administrator-only reporting with Lagos-local day boundaries.
-- Revenue includes only paid orders that have not been canceled.

CREATE FUNCTION public.admin_overview(p_from date, p_to date)
RETURNS TABLE (
  total_orders bigint,
  paid_orders bigint,
  subtotal_revenue_ngn bigint,
  delivery_fees_ngn bigint,
  discounts_ngn bigint,
  total_revenue_ngn bigint,
  average_order_value_ngn numeric,
  orders_by_status jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce((SELECT public.is_admin()), false) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'A valid reporting date range is required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH period_orders AS (
    SELECT order_row.*
    FROM public.orders AS order_row
    WHERE order_row.created_at >= (p_from::timestamp AT TIME ZONE 'Africa/Lagos')
      AND order_row.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
  ),
  status_counts AS (
    SELECT status_value.status,
           count(period_orders.id)::bigint AS order_count
    FROM unnest(enum_range(NULL::public.order_status)) AS status_value(status)
    LEFT JOIN period_orders ON period_orders.order_status = status_value.status
    GROUP BY status_value.status
  )
  SELECT
    count(period_orders.id)::bigint,
    count(period_orders.id) FILTER (
      WHERE period_orders.payment_status = 'paid'
        AND period_orders.order_status <> 'canceled'
    )::bigint,
    coalesce(sum(period_orders.subtotal_ngn) FILTER (
      WHERE period_orders.payment_status = 'paid'
        AND period_orders.order_status <> 'canceled'
    ), 0)::bigint,
    coalesce(sum(period_orders.delivery_fee_ngn) FILTER (
      WHERE period_orders.payment_status = 'paid'
        AND period_orders.order_status <> 'canceled'
    ), 0)::bigint,
    coalesce(sum(period_orders.discount_ngn) FILTER (
      WHERE period_orders.payment_status = 'paid'
        AND period_orders.order_status <> 'canceled'
    ), 0)::bigint,
    coalesce(sum(period_orders.total_ngn) FILTER (
      WHERE period_orders.payment_status = 'paid'
        AND period_orders.order_status <> 'canceled'
    ), 0)::bigint,
    avg(period_orders.total_ngn) FILTER (
      WHERE period_orders.payment_status = 'paid'
        AND period_orders.order_status <> 'canceled'
    ),
    (SELECT coalesce(
       jsonb_object_agg(status_counts.status::text, status_counts.order_count),
       '{}'::jsonb
     ) FROM status_counts)
  FROM period_orders;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_overview(date, date)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview(date, date)
TO authenticated;

CREATE FUNCTION public.admin_sales_by_day(p_from date, p_to date)
RETURNS TABLE (day date, order_count bigint, revenue_ngn bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce((SELECT public.is_admin()), false) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'A valid reporting date range is required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generated_day::date AS report_day
    FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') AS generated(generated_day)
  ),
  paid_sales AS (
    SELECT (order_row.created_at AT TIME ZONE 'Africa/Lagos')::date AS report_day,
           count(*)::bigint AS order_count,
           sum(order_row.total_ngn)::bigint AS revenue_ngn
    FROM public.orders AS order_row
    WHERE order_row.created_at >= (p_from::timestamp AT TIME ZONE 'Africa/Lagos')
      AND order_row.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
      AND order_row.payment_status = 'paid'
      AND order_row.order_status <> 'canceled'
    GROUP BY (order_row.created_at AT TIME ZONE 'Africa/Lagos')::date
  )
  SELECT days.report_day,
         coalesce(paid_sales.order_count, 0)::bigint,
         coalesce(paid_sales.revenue_ngn, 0)::bigint
  FROM days
  LEFT JOIN paid_sales ON paid_sales.report_day = days.report_day
  ORDER BY days.report_day;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sales_by_day(date, date)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_by_day(date, date)
TO authenticated;

CREATE FUNCTION public.admin_best_sellers(
  p_from date,
  p_to date,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (product_name text, units_sold bigint, revenue_ngn bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce((SELECT public.is_admin()), false) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'A valid date range and result limit are required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT item.product_name,
         sum(item.quantity)::bigint,
         sum(item.line_total_ngn)::bigint
  FROM public.order_items AS item
  JOIN public.orders AS order_row ON order_row.id = item.order_id
  WHERE order_row.created_at >= (p_from::timestamp AT TIME ZONE 'Africa/Lagos')
    AND order_row.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
    AND order_row.payment_status = 'paid'
    AND order_row.order_status <> 'canceled'
  GROUP BY item.product_name
  ORDER BY sum(item.quantity) DESC, sum(item.line_total_ngn) DESC, item.product_name
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_best_sellers(date, date, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_best_sellers(date, date, integer)
TO authenticated;

CREATE FUNCTION public.admin_category_performance(p_from date, p_to date)
RETURNS TABLE (category_name text, units_sold bigint, revenue_ngn bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT coalesce((SELECT public.is_admin()), false) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'A valid reporting date range is required.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT coalesce(category.name, 'Unknown')::text,
         sum(item.quantity)::bigint,
         sum(item.line_total_ngn)::bigint
  FROM public.order_items AS item
  JOIN public.orders AS order_row ON order_row.id = item.order_id
  LEFT JOIN public.products AS product ON product.id = item.product_id
  LEFT JOIN public.categories AS category ON category.id = product.category_id
  WHERE order_row.created_at >= (p_from::timestamp AT TIME ZONE 'Africa/Lagos')
    AND order_row.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Africa/Lagos')
    AND order_row.payment_status = 'paid'
    AND order_row.order_status <> 'canceled'
  GROUP BY coalesce(category.name, 'Unknown')
  ORDER BY sum(item.line_total_ngn) DESC, coalesce(category.name, 'Unknown');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_category_performance(date, date)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_category_performance(date, date)
TO authenticated;
