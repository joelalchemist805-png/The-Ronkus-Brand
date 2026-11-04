-- Core product catalog, pricing options, and optional custom-request definitions.
-- These tables are the authoritative catalog model used by the storefront.

CREATE TYPE public.audience AS ENUM ('male', 'female', 'unisex');
CREATE TYPE public.availability AS ENUM ('ready_to_order', 'made_to_order', 'out_of_stock');
CREATE TYPE public.custom_request_flow AS ENUM ('whatsapp_quote', 'checkout');
CREATE TYPE public.needed_by_mode AS ENUM ('off', 'optional', 'required');

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  image_path text NOT NULL CHECK (length(btrim(image_path)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX categories_active_sort_idx ON public.categories(sort_order, name)
  WHERE is_active;

CREATE TABLE public.subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug),
  UNIQUE (id, category_id)
);

CREATE INDEX subcategories_category_id_idx ON public.subcategories(category_id);
CREATE INDEX subcategories_active_sort_idx
  ON public.subcategories(category_id, sort_order)
  WHERE is_active;

CREATE FUNCTION public.validate_product_options(options jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  option_group jsonb;
  option_value jsonb;
  group_ids text[] := ARRAY[]::text[];
  option_values text[];
  group_id text;
  option_text text;
  min_value numeric;
  max_value numeric;
  step_value numeric;
  price_value numeric;
BEGIN
  IF jsonb_typeof(options) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(options) > 12 THEN
    RETURN false;
  END IF;

  FOR option_group IN
    SELECT value FROM jsonb_array_elements(options) AS elements(value)
  LOOP
    IF jsonb_typeof(option_group) IS DISTINCT FROM 'object'
       OR jsonb_typeof(option_group -> 'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(option_group -> 'label') IS DISTINCT FROM 'string'
       OR jsonb_typeof(option_group -> 'type') IS DISTINCT FROM 'string'
       OR jsonb_typeof(option_group -> 'required') IS DISTINCT FROM 'boolean' THEN
      RETURN false;
    END IF;

    group_id := option_group ->> 'id';
    IF group_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR group_id = ANY(group_ids)
       OR length(btrim(option_group ->> 'label')) = 0 THEN
      RETURN false;
    END IF;
    group_ids := array_append(group_ids, group_id);

    IF option_group ->> 'type' = 'choice' THEN
      IF jsonb_typeof(option_group -> 'multiple') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(option_group -> 'values') IS DISTINCT FROM 'array' THEN
        RETURN false;
      END IF;
      IF jsonb_array_length(option_group -> 'values') NOT BETWEEN 1 AND 60 THEN
        RETURN false;
      END IF;

      option_values := ARRAY[]::text[];
      FOR option_value IN
        SELECT value FROM jsonb_array_elements(option_group -> 'values') AS elements(value)
      LOOP
        IF jsonb_typeof(option_value) IS DISTINCT FROM 'object'
           OR jsonb_typeof(option_value -> 'value') IS DISTINCT FROM 'string'
           OR jsonb_typeof(option_value -> 'label') IS DISTINCT FROM 'string'
           OR jsonb_typeof(option_value -> 'price_delta') IS DISTINCT FROM 'number'
           OR jsonb_typeof(option_value -> 'available') IS DISTINCT FROM 'boolean'
           OR NOT (option_value ? 'swatch') THEN
          RETURN false;
        END IF;

        option_text := option_value ->> 'value';
        IF length(btrim(option_text)) = 0 OR option_text = ANY(option_values)
           OR length(btrim(option_value ->> 'label')) = 0 THEN
          RETURN false;
        END IF;
        option_values := array_append(option_values, option_text);

        price_value := (option_value ->> 'price_delta')::numeric;
        IF price_value < 0 OR trunc(price_value) <> price_value THEN
          RETURN false;
        END IF;

        IF jsonb_typeof(option_value -> 'swatch') = 'string' THEN
          IF option_value ->> 'swatch' !~ '^#[0-9A-Fa-f]{6}$' THEN
            RETURN false;
          END IF;
        ELSIF jsonb_typeof(option_value -> 'swatch') IS DISTINCT FROM 'null' THEN
          RETURN false;
        END IF;
      END LOOP;
    ELSIF option_group ->> 'type' = 'range' THEN
      IF jsonb_typeof(option_group -> 'min') IS DISTINCT FROM 'number'
         OR jsonb_typeof(option_group -> 'max') IS DISTINCT FROM 'number'
         OR jsonb_typeof(option_group -> 'step') IS DISTINCT FROM 'number'
         OR jsonb_typeof(option_group -> 'unit') IS DISTINCT FROM 'string'
         OR NOT (option_group ? 'price_per_unit') THEN
        RETURN false;
      END IF;

      min_value := (option_group ->> 'min')::numeric;
      max_value := (option_group ->> 'max')::numeric;
      step_value := (option_group ->> 'step')::numeric;
      IF min_value >= max_value OR step_value <= 0
         OR (max_value - min_value) / step_value > 200
         OR length(btrim(option_group ->> 'unit')) = 0 THEN
        RETURN false;
      END IF;

      IF jsonb_typeof(option_group -> 'price_per_unit') = 'number' THEN
        price_value := (option_group ->> 'price_per_unit')::numeric;
        IF price_value < 0 OR trunc(price_value) <> price_value THEN
          RETURN false;
        END IF;
      ELSIF jsonb_typeof(option_group -> 'price_per_unit') IS DISTINCT FROM 'null' THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

CREATE FUNCTION public.validate_custom_request_fields(fields jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  request_field jsonb;
  choice_value jsonb;
  field_ids text[] := ARRAY[]::text[];
  choice_values text[];
  field_id text;
  choice_text text;
  min_value numeric;
  max_value numeric;
  step_value numeric;
  length_value numeric;
BEGIN
  IF jsonb_typeof(fields) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(fields) > 15 THEN
    RETURN false;
  END IF;

  FOR request_field IN
    SELECT value FROM jsonb_array_elements(fields) AS elements(value)
  LOOP
    IF jsonb_typeof(request_field) IS DISTINCT FROM 'object'
       OR jsonb_typeof(request_field -> 'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(request_field -> 'label') IS DISTINCT FROM 'string'
       OR jsonb_typeof(request_field -> 'type') IS DISTINCT FROM 'string'
       OR jsonb_typeof(request_field -> 'required') IS DISTINCT FROM 'boolean'
       OR NOT (request_field ? 'help_text') THEN
      RETURN false;
    END IF;

    IF jsonb_typeof(request_field -> 'help_text') NOT IN ('string', 'null') THEN
      RETURN false;
    END IF;

    field_id := request_field ->> 'id';
    IF field_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR field_id = ANY(field_ids)
       OR length(btrim(request_field ->> 'label')) = 0 THEN
      RETURN false;
    END IF;
    field_ids := array_append(field_ids, field_id);

    IF request_field ->> 'type' = 'number' THEN
      IF jsonb_typeof(request_field -> 'min') IS DISTINCT FROM 'number'
         OR jsonb_typeof(request_field -> 'max') IS DISTINCT FROM 'number'
         OR jsonb_typeof(request_field -> 'step') IS DISTINCT FROM 'number'
         OR jsonb_typeof(request_field -> 'unit') IS DISTINCT FROM 'string' THEN
        RETURN false;
      END IF;
      min_value := (request_field ->> 'min')::numeric;
      max_value := (request_field ->> 'max')::numeric;
      step_value := (request_field ->> 'step')::numeric;
      IF min_value > max_value OR step_value <= 0
         OR (max_value - min_value) / step_value > 200
         OR length(btrim(request_field ->> 'unit')) = 0 THEN
        RETURN false;
      END IF;
    ELSIF request_field ->> 'type' IN ('text', 'textarea') THEN
      IF jsonb_typeof(request_field -> 'max_length') IS DISTINCT FROM 'number'
         OR jsonb_typeof(request_field -> 'placeholder') IS DISTINCT FROM 'string' THEN
        RETURN false;
      END IF;
      length_value := (request_field ->> 'max_length')::numeric;
      IF trunc(length_value) <> length_value OR length_value NOT BETWEEN 1 AND 2000 THEN
        RETURN false;
      END IF;
    ELSIF request_field ->> 'type' = 'measurement' THEN
      IF jsonb_typeof(request_field -> 'unit') IS DISTINCT FROM 'string'
         OR request_field ->> 'unit' NOT IN ('cm', 'in')
         OR jsonb_typeof(request_field -> 'min') IS DISTINCT FROM 'number'
         OR jsonb_typeof(request_field -> 'max') IS DISTINCT FROM 'number' THEN
        RETURN false;
      END IF;
      min_value := (request_field ->> 'min')::numeric;
      max_value := (request_field ->> 'max')::numeric;
      IF min_value > max_value THEN
        RETURN false;
      END IF;
    ELSIF request_field ->> 'type' = 'choice' THEN
      IF jsonb_typeof(request_field -> 'values') IS DISTINCT FROM 'array' THEN
        RETURN false;
      END IF;
      IF jsonb_array_length(request_field -> 'values') NOT BETWEEN 1 AND 30 THEN
        RETURN false;
      END IF;
      choice_values := ARRAY[]::text[];
      FOR choice_value IN
        SELECT value FROM jsonb_array_elements(request_field -> 'values') AS elements(value)
      LOOP
        IF jsonb_typeof(choice_value) IS DISTINCT FROM 'string' THEN
          RETURN false;
        END IF;
        choice_text := choice_value #>> '{}';
        IF length(btrim(choice_text)) = 0 OR choice_text = ANY(choice_values) THEN
          RETURN false;
        END IF;
        choice_values := array_append(choice_values, choice_text);
      END LOOP;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  price_ngn integer NOT NULL CHECK (price_ngn >= 0),
  price_suffix text,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  subcategory_id uuid,
  audience public.audience NOT NULL DEFAULT 'unisex',
  availability public.availability NOT NULL DEFAULT 'ready_to_order',
  is_featured boolean NOT NULL DEFAULT false,
  featured_position integer CHECK (featured_position IS NULL OR featured_position >= 1),
  is_active boolean NOT NULL DEFAULT true,
  min_order_qty integer NOT NULL DEFAULT 1 CHECK (min_order_qty >= 1),
  max_order_qty integer CHECK (max_order_qty IS NULL OR max_order_qty >= min_order_qty),
  lead_time_days_min integer CHECK (lead_time_days_min IS NULL OR lead_time_days_min >= 0),
  lead_time_days_max integer CHECK (
    lead_time_days_max IS NULL
    OR (lead_time_days_max >= 0 AND
        (lead_time_days_min IS NULL OR lead_time_days_max >= lead_time_days_min))
  ),
  lead_time_note text,
  size_guide_note text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (public.validate_product_options(options)),
  custom_request_enabled boolean NOT NULL DEFAULT false,
  custom_request_button_label text NOT NULL DEFAULT 'Request custom order'
    CHECK (length(btrim(custom_request_button_label)) > 0),
  custom_request_flow public.custom_request_flow NOT NULL DEFAULT 'whatsapp_quote',
  custom_request_fee_ngn integer NOT NULL DEFAULT 0 CHECK (custom_request_fee_ngn >= 0),
  custom_request_notice text,
  needed_by_mode public.needed_by_mode NOT NULL DEFAULT 'off',
  custom_request_fields jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (public.validate_custom_request_fields(custom_request_fields)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_subcategory_category_fk
    FOREIGN KEY (subcategory_id, category_id)
    REFERENCES public.subcategories(id, category_id)
    ON DELETE SET NULL (subcategory_id),
  CONSTRAINT products_lead_time_pair_check CHECK (
    lead_time_days_min IS NULL OR lead_time_days_max IS NULL
    OR lead_time_days_max >= lead_time_days_min
  ),
  CONSTRAINT products_enabled_request_fields_check CHECK (
    CASE
      WHEN custom_request_enabled THEN
        jsonb_typeof(custom_request_fields) = 'array'
        AND jsonb_array_length(custom_request_fields) >= 1
      ELSE true
    END
  )
);

CREATE INDEX products_category_id_idx ON public.products(category_id);
CREATE INDEX products_subcategory_id_idx ON public.products(subcategory_id)
  WHERE subcategory_id IS NOT NULL;
CREATE INDEX products_active_category_idx ON public.products(category_id, name)
  WHERE is_active;
CREATE INDEX products_featured_position_idx ON public.products(featured_position)
  WHERE is_active AND is_featured;
CREATE INDEX products_availability_idx ON public.products(availability)
  WHERE is_active;

CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path text NOT NULL CHECK (length(btrim(storage_path)) > 0),
  alt_text text NOT NULL DEFAULT '',
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX product_images_product_id_idx ON public.product_images(product_id);

CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER subcategories_set_updated_at
BEFORE UPDATE ON public.subcategories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER product_images_set_updated_at
BEFORE UPDATE ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.products.options IS
'Standard, normally checked-out options. unit_price_ngn = price_ngn + sum(price_delta of chosen values) + sum(price_per_unit x chosen range value), plus custom_request_fee_ngn when custom_request_flow is checkout. Example African fabric range: [{"id":"yardage","label":"Yardage","type":"range","required":true,"min":1,"max":10,"step":1,"unit":"yard","price_per_unit":1000}]. A shoe size choice can list the values 35 through 45, each with a zero price_delta.';

COMMENT ON COLUMN public.products.custom_request_fields IS
'Custom-request form definitions. Example tailored-shirt measurement fields are [{"id":"bust","label":"Bust","type":"measurement","required":true,"help_text":null,"unit":"cm","min":0,"max":200},{"id":"waist","label":"Waist","type":"measurement","required":true,"help_text":null,"unit":"cm","min":0,"max":200},{"id":"sleeve-length","label":"Sleeve length","type":"measurement","required":true,"help_text":null,"unit":"cm","min":0,"max":120}].';

COMMENT ON TABLE public.products IS
$examples$
Examples only; these comments do not insert seed rows:
1. Shoe with a required size choice containing values 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45 (each value has label, price_delta 0, swatch null, available true): custom_request_enabled=true, custom_request_flow='checkout', custom_request_fee_ngn set to the intended fee, custom_request_fields=[{"id":"foot-length","label":"Foot length","type":"number","required":true,"help_text":"For made-to-size orders","min":20,"max":35,"step":0.1,"unit":"cm"}], lead_time_days_min=14, lead_time_days_max=21, min_order_qty=1.
2. Branded apron: custom_request_enabled=true, custom_request_flow='whatsapp_quote', custom_request_fields=[{"id":"design","label":"Describe your design","type":"textarea","required":true,"help_text":null,"max_length":2000,"placeholder":"Describe your design"},{"id":"request-type","label":"Request type","type":"choice","required":true,"help_text":null,"values":["Branding","Colour change","Other"]}], needed_by_mode='optional', min_order_qty=10.
3. African fabric: price_ngn=0, price_suffix='per yard', options=[{"id":"yardage","label":"Yardage","type":"range","required":true,"min":1,"max":10,"step":1,"unit":"yard","price_per_unit":1000}].
4. Tailored shirt: custom_request_enabled=true with required measurement fields bust, waist, and sleeve-length, each using unit='cm' and appropriate min/max bounds.
$examples$;
