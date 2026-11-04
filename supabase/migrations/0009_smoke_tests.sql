-- Rollback-only checkout smoke tests; these fixtures never persist.
-- Run the complete script as one batch in the Supabase SQL editor.
-- If any step errors, run ROLLBACK; once in the editor to clear the aborted transaction.

BEGIN;
SET LOCAL search_path = '';

INSERT INTO public.categories (id, slug, name, image_path, sort_order)
VALUES (
  '90000000-0000-4000-8000-000000000001',
  'round-two-smoke-category',
  'Round Two Smoke Category',
  '/assets/white-heels.jpg',
  999
);

INSERT INTO public.products (
  id, slug, name, description, price_ngn, category_id, availability,
  min_order_qty, options
)
VALUES (
  '90000000-0000-4000-8000-000000000002',
  'round-two-smoke-product',
  'Round Two Smoke Product',
  'Temporary checkout smoke-test product.',
  1000,
  '90000000-0000-4000-8000-000000000001',
  'ready_to_order',
  2,
  '[
    {"id":"size","label":"Size","type":"choice","required":true,"multiple":false,"values":[
      {"value":"small","label":"Small","price_delta":0,"available":true,"swatch":null},
      {"value":"medium","label":"Medium","price_delta":200,"available":true,"swatch":null}
    ]},
    {"id":"yardage","label":"Yardage","type":"range","required":true,"min":1,"max":5,"step":1,"unit":"yard","price_per_unit":100}
  ]'::jsonb
);

INSERT INTO public.products (
  id, slug, name, description, price_ngn, category_id, availability,
  custom_request_enabled, custom_request_flow, custom_request_fields
)
VALUES (
  '90000000-0000-4000-8000-000000000003',
  'round-two-smoke-quote-product',
  'Round Two Smoke Quote Product',
  'Temporary WhatsApp quote smoke-test product.',
  1000,
  '90000000-0000-4000-8000-000000000001',
  'ready_to_order',
  true,
  'whatsapp_quote',
  '[{"id":"design","label":"Design","type":"text","required":true,"help_text":null,"max_length":100,"placeholder":"Describe the design"}]'::jsonb
);

INSERT INTO public.products (
  id, slug, name, description, price_ngn, category_id, availability,
  custom_request_enabled, custom_request_flow, custom_request_fee_ngn,
  needed_by_mode, custom_request_fields, lead_time_days_min
)
VALUES (
  '90000000-0000-4000-8000-000000000005',
  'round-two-smoke-checkout-product',
  'Round Two Smoke Checkout Product',
  'Temporary checkout-flow custom-request smoke-test product.',
  1000,
  '90000000-0000-4000-8000-000000000001',
  'ready_to_order',
  true,
  'checkout',
  300,
  'required',
  '[{"id":"design","label":"Design","type":"text","required":true,"help_text":null,"max_length":100,"placeholder":"Describe the design"}]'::jsonb,
  7
);

INSERT INTO public.products (
  id, slug, name, description, price_ngn, category_id, availability,
  custom_request_enabled, custom_request_flow, custom_request_fee_ngn,
  custom_request_min_qty, custom_request_fields
)
VALUES (
  '90000000-0000-4000-8000-000000000006',
  'round-two-smoke-custom-minimum-product',
  'Round Two Smoke Custom Minimum Product',
  'Temporary custom-request minimum quantity smoke-test product.',
  1000,
  '90000000-0000-4000-8000-000000000001',
  'ready_to_order',
  true,
  'checkout',
  300,
  10,
  '[{"id":"design","label":"Design","type":"text","required":true,"help_text":null,"max_length":100,"placeholder":"Describe the design"}]'::jsonb
);

INSERT INTO public.delivery_areas (id, name, fee_ngn, sort_order)
VALUES (
  '90000000-0000-4000-8000-000000000004',
  'Round Two Smoke Area',
  500,
  999
);

INSERT INTO public.coupons (
  code, discount_type, value, min_subtotal_ngn, max_discount_ngn, max_redemptions
)
VALUES
  ('ROUND2SMOKE', 'percent', 10, 1000, 1000, 10),
  ('ROUND2MIN', 'percent', 10, 5000, 1000, 10);

SELECT set_config(
  'smoke.redemptions_before',
  coupon.redemption_count::text,
  true
)
FROM public.coupons AS coupon
WHERE coupon.code = 'ROUND2SMOKE';

