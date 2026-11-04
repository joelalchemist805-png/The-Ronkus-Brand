-- Lock down every application table and expose only the storefront reads and
-- administrator actions explicitly granted below.

CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS admin
    WHERE admin.user_id = auth.uid()
  );
$$;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

GRANT USAGE ON TYPE
  public.audience,
  public.availability,
  public.custom_request_flow,
  public.needed_by_mode,
  public.discount_type,
  public.order_status,
  public.payment_status,
  public.fulfilment_method,
  public.payment_provider,
  public.payment_record_status,
  public.promo_banner_mode
TO anon, authenticated;

GRANT SELECT ON public.categories, public.subcategories, public.products,
  public.product_images, public.delivery_areas, public.store_settings
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.subcategories,
  public.products, public.product_images, public.delivery_areas,
  public.store_settings, public.coupons, public.promo_banners
TO authenticated;

GRANT SELECT ON public.orders, public.order_items, public.payments,
  public.order_status_history
TO authenticated;
GRANT UPDATE (order_status, admin_note, updated_at) ON public.orders
TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_options(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_custom_request_fields(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_promo_banner() TO anon, authenticated;

CREATE POLICY categories_public_active_read
ON public.categories FOR SELECT TO anon, authenticated
USING (is_active);
COMMENT ON POLICY categories_public_active_read ON public.categories IS
'Allows storefront visitors to read active categories only.';

CREATE POLICY categories_admin_all
ON public.categories FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY categories_admin_all ON public.categories IS
'Allows verified administrators to read and manage all categories.';

CREATE POLICY subcategories_public_active_read
ON public.subcategories FOR SELECT TO anon, authenticated
USING (
  is_active
  AND EXISTS (
    SELECT 1 FROM public.categories AS category
    WHERE category.id = category_id AND category.is_active
  )
);
COMMENT ON POLICY subcategories_public_active_read ON public.subcategories IS
'Allows visitors to read active subcategories whose parent category is also active.';

CREATE POLICY subcategories_admin_all
ON public.subcategories FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY subcategories_admin_all ON public.subcategories IS
'Allows verified administrators to read and manage all subcategories.';

CREATE POLICY products_public_active_read
ON public.products FOR SELECT TO anon, authenticated
USING (is_active);
COMMENT ON POLICY products_public_active_read ON public.products IS
'Allows storefront visitors to read active products only; archived products stay private.';

CREATE POLICY products_admin_all
ON public.products FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY products_admin_all ON public.products IS
'Allows verified administrators to read and manage all product records.';

CREATE POLICY product_images_public_active_product_read
ON public.product_images FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products AS product
    WHERE product.id = product_id AND product.is_active
  )
);
COMMENT ON POLICY product_images_public_active_product_read ON public.product_images IS
'Allows visitors to read images only when their owning product is active.';

CREATE POLICY product_images_admin_all
ON public.product_images FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY product_images_admin_all ON public.product_images IS
'Allows verified administrators to read and manage product images.';

CREATE POLICY delivery_areas_public_active_read
ON public.delivery_areas FOR SELECT TO anon, authenticated
USING (is_active);
COMMENT ON POLICY delivery_areas_public_active_read ON public.delivery_areas IS
'Allows visitors to read active delivery destinations and their fees.';

CREATE POLICY delivery_areas_admin_all
ON public.delivery_areas FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY delivery_areas_admin_all ON public.delivery_areas IS
'Allows verified administrators to read and manage delivery destinations.';

CREATE POLICY store_settings_public_public_read
ON public.store_settings FOR SELECT TO anon, authenticated
USING (is_public);
COMMENT ON POLICY store_settings_public_public_read ON public.store_settings IS
'Allows visitors to read only settings explicitly marked public.';

CREATE POLICY store_settings_admin_all
ON public.store_settings FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY store_settings_admin_all ON public.store_settings IS
'Allows verified administrators to read and manage public and private settings.';

CREATE POLICY coupons_admin_all
ON public.coupons FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY coupons_admin_all ON public.coupons IS
'Restricts all direct coupon access and management to verified administrators.';

CREATE POLICY promo_banners_admin_all
ON public.promo_banners FOR ALL TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY promo_banners_admin_all ON public.promo_banners IS
'Restricts direct banner access and management to administrators; storefront reads use get_active_promo_banner().';

CREATE POLICY orders_admin_read
ON public.orders FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));
COMMENT ON POLICY orders_admin_read ON public.orders IS
'Allows verified administrators to read orders; clients have no direct order creation or deletion policy.';

CREATE POLICY orders_admin_limited_update
ON public.orders FOR UPDATE TO authenticated
USING ((SELECT public.is_admin()))
WITH CHECK ((SELECT public.is_admin()));
COMMENT ON POLICY orders_admin_limited_update ON public.orders IS
'Allows verified administrators to update only the columns granted at column level: order_status, admin_note, and updated_at.';

CREATE POLICY order_items_admin_read
ON public.order_items FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));
COMMENT ON POLICY order_items_admin_read ON public.order_items IS
'Allows verified administrators to read order line snapshots; writes are reserved for trusted round-two code.';

CREATE POLICY payments_admin_read
ON public.payments FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));
COMMENT ON POLICY payments_admin_read ON public.payments IS
'Allows verified administrators to read payment records; clients cannot directly create or alter payments.';

CREATE POLICY order_status_history_admin_read
ON public.order_status_history FOR SELECT TO authenticated
USING ((SELECT public.is_admin()));
COMMENT ON POLICY order_status_history_admin_read ON public.order_status_history IS
'Allows verified administrators to read status history; rows are written only by the order trigger.';

COMMENT ON TABLE public.admin_users IS
'No API policy or table grant permits client-side membership reads or writes; membership is provisioned through trusted database administration.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('promo-flyers', 'promo-flyers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY public_read_product_and_promo_images
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id IN ('product-images', 'promo-flyers'));
COMMENT ON POLICY public_read_product_and_promo_images ON storage.objects IS
'Allows anyone to read files from the two public storefront image buckets.';

CREATE POLICY admins_insert_product_and_promo_images
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('product-images', 'promo-flyers')
  AND (SELECT public.is_admin())
);
COMMENT ON POLICY admins_insert_product_and_promo_images ON storage.objects IS
'Allows only verified administrators to add files to the product and promo buckets.';

CREATE POLICY admins_update_product_and_promo_images
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('product-images', 'promo-flyers')
  AND (SELECT public.is_admin())
)
WITH CHECK (
  bucket_id IN ('product-images', 'promo-flyers')
  AND (SELECT public.is_admin())
);
COMMENT ON POLICY admins_update_product_and_promo_images ON storage.objects IS
'Allows only verified administrators to update files in the product and promo buckets.';

CREATE POLICY admins_delete_product_and_promo_images
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('product-images', 'promo-flyers')
  AND (SELECT public.is_admin())
);
COMMENT ON POLICY admins_delete_product_and_promo_images ON storage.objects IS
'Allows only verified administrators to delete files from the product and promo buckets.';

COMMENT ON FUNCTION public.is_admin() IS
'Checks admin_users membership using auth.uid(); it does not trust editable user metadata or JWT claims.';
