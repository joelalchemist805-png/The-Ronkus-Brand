-- Promotional banners and a narrowly scoped public function for the current banner.
-- Coupons linked to a banner must still be valid for the banner to be returned.

CREATE TYPE public.promo_banner_mode AS ENUM ('flyer', 'message');

CREATE TABLE public.promo_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode public.promo_banner_mode NOT NULL,
  title text CHECK (title IS NULL OR char_length(title) <= 80),
  message text CHECK (message IS NULL OR char_length(message) <= 200),
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  image_path text,
  image_alt text CHECK (image_alt IS NULL OR char_length(image_alt) <= 160),
  link_url text CHECK (
    link_url IS NULL OR link_url = '/' OR link_url ~ '^/[^/]' OR link_url ~ '^https://'
  ),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_banners_date_window_check CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  ),
  CONSTRAINT promo_banners_mode_content_check CHECK (
    (mode = 'flyer' AND image_path IS NOT NULL AND length(btrim(image_path)) > 0)
    OR (mode = 'message' AND title IS NOT NULL AND length(btrim(title)) > 0)
  )
);

CREATE INDEX promo_banners_coupon_id_idx ON public.promo_banners(coupon_id)
  WHERE coupon_id IS NOT NULL;
CREATE INDEX promo_banners_active_created_idx ON public.promo_banners(created_at DESC)
  WHERE is_active;

CREATE TRIGGER promo_banners_set_updated_at
BEFORE UPDATE ON public.promo_banners
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.get_active_promo_banner()
RETURNS TABLE (
  id uuid,
  mode public.promo_banner_mode,
  title text,
  message text,
  image_path text,
  image_alt text,
  link_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  coupon_code text,
  coupon_description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    banner.id,
    banner.mode,
    banner.title,
    banner.message,
    banner.image_path,
    banner.image_alt,
    banner.link_url,
    banner.starts_at,
    banner.ends_at,
    coupon.code,
    coupon.description
  FROM public.promo_banners AS banner
  LEFT JOIN public.coupons AS coupon ON coupon.id = banner.coupon_id
  WHERE banner.is_active
    AND (banner.starts_at IS NULL OR banner.starts_at <= now())
    AND (banner.ends_at IS NULL OR banner.ends_at > now())
    AND (
      banner.coupon_id IS NULL
      OR (
        coupon.is_active
        AND (coupon.starts_at IS NULL OR coupon.starts_at <= now())
        AND (coupon.expires_at IS NULL OR coupon.expires_at > now())
        AND (
          coupon.max_redemptions IS NULL
          OR coupon.redemption_count < coupon.max_redemptions
        )
      )
    )
  ORDER BY banner.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_promo_banner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_promo_banner() TO anon, authenticated;

COMMENT ON FUNCTION public.get_active_promo_banner() IS
'Returns at most the newest active banner within its date window. A linked inactive, unstarted, expired, or exhausted coupon suppresses the banner.';