SET LOCAL ROLE anon;

DO $smoke$
DECLARE
  v_subtotal integer;
  v_delivery_fee integer;
  v_discount integer;
  v_total integer;
BEGIN
  SELECT result.subtotal_ngn, result.delivery_fee_ngn, result.discount_ngn, result.total_ngn
  INTO v_subtotal, v_delivery_fee, v_discount, v_total
  FROM public.create_order(
    '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
    '[{"product_id":"90000000-0000-4000-8000-000000000002","quantity":2,"selected_options":{"size":"medium","yardage":2}}]'::jsonb,
    'pickup', NULL, NULL, NULL, NULL
  ) AS result;

  IF v_subtotal IS DISTINCT FROM 2800
     OR v_delivery_fee IS DISTINCT FROM 0
     OR v_discount IS DISTINCT FROM 0
     OR v_total IS DISTINCT FROM 2800 THEN
    RAISE EXCEPTION 'Smoke test failed: pickup totals were %, %, %, %.',
      v_subtotal, v_delivery_fee, v_discount, v_total;
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  v_order_id uuid;
  v_subtotal integer;
  v_delivery_fee integer;
  v_discount integer;
  v_total integer;
BEGIN
  SELECT result.order_id, result.subtotal_ngn, result.delivery_fee_ngn,
         result.discount_ngn, result.total_ngn
  INTO v_order_id, v_subtotal, v_delivery_fee, v_discount, v_total
  FROM public.create_order(
    '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
    '[{"product_id":"90000000-0000-4000-8000-000000000002","quantity":2,"selected_options":{"size":"medium","yardage":2}}]'::jsonb,
    'delivery', '90000000-0000-4000-8000-000000000004',
    '1 Smoke Test Street', ' round2smoke ', 'Delivery smoke test'
  ) AS result;

  IF v_subtotal IS DISTINCT FROM 2800
     OR v_delivery_fee IS DISTINCT FROM 500
     OR v_discount IS DISTINCT FROM 280
     OR v_total IS DISTINCT FROM 3020 THEN
    RAISE EXCEPTION 'Smoke test failed: coupon delivery totals were %, %, %, %.',
      v_subtotal, v_delivery_fee, v_discount, v_total;
  END IF;
  PERFORM set_config('smoke.coupon_order_id', v_order_id::text, true);
END;
$smoke$ LANGUAGE plpgsql;

RESET ROLE;

DO $smoke$
DECLARE
  v_redemptions_before integer := current_setting('smoke.redemptions_before')::integer;
  v_redemptions integer;
  v_order_id uuid := current_setting('smoke.coupon_order_id')::uuid;
BEGIN
  SELECT coupon.redemption_count
  INTO v_redemptions
  FROM public.coupons AS coupon
  WHERE coupon.code = 'ROUND2SMOKE';
  IF v_redemptions IS DISTINCT FROM v_redemptions_before + 1 THEN
    RAISE EXCEPTION 'Smoke test failed: coupon redemption was not counted.';
  END IF;

  UPDATE public.orders AS order_row
  SET order_status = 'canceled'
  WHERE order_row.id = v_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Smoke test failed: coupon order was not found for cancellation.';
  END IF;

  SELECT coupon.redemption_count
  INTO v_redemptions
  FROM public.coupons AS coupon
  WHERE coupon.code = 'ROUND2SMOKE';
  IF v_redemptions IS DISTINCT FROM v_redemptions_before THEN
    RAISE EXCEPTION 'Smoke test failed: cancellation did not release the coupon redemption.';
  END IF;

  UPDATE public.orders AS order_row
  SET order_status = 'canceled'
  WHERE order_row.id = v_order_id;

  SELECT coupon.redemption_count
  INTO v_redemptions
  FROM public.coupons AS coupon
  WHERE coupon.code = 'ROUND2SMOKE';
  IF v_redemptions IS DISTINCT FROM v_redemptions_before THEN
    RAISE EXCEPTION 'Smoke test failed: repeated cancellation decremented the coupon again.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

SET LOCAL ROLE anon;

DO $smoke$
DECLARE
  v_subtotal integer;
  v_delivery_fee integer;
  v_discount integer;
  v_total integer;
