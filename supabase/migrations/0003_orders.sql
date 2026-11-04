-- Order, line-item, payment, and status-history records with immutable price snapshots.
-- Order creation and coupon application are implemented separately in round two.

CREATE TYPE public.order_status AS ENUM (
  'pending', 'paid', 'preparing', 'delivering', 'delivered', 'canceled'
);
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'failed', 'refunded');
CREATE TYPE public.fulfilment_method AS ENUM ('pickup', 'delivery');
CREATE TYPE public.payment_provider AS ENUM ('paystack', 'manual');
CREATE TYPE public.payment_record_status AS ENUM ('pending', 'success', 'failed');

CREATE SEQUENCE public.order_number_seq AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  sequence_value bigint;
BEGIN
  sequence_value := nextval('public.order_number_seq'::regclass);
  RETURN 'TRB-' || CASE
    WHEN sequence_value < 1000000 THEN lpad(sequence_value::text, 6, '0')
    ELSE sequence_value::text
  END;
END;
$$;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT public.generate_order_number(),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) > 0),
  customer_phone text NOT NULL CHECK (length(btrim(customer_phone)) > 0),
  customer_email text,
  fulfilment_method public.fulfilment_method NOT NULL,
  delivery_area_id uuid REFERENCES public.delivery_areas(id) ON DELETE SET NULL,
  delivery_area_name text,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  delivery_address text,
  subtotal_ngn integer NOT NULL CHECK (subtotal_ngn >= 0),
  delivery_fee_ngn integer NOT NULL DEFAULT 0 CHECK (delivery_fee_ngn >= 0),
  discount_ngn integer NOT NULL DEFAULT 0 CHECK (discount_ngn >= 0),
  total_ngn integer NOT NULL CHECK (
    total_ngn >= 0
    AND total_ngn = subtotal_ngn + delivery_fee_ngn - discount_ngn
  ),
  coupon_code text,
  order_status public.order_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  customer_note text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_delivery_address_required_check CHECK (
    fulfilment_method <> 'delivery'
    OR (delivery_address IS NOT NULL AND length(btrim(delivery_address)) > 0)
  )
);

CREATE INDEX orders_delivery_area_id_idx ON public.orders(delivery_area_id)
  WHERE delivery_area_id IS NOT NULL;
CREATE INDEX orders_coupon_id_idx ON public.orders(coupon_id)
  WHERE coupon_id IS NOT NULL;
CREATE INDEX orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX orders_status_created_at_idx ON public.orders(order_status, created_at DESC);
CREATE INDEX orders_payment_status_idx ON public.orders(payment_status);
CREATE INDEX orders_customer_phone_idx ON public.orders(customer_phone);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL CHECK (length(btrim(product_name)) > 0),
  unit_price_ngn integer NOT NULL CHECK (unit_price_ngn >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  selected_options jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(selected_options) = 'array'),
  customization jsonb CHECK (
    customization IS NULL OR jsonb_typeof(customization) = 'object'
  ),
  customization_fee_ngn integer NOT NULL DEFAULT 0 CHECK (customization_fee_ngn >= 0),
  needed_by date,
  line_total_ngn integer NOT NULL CHECK (
    line_total_ngn >= 0
    AND line_total_ngn = unit_price_ngn * quantity
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX order_items_product_id_idx ON public.order_items(product_id)
  WHERE product_id IS NOT NULL;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider public.payment_provider NOT NULL,
  reference text NOT NULL UNIQUE CHECK (length(btrim(reference)) > 0),
  amount_ngn integer NOT NULL CHECK (amount_ngn > 0),
  status public.payment_record_status NOT NULL DEFAULT 'pending',
  raw_payload jsonb,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_order_id_idx ON public.payments(order_id);
CREATE INDEX payments_status_created_at_idx ON public.payments(status, created_at DESC);
CREATE UNIQUE INDEX payments_one_success_per_order_uidx
  ON public.payments(order_id)
  WHERE status = 'success';

CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status public.order_status NOT NULL,
  to_status public.order_status NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_status_history_order_changed_idx
  ON public.order_status_history(order_id, changed_at DESC);

CREATE FUNCTION public.prevent_unpaid_paid_order_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.order_status = 'paid' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'An order cannot enter paid status before payment_status is paid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.record_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, changed_at
  )
  VALUES (
    NEW.id, OLD.order_status, NEW.order_status, auth.uid(), now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_prevent_unpaid_paid_status
BEFORE INSERT OR UPDATE OF order_status, payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.prevent_unpaid_paid_order_status();

COMMENT ON FUNCTION public.prevent_unpaid_paid_order_status() IS
'Rejects paid order status unless payment_status is paid. Refund processing must first move the order out of paid status.';

CREATE TRIGGER orders_record_status_change
AFTER UPDATE OF order_status ON public.orders
FOR EACH ROW
WHEN (OLD.order_status IS DISTINCT FROM NEW.order_status)
EXECUTE FUNCTION public.record_order_status_change();

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.order_items.unit_price_ngn IS
'Price snapshot for one unit, including selected standard-option deltas and any checkout-flow custom_request_fee_ngn.';

COMMENT ON COLUMN public.order_items.customization_fee_ngn IS
'Snapshot of the included custom-request fee for audit/display; line_total_ngn is the final stored line amount and is not recalculated from the current product.';

COMMENT ON COLUMN public.order_items.customization IS
'Optional snapshot shaped as {"flow":"checkout"|"whatsapp_quote","answers":[{"label":"...","value":"...","unit":"..."}],"notice":"..."}.';

COMMENT ON TABLE public.order_status_history IS
'One row is added after each actual order_status transition. Initial order creation is not recorded here.';
