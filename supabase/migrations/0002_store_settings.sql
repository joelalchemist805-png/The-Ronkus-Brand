-- Storefront settings, delivery destinations, and coupon definitions.
-- Coupon validation and redemption are intentionally deferred to round two.

CREATE TYPE public.discount_type AS ENUM ('percent', 'fixed');

CREATE TABLE public.store_settings (
  key text PRIMARY KEY CHECK (length(btrim(key)) > 0),
  value jsonb NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX store_settings_public_key_idx ON public.store_settings(key)
  WHERE is_public;

CREATE TABLE public.delivery_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  fee_ngn integer NOT NULL CHECK (fee_ngn >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_areas_active_sort_idx
  ON public.delivery_areas(sort_order, name)
  WHERE is_active;

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (
    length(btrim(code)) > 0
    AND code = upper(btrim(code))
  ),
  description text,
  discount_type public.discount_type NOT NULL,
  value integer NOT NULL CHECK (value > 0),
  min_subtotal_ngn integer NOT NULL DEFAULT 0 CHECK (min_subtotal_ngn >= 0),
  max_discount_ngn integer CHECK (max_discount_ngn IS NULL OR max_discount_ngn >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions >= 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percent_value_check CHECK (
    discount_type <> 'percent' OR value <= 100
  ),
  CONSTRAINT coupons_redemption_limit_check CHECK (
    max_redemptions IS NULL OR redemption_count <= max_redemptions
  ),
  CONSTRAINT coupons_date_window_check CHECK (
    starts_at IS NULL OR expires_at IS NULL OR expires_at > starts_at
  )
);

CREATE UNIQUE INDEX coupons_code_upper_uidx ON public.coupons(upper(code));
CREATE INDEX coupons_active_window_idx ON public.coupons(starts_at, expires_at)
  WHERE is_active;

CREATE TRIGGER store_settings_set_updated_at
BEFORE UPDATE ON public.store_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER delivery_areas_set_updated_at
BEFORE UPDATE ON public.delivery_areas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER coupons_set_updated_at
BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.store_settings IS
'The public whatsapp_number setting may be stored as JSON string "2348160309308" with is_public=true; no setting rows are seeded by this migration.';

COMMENT ON TABLE public.delivery_areas IS
'Pickup is free and is represented by fulfilment_method, not by a delivery_areas row.';