BEGIN
  SELECT result.subtotal_ngn, result.delivery_fee_ngn, result.discount_ngn, result.total_ngn
  INTO v_subtotal, v_delivery_fee, v_discount, v_total
  FROM public.create_order(
    '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
    '[{"product_id":"90000000-0000-4000-8000-000000000002","quantity":2,"selected_options":{"size":"medium","yardage":2},"unit_price_ngn":1,"line_total_ngn":1,"discount_ngn":999999}]'::jsonb,
    'pickup', NULL, NULL, NULL, NULL
  ) AS result;

  IF v_subtotal IS DISTINCT FROM 2800
     OR v_delivery_fee IS DISTINCT FROM 0
     OR v_discount IS DISTINCT FROM 0
     OR v_total IS DISTINCT FROM 2800 THEN
    RAISE EXCEPTION 'Smoke test failed: tampered-price totals were %, %, %, %.',
      v_subtotal, v_delivery_fee, v_discount, v_total;
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  v_order_id uuid;
  v_subtotal integer;
  v_delivery_fee integer;
  v_discount integer;
  v_total integer;
BEGIN
  SELECT result.order_id, result.subtotal_ngn, result.delivery_fee_ngn,
         result.discount_ngn, result.total_ngn
  INTO v_order_id, v_subtotal, v_delivery_fee, v_discount, v_total
  FROM public.create_order(
    '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'product_id', '90000000-0000-4000-8000-000000000005',
      'quantity', 1,
      'selected_options', '{}'::jsonb,
      'custom_request', jsonb_build_object(
        'answers', jsonb_build_object('design', 'Blue embroidery'),
        'needed_by', to_char((now() AT TIME ZONE 'Africa/Lagos')::date + 7, 'YYYY-MM-DD')
      )
    )),
    'pickup', NULL, NULL, NULL, NULL
  ) AS result;

  IF v_subtotal IS DISTINCT FROM 1300
     OR v_delivery_fee IS DISTINCT FROM 0
     OR v_discount IS DISTINCT FROM 0
     OR v_total IS DISTINCT FROM 1300 THEN
    RAISE EXCEPTION 'Smoke test failed: custom-request order totals were %, %, %, %.',
      v_subtotal, v_delivery_fee, v_discount, v_total;
  END IF;
  PERFORM set_config('smoke.custom_order_id', v_order_id::text, true);
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.create_order(
      '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
      '[{"product_id":"90000000-0000-4000-8000-000000000002","quantity":2,"selected_options":{"size":"medium","yardage":6}}]'::jsonb,
      'pickup', NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF position('range option is outside the allowed range or step' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'Smoke test failed: unexpected range-option rejection: %', SQLERRM;
    END IF;
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Smoke test failed: out-of-range option was accepted.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.create_order(
      '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
      '[{"product_id":"90000000-0000-4000-8000-000000000002","quantity":1,"selected_options":{"size":"medium","yardage":2}}]'::jsonb,
      'pickup', NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF position('quantity is outside the allowed order range' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'Smoke test failed: unexpected minimum-quantity rejection: %', SQLERRM;
    END IF;
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Smoke test failed: below-minimum quantity was accepted.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.create_order(
      '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
      '[{"product_id":"90000000-0000-4000-8000-000000000003","quantity":1,"selected_options":{},"custom_request":{"answers":{"design":"A custom design"}}}]'::jsonb,
      'pickup', NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF position('requires a WhatsApp quote and cannot be checked out' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'Smoke test failed: unexpected WhatsApp quote rejection: %', SQLERRM;
    END IF;
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Smoke test failed: WhatsApp quote item was accepted.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.create_order(
      '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'product_id', '90000000-0000-4000-8000-000000000005',
        'quantity', 1,
        'selected_options', '{}'::jsonb,
        'custom_request', jsonb_build_object(
          'answers', jsonb_build_object('design', 'Blue embroidery'),
          'needed_by', to_char((now() AT TIME ZONE 'Africa/Lagos')::date + 6, 'YYYY-MM-DD')
        )
      )),
      'pickup', NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF position('needed-by date is earlier than the allowed date' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'Smoke test failed: unexpected lead-time rejection: %', SQLERRM;
    END IF;
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Smoke test failed: too-early needed-by date was accepted.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.create_order(
      '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
      '[{"product_id":"90000000-0000-4000-8000-000000000002","quantity":2,"selected_options":{"size":"medium","yardage":2}}]'::jsonb,
      'pickup', NULL, NULL, 'ROUND2MIN', NULL
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF position('Coupon is invalid or expired' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'Smoke test failed: unexpected minimum-subtotal coupon rejection: %', SQLERRM;
    END IF;
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Smoke test failed: coupon below its minimum subtotal was accepted.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  v_subtotal integer;
  v_delivery_fee integer;
  v_discount integer;
  v_total integer;
BEGIN
  SELECT result.subtotal_ngn, result.delivery_fee_ngn, result.discount_ngn, result.total_ngn
  INTO v_subtotal, v_delivery_fee, v_discount, v_total
  FROM public.create_order(
    '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
    '[{"product_id":"90000000-0000-4000-8000-000000000006","quantity":1,"selected_options":{}}]'::jsonb,
    'pickup', NULL, NULL, NULL, NULL
  ) AS result;

  IF v_subtotal IS DISTINCT FROM 1000
     OR v_delivery_fee IS DISTINCT FROM 0
     OR v_discount IS DISTINCT FROM 0
     OR v_total IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'Smoke test failed: plain-order totals for custom-minimum product were %, %, %, %.',
      v_subtotal, v_delivery_fee, v_discount, v_total;
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.create_order(
      '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
      '[{"product_id":"90000000-0000-4000-8000-000000000006","quantity":5,"selected_options":{},"custom_request":{"answers":{"design":"Blue embroidery"}}}]'::jsonb,
      'pickup', NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF position('requires at least 10 units for a custom order' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'Smoke test failed: unexpected custom-order minimum rejection: %', SQLERRM;
    END IF;
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Smoke test failed: custom order below its custom minimum was accepted.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  v_order_id uuid;
  v_subtotal integer;
  v_delivery_fee integer;
  v_discount integer;
  v_total integer;
BEGIN
  SELECT result.order_id, result.subtotal_ngn, result.delivery_fee_ngn,
         result.discount_ngn, result.total_ngn
  INTO v_order_id, v_subtotal, v_delivery_fee, v_discount, v_total
  FROM public.create_order(
    '{"name":"Smoke User","phone":"+2348160309308"}'::jsonb,
    '[{"product_id":"90000000-0000-4000-8000-000000000006","quantity":10,"selected_options":{},"custom_request":{"answers":{"design":"Blue embroidery"}}}]'::jsonb,
    'pickup', NULL, NULL, NULL, NULL
  ) AS result;

  IF v_subtotal IS DISTINCT FROM 13000
     OR v_delivery_fee IS DISTINCT FROM 0
     OR v_discount IS DISTINCT FROM 0
     OR v_total IS DISTINCT FROM 13000 THEN
    RAISE EXCEPTION 'Smoke test failed: custom-minimum order totals were %, %, %, %.',
      v_subtotal, v_delivery_fee, v_discount, v_total;
  END IF;
  PERFORM set_config('smoke.custom_min_order_id', v_order_id::text, true);
END;
$smoke$ LANGUAGE plpgsql;

DO $smoke$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.orders';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Smoke test failed: anon could select from public.orders.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

RESET ROLE;

DO $smoke$
DECLARE
  v_custom_order_id uuid := current_setting('smoke.custom_order_id')::uuid;
  v_custom_min_order_id uuid := current_setting('smoke.custom_min_order_id')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items AS item
    WHERE item.order_id = v_custom_order_id
      AND item.unit_price_ngn = 1300
      AND item.customization_fee_ngn = 300
      AND item.customization -> 'answers'
        @> '[{"label":"Design","value":"Blue embroidery","unit":null}]'::jsonb
      AND item.needed_by = (now() AT TIME ZONE 'Africa/Lagos')::date + 7
  ) THEN
    RAISE EXCEPTION 'Smoke test failed: custom fee, answer snapshot, or needed-by date was not stored.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items AS item
    WHERE item.order_id = v_custom_min_order_id
      AND item.quantity = 10
      AND item.unit_price_ngn = 1300
      AND item.customization_fee_ngn = 300
      AND item.line_total_ngn = 13000
  ) THEN
    RAISE EXCEPTION 'Smoke test failed: custom fee was not applied to all 10 units.';
  END IF;
END;
$smoke$ LANGUAGE plpgsql;

ROLLBACK;
SELECT 'ALL SMOKE TESTS PASSED (all test data was rolled back)' AS result;
