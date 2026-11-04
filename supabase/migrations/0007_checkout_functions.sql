ALTER TABLE public.products
ADD COLUMN custom_request_min_qty integer NOT NULL DEFAULT 1
CHECK (custom_request_min_qty >= 1);

COMMENT ON COLUMN public.products.custom_request_min_qty IS
'min_order_qty applies to every order of the product, while custom_request_min_qty applies only to order lines that include a custom request.';

-- Trusted coupon validation, order creation, cancellation redemption release, and manual payment.
-- All checkout amounts are recomputed from database records; clients provide selections only.

CREATE FUNCTION public.validate_coupon(p_code text, p_subtotal_ngn integer)
RETURNS TABLE (valid boolean, discount_ngn integer, message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_discount numeric;
BEGIN
  valid := false;
  discount_ngn := 0;
  message := 'Coupon is invalid or expired.';

  IF p_code IS NULL OR length(btrim(p_code)) = 0
     OR p_subtotal_ngn IS NULL OR p_subtotal_ngn < 0 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT coupon.*
  INTO v_coupon
  FROM public.coupons AS coupon
  WHERE upper(coupon.code) = upper(btrim(p_code))
    AND coupon.is_active
    AND (coupon.starts_at IS NULL OR coupon.starts_at <= now())
    AND (coupon.expires_at IS NULL OR coupon.expires_at > now())
    AND (coupon.max_redemptions IS NULL
         OR coupon.redemption_count < coupon.max_redemptions)
    AND p_subtotal_ngn >= coupon.min_subtotal_ngn;

  IF NOT FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount := floor(p_subtotal_ngn::numeric * v_coupon.value / 100);
    IF v_coupon.max_discount_ngn IS NOT NULL THEN
      v_discount := least(v_discount, v_coupon.max_discount_ngn);
    END IF;
  ELSE
    v_discount := v_coupon.value;
  END IF;

  valid := true;
  discount_ngn := least(p_subtotal_ngn::numeric, v_discount)::integer;
  message := 'Coupon applied.';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_coupon(text, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, integer)
TO anon, authenticated;

CREATE FUNCTION public.create_order(
  p_customer jsonb,
  p_items jsonb,
  p_fulfilment public.fulfilment_method,
  p_delivery_area_id uuid,
  p_delivery_address text,
  p_coupon_code text,
  p_note text
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  subtotal_ngn integer,
  delivery_fee_ngn integer,
  discount_ngn integer,
  total_ngn integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_item_id uuid;
  v_quantity integer;
  v_selected jsonb;
  v_selection jsonb;
  v_group jsonb;
  v_choice jsonb;
  v_chosen jsonb;
  v_choice_values jsonb;
  v_key text;
  v_option_snapshot jsonb;
  v_item_snapshots jsonb := '[]'::jsonb;
  v_custom jsonb;
  v_answers jsonb;
  v_answer jsonb;
  v_answer_snapshot jsonb;
  v_field jsonb;
  v_field_id text;
  v_field_value jsonb;
  v_needed_by date;
  v_today date;
  v_range_value numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_discount integer := 0;
  v_gross_total numeric;
  v_total numeric;
  v_coupon public.coupons%ROWTYPE;
  v_coupon_result record;
  v_coupon_id uuid;
  v_coupon_code text;
  v_area_name text;
  v_customization jsonb;
  v_customization_fee integer;
  v_ordinal integer := 0;
  v_inserted_order public.orders%ROWTYPE;
  v_item_snapshot jsonb;
BEGIN
  IF jsonb_typeof(p_customer) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
     OR p_fulfilment IS NULL THEN
    RAISE EXCEPTION 'Customer, items, or fulfilment details are invalid.' USING ERRCODE = 'P0001';
  END IF;

  v_customer_name := btrim(coalesce(p_customer ->> 'name', ''));
  v_customer_phone := btrim(coalesce(p_customer ->> 'phone', ''));
  v_customer_email := nullif(btrim(coalesce(p_customer ->> 'email', '')), '');
  IF length(v_customer_name) NOT BETWEEN 1 AND 120
     OR length(v_customer_phone) NOT BETWEEN 7 AND 40
     OR length(regexp_replace(v_customer_phone, '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15
     OR v_customer_phone !~ '^[+()0-9 .-]+$'
     OR (v_customer_email IS NOT NULL AND
         (length(v_customer_email) > 254 OR v_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) THEN
    RAISE EXCEPTION 'Enter a valid customer name, phone number, and email.' USING ERRCODE = 'P0001';
  END IF;

  IF p_note IS NOT NULL AND length(btrim(p_note)) > 1000 THEN
    RAISE EXCEPTION 'Order note must be 1000 characters or fewer.' USING ERRCODE = 'P0001';
  END IF;
  IF p_coupon_code IS NOT NULL AND length(btrim(p_coupon_code)) > 100 THEN
    RAISE EXCEPTION 'Coupon code is invalid or expired.' USING ERRCODE = 'P0001';
  END IF;

  IF p_fulfilment = 'delivery' THEN
    IF p_delivery_area_id IS NULL
       OR p_delivery_address IS NULL
       OR length(btrim(p_delivery_address)) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Choose a delivery area and enter a delivery address.' USING ERRCODE = 'P0001';
    END IF;
    SELECT area.fee_ngn, area.name
    INTO v_delivery_fee, v_area_name
    FROM public.delivery_areas AS area
    WHERE area.id = p_delivery_area_id AND area.is_active
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected delivery area is unavailable.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF p_delivery_area_id IS NOT NULL
       OR (p_delivery_address IS NOT NULL AND length(btrim(p_delivery_address)) > 500) THEN
      RAISE EXCEPTION 'Pickup orders cannot include a delivery area.' USING ERRCODE = 'P0001';
    END IF;
    v_delivery_fee := 0;
    v_area_name := NULL;
  END IF;

  v_today := (now() AT TIME ZONE 'Africa/Lagos')::date;

  FOR v_item IN SELECT element.value FROM jsonb_array_elements(p_items) AS element(value)
  LOOP
    v_ordinal := v_ordinal + 1;
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item -> 'product_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
       OR (v_item ->> 'quantity') !~ '^[0-9]{1,4}$' THEN
      RAISE EXCEPTION 'Item % has invalid product or quantity details.', v_ordinal USING ERRCODE = 'P0001';
    END IF;

    v_item_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_quantity NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Item % quantity must be between 1 and 1000.', v_ordinal USING ERRCODE = 'P0001';
    END IF;

    SELECT product.*
    INTO v_product
    FROM public.products AS product
    WHERE product.id = v_item_id
      AND product.is_active
      AND product.availability <> 'out_of_stock'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % is unavailable.', v_ordinal USING ERRCODE = 'P0001';
    END IF;
    IF v_quantity < v_product.min_order_qty
       OR (v_product.max_order_qty IS NOT NULL AND v_quantity > v_product.max_order_qty) THEN
      RAISE EXCEPTION 'Item % quantity is outside the allowed order range.', v_ordinal USING ERRCODE = 'P0001';
    END IF;

    v_selected := coalesce(v_item -> 'selected_options', '{}'::jsonb);
    IF jsonb_typeof(v_selected) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Item % options must be an object keyed by option group id.', v_ordinal USING ERRCODE = 'P0001';
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_selected)
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_product.options) AS option_element(value)
        WHERE option_element.value ->> 'id' = v_key
      ) THEN
        RAISE EXCEPTION 'Item % contains an unknown option.', v_ordinal USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    v_unit_price := v_product.price_ngn;
    v_option_snapshot := '[]'::jsonb;
    FOR v_group IN SELECT element.value FROM jsonb_array_elements(v_product.options) AS element(value)
    LOOP
      v_key := v_group ->> 'id';
      IF NOT (v_selected ? v_key) THEN
        IF (v_group ->> 'required')::boolean THEN
          RAISE EXCEPTION 'Item % is missing a required option.', v_ordinal USING ERRCODE = 'P0001';
        END IF;
        CONTINUE;
      END IF;

      v_selection := v_selected -> v_key;
      IF v_selection = 'null'::jsonb THEN
        RAISE EXCEPTION 'Item % has an invalid option selection.', v_ordinal USING ERRCODE = 'P0001';
      END IF;

      IF v_group ->> 'type' = 'choice' THEN
        IF (v_group ->> 'multiple')::boolean THEN
          IF jsonb_typeof(v_selection) IS DISTINCT FROM 'array'
             OR jsonb_array_length(v_selection) = 0 THEN
            RAISE EXCEPTION 'Item % must select one or more valid choices.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          v_choice_values := v_selection;
        ELSE
          IF jsonb_typeof(v_selection) IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION 'Item % must select exactly one valid choice.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          v_choice_values := jsonb_build_array(v_selection);
        END IF;

        IF EXISTS (
          SELECT selected.value
          FROM jsonb_array_elements(v_choice_values) AS selected(value)
          GROUP BY selected.value
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION 'Item % repeats an option choice.', v_ordinal USING ERRCODE = 'P0001';
        END IF;

        IF (v_group ->> 'required')::boolean AND jsonb_array_length(v_choice_values) = 0 THEN
          RAISE EXCEPTION 'Item % is missing a required option.', v_ordinal USING ERRCODE = 'P0001';
        END IF;
        FOR v_chosen IN SELECT element.value FROM jsonb_array_elements(v_choice_values) AS element(value)
        LOOP
          IF jsonb_typeof(v_chosen) IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION 'Item % has an invalid option choice.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          SELECT choice.value
          INTO v_choice
          FROM jsonb_array_elements(v_group -> 'values') AS choice(value)
          WHERE choice.value ->> 'value' = v_chosen #>> '{}'
            AND (choice.value ->> 'available')::boolean;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Item % contains an unavailable option choice.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          v_unit_price := v_unit_price + (v_choice ->> 'price_delta')::numeric;
          v_option_snapshot := v_option_snapshot || jsonb_build_array(jsonb_build_object(
            'group_id', v_key,
            'group_label', v_group ->> 'label',
            'value', v_choice ->> 'value',
            'label', v_choice ->> 'label',
            'price_delta_ngn', (v_choice ->> 'price_delta')::integer
          ));
        END LOOP;
      ELSE
        IF jsonb_typeof(v_selection) IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'Item % has an invalid range option.', v_ordinal USING ERRCODE = 'P0001';
        END IF;
        v_range_value := (v_selection #>> '{}')::numeric;
        IF v_range_value < (v_group ->> 'min')::numeric
           OR v_range_value > (v_group ->> 'max')::numeric
           OR mod(v_range_value - (v_group ->> 'min')::numeric, (v_group ->> 'step')::numeric) <> 0 THEN
          RAISE EXCEPTION 'Item % range option is outside the allowed range or step.', v_ordinal USING ERRCODE = 'P0001';
        END IF;
        IF v_group -> 'price_per_unit' <> 'null'::jsonb THEN
          v_unit_price := v_unit_price + (v_group ->> 'price_per_unit')::numeric * v_range_value;
        END IF;
        v_option_snapshot := v_option_snapshot || jsonb_build_array(jsonb_build_object(
          'group_id', v_key,
          'group_label', v_group ->> 'label',
          'value', v_range_value,
          'unit', v_group ->> 'unit'
        ));
      END IF;
    END LOOP;

    v_customization := NULL;
    v_customization_fee := 0;
    v_needed_by := NULL;
    IF (v_item ? 'custom_request') AND v_item -> 'custom_request' <> 'null'::jsonb THEN
      IF NOT v_product.custom_request_enabled THEN
        RAISE EXCEPTION 'Item % does not accept custom requests.', v_ordinal USING ERRCODE = 'P0001';
      END IF;
      IF v_product.custom_request_flow = 'whatsapp_quote' THEN
        RAISE EXCEPTION 'Item % requires a WhatsApp quote and cannot be checked out.', v_ordinal USING ERRCODE = 'P0001';
      END IF;
      IF v_quantity < v_product.custom_request_min_qty THEN
        RAISE EXCEPTION 'Item % requires at least % units for a custom order.',
          v_ordinal, v_product.custom_request_min_qty USING ERRCODE = 'P0001';
      END IF;
      v_custom := v_item -> 'custom_request';
      IF jsonb_typeof(v_custom) IS DISTINCT FROM 'object'
         OR jsonb_typeof(v_custom -> 'answers') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Item % custom request answers are invalid.', v_ordinal USING ERRCODE = 'P0001';
      END IF;
      v_answers := v_custom -> 'answers';
      FOR v_key IN SELECT jsonb_object_keys(v_answers)
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_product.custom_request_fields) AS field_element(value)
          WHERE field_element.value ->> 'id' = v_key
        ) THEN
          RAISE EXCEPTION 'Item % contains an unknown custom answer.', v_ordinal USING ERRCODE = 'P0001';
        END IF;
      END LOOP;

      v_answer_snapshot := '[]'::jsonb;
      FOR v_field IN SELECT element.value FROM jsonb_array_elements(v_product.custom_request_fields) AS element(value)
      LOOP
        v_field_id := v_field ->> 'id';
        IF NOT (v_answers ? v_field_id) OR v_answers -> v_field_id = 'null'::jsonb THEN
          IF (v_field ->> 'required')::boolean THEN
            RAISE EXCEPTION 'Item % is missing a required custom answer.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          CONTINUE;
        END IF;
        v_field_value := v_answers -> v_field_id;
        IF v_field ->> 'type' IN ('text', 'textarea') THEN
          IF jsonb_typeof(v_field_value) IS DISTINCT FROM 'string'
             OR length(btrim(v_field_value #>> '{}')) > (v_field ->> 'max_length')::integer
             OR ((v_field ->> 'required')::boolean AND length(btrim(v_field_value #>> '{}')) = 0) THEN
            RAISE EXCEPTION 'Item % has an invalid text answer.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          v_answer := to_jsonb(btrim(v_field_value #>> '{}'));
        ELSIF v_field ->> 'type' IN ('number', 'measurement') THEN
          IF jsonb_typeof(v_field_value) IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Item % has an invalid numeric answer.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          v_range_value := (v_field_value #>> '{}')::numeric;
          IF v_range_value < (v_field ->> 'min')::numeric
             OR v_range_value > (v_field ->> 'max')::numeric
             OR (v_field ->> 'type' = 'number' AND
                 mod(v_range_value - (v_field ->> 'min')::numeric, (v_field ->> 'step')::numeric) <> 0) THEN
            RAISE EXCEPTION 'Item % numeric answer is outside the allowed range.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          v_answer := v_field_value;
        ELSE
          IF jsonb_typeof(v_field_value) IS DISTINCT FROM 'string'
             OR NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(v_field -> 'values') AS choice(value)
               WHERE choice.value #>> '{}' = v_field_value #>> '{}'
             ) THEN
            RAISE EXCEPTION 'Item % has an invalid custom choice.', v_ordinal USING ERRCODE = 'P0001';
          END IF;
          v_answer := v_field_value;
        END IF;
        v_answer_snapshot := v_answer_snapshot || jsonb_build_array(jsonb_build_object(
          'label', v_field ->> 'label',
          'value', v_answer,
          'unit', v_field -> 'unit'
        ));
      END LOOP;

      IF v_product.needed_by_mode = 'required'
         AND nullif(btrim(coalesce(v_custom ->> 'needed_by', '')), '') IS NULL THEN
        RAISE EXCEPTION 'Item % requires a needed-by date.', v_ordinal USING ERRCODE = 'P0001';
      END IF;
      IF v_product.needed_by_mode = 'off'
         AND nullif(btrim(coalesce(v_custom ->> 'needed_by', '')), '') IS NOT NULL THEN
        RAISE EXCEPTION 'Item % does not accept a needed-by date.', v_ordinal USING ERRCODE = 'P0001';
      END IF;
      IF nullif(btrim(coalesce(v_custom ->> 'needed_by', '')), '') IS NOT NULL THEN
        v_needed_by := (v_custom ->> 'needed_by')::date;
        IF v_needed_by < v_today
           OR (v_product.lead_time_days_min IS NOT NULL
               AND v_needed_by < v_today + v_product.lead_time_days_min) THEN
          RAISE EXCEPTION 'Item % needed-by date is earlier than the allowed date.', v_ordinal USING ERRCODE = 'P0001';
        END IF;
      END IF;

      v_customization_fee := v_product.custom_request_fee_ngn;
      v_unit_price := v_unit_price + v_customization_fee;
      v_customization := jsonb_build_object(
        'flow', v_product.custom_request_flow,
        'answers', v_answer_snapshot,
        'notice', v_product.custom_request_notice
      );
    END IF;

    IF v_unit_price <> trunc(v_unit_price) THEN
      RAISE EXCEPTION 'Item % has an unsupported price configuration.',
        v_ordinal USING ERRCODE = 'P0001';
    END IF;
    v_line_total := v_unit_price * v_quantity;
    IF v_unit_price < 0 OR v_unit_price > 2147483647
       OR v_line_total < 0 OR v_line_total > 2147483647 THEN
      RAISE EXCEPTION 'Item % price exceeds the supported order amount.', v_ordinal USING ERRCODE = 'P0001';
    END IF;
    v_subtotal := v_subtotal + v_line_total;
    IF v_subtotal > 2147483647 THEN
      RAISE EXCEPTION 'Order subtotal exceeds the supported amount.' USING ERRCODE = 'P0001';
    END IF;

    v_item_snapshots := v_item_snapshots || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'unit_price_ngn', v_unit_price::integer,
      'quantity', v_quantity,
      'selected_options', v_option_snapshot,
      'customization', v_customization,
      'customization_fee_ngn', v_customization_fee,
      'needed_by', v_needed_by,
      'line_total_ngn', v_line_total::integer
    ));
  END LOOP;

  IF v_delivery_fee > 2147483647 THEN
    RAISE EXCEPTION 'Delivery fee exceeds the supported order amount.' USING ERRCODE = 'P0001';
  END IF;

  IF nullif(btrim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon
    FROM public.coupons AS coupon
    WHERE upper(coupon.code) = upper(btrim(p_coupon_code))
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Coupon is invalid or expired.' USING ERRCODE = 'P0001';
    END IF;

    SELECT result.* INTO v_coupon_result
    FROM public.validate_coupon(p_coupon_code, v_subtotal::integer) AS result;
    IF NOT coalesce(v_coupon_result.valid, false) THEN
      RAISE EXCEPTION 'Coupon is invalid or expired.' USING ERRCODE = 'P0001';
    END IF;
    v_discount := v_coupon_result.discount_ngn;

    UPDATE public.coupons AS coupon
    SET redemption_count = coupon.redemption_count + 1
    WHERE coupon.id = v_coupon.id
      AND (coupon.max_redemptions IS NULL
           OR coupon.redemption_count < coupon.max_redemptions)
    RETURNING coupon.id, coupon.code INTO v_coupon_id, v_coupon_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Coupon is invalid or expired.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_gross_total := v_subtotal + v_delivery_fee;
  IF v_gross_total > 2147483647 THEN
    RAISE EXCEPTION 'Order subtotal and delivery fee exceed the supported amount.' USING ERRCODE = 'P0001';
  END IF;
  v_total := v_gross_total - v_discount;
  IF v_total < 0 OR v_total > 2147483647 THEN
    RAISE EXCEPTION 'Order total exceeds the supported amount.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, fulfilment_method,
    delivery_area_id, delivery_area_name, coupon_id, coupon_code,
    delivery_address, subtotal_ngn, delivery_fee_ngn, discount_ngn,
    total_ngn, customer_note
  )
  VALUES (
    v_customer_name, v_customer_phone, v_customer_email, p_fulfilment,
    CASE WHEN p_fulfilment = 'delivery' THEN p_delivery_area_id ELSE NULL END,
    v_area_name, v_coupon_id, v_coupon_code,
    CASE WHEN p_fulfilment = 'delivery' THEN btrim(p_delivery_address) ELSE NULL END,
    v_subtotal::integer, v_delivery_fee::integer, v_discount,
    v_total::integer, nullif(btrim(coalesce(p_note, '')), '')
  )
  RETURNING * INTO v_inserted_order;

  FOR v_item_snapshot IN
    SELECT element.value FROM jsonb_array_elements(v_item_snapshots) AS element(value)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_name, unit_price_ngn, quantity,
      selected_options, customization, customization_fee_ngn, needed_by,
      line_total_ngn
    )
    VALUES (
      v_inserted_order.id,
      (v_item_snapshot ->> 'product_id')::uuid,
      v_item_snapshot ->> 'product_name',
      (v_item_snapshot ->> 'unit_price_ngn')::integer,
      (v_item_snapshot ->> 'quantity')::integer,
      v_item_snapshot -> 'selected_options',
      nullif(v_item_snapshot -> 'customization', 'null'::jsonb),
      (v_item_snapshot ->> 'customization_fee_ngn')::integer,
      nullif(v_item_snapshot ->> 'needed_by', '')::date,
      (v_item_snapshot ->> 'line_total_ngn')::integer
    );
  END LOOP;

  order_id := v_inserted_order.id;
  order_number := v_inserted_order.order_number;
  subtotal_ngn := v_inserted_order.subtotal_ngn;
  delivery_fee_ngn := v_inserted_order.delivery_fee_ngn;
  discount_ngn := v_inserted_order.discount_ngn;
  total_ngn := v_inserted_order.total_ngn;
  RETURN NEXT;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Unable to create order. Check the submitted details and try again.' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(
  jsonb, jsonb, public.fulfilment_method, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(
  jsonb, jsonb, public.fulfilment_method, uuid, text, text, text
) TO anon, authenticated;

CREATE TABLE public.order_coupon_redemption_releases (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  released_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_coupon_redemption_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_coupon_redemption_releases FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.release_canceled_order_coupon_redemption()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.order_status IS DISTINCT FROM 'canceled'
     AND NEW.order_status = 'canceled'
     AND NEW.payment_status <> 'paid'
     AND NEW.coupon_id IS NOT NULL THEN
    INSERT INTO public.order_coupon_redemption_releases (order_id)
    VALUES (NEW.id)
    ON CONFLICT (order_id) DO NOTHING;
    IF FOUND THEN
      UPDATE public.coupons AS coupon
      SET redemption_count = greatest(coupon.redemption_count - 1, 0)
      WHERE coupon.id = NEW.coupon_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_canceled_order_coupon_redemption()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_release_canceled_coupon_redemption
AFTER UPDATE OF order_status ON public.orders
FOR EACH ROW
WHEN (OLD.order_status IS DISTINCT FROM NEW.order_status)
EXECUTE FUNCTION public.release_canceled_order_coupon_redemption();

CREATE FUNCTION public.admin_mark_order_paid(p_order_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reference text;
BEGIN
  IF NOT coalesce((SELECT public.is_admin()), false) THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_note IS NOT NULL AND length(btrim(p_note)) > 1000 THEN
    RAISE EXCEPTION 'Payment note must be 1000 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  SELECT order_row.* INTO v_order
  FROM public.orders AS order_row
  WHERE order_row.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order was not found.' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.order_status = 'canceled' THEN
    RAISE EXCEPTION 'Canceled orders cannot be marked paid.' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.payment_status = 'paid' AND EXISTS (
    SELECT 1 FROM public.payments AS payment
    WHERE payment.order_id = v_order.id AND payment.status = 'success'
  ) THEN
    RETURN;
  END IF;
  IF v_order.total_ngn <= 0 THEN
    RAISE EXCEPTION 'A zero-value order cannot be recorded as a payment.' USING ERRCODE = 'P0001';
  END IF;

  v_reference := 'manual-' || v_order.id::text;
  IF EXISTS (
    SELECT 1 FROM public.payments AS payment
    WHERE payment.order_id = v_order.id AND payment.status = 'success'
  ) THEN
    RAISE EXCEPTION 'A successful payment already exists; reconcile the order payment status.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.payments (
    order_id, provider, reference, amount_ngn, status, verified_at
  )
  VALUES (
    v_order.id, 'manual', v_reference, v_order.total_ngn, 'success', now()
  );

  UPDATE public.orders AS order_row
  SET payment_status = 'paid',
      order_status = CASE
        WHEN order_row.order_status = 'pending' THEN 'paid'::public.order_status
        ELSE order_row.order_status
      END,
      admin_note = CASE
        WHEN nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN order_row.admin_note
        WHEN nullif(btrim(coalesce(order_row.admin_note, '')), '') IS NULL THEN btrim(p_note)
        ELSE order_row.admin_note || E'\n' || btrim(p_note)
      END
  WHERE order_row.id = v_order.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_order_paid(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_order_paid(uuid, text)
TO authenticated;
