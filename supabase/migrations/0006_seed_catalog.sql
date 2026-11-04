-- Seed the storefront taxonomy and public WhatsApp contact setting.
-- Products, delivery areas, coupons, and promotional banners are managed by the owner.

INSERT INTO public.categories (slug, name, image_path, sort_order)
VALUES
  ('footwear', 'Footwear', '/assets/white-heels.jpg', 1),
  ('bags-totes', 'Bags & Totes', '/assets/community-customers.jpg', 2),
  ('clothing-fabrics', 'Clothing & Fabrics', '/assets/african-fabric.jpg', 3),
  ('hair-accessories', 'Hair Accessories', '/assets/bonnets.jpg', 4),
  ('chef-aprons-caps', 'Chef Aprons & Caps', '/assets/aprons.jpg', 5),
  ('others', 'Others', '/assets/leather-wallet.jpg', 6)
ON CONFLICT DO NOTHING;

INSERT INTO public.subcategories (category_id, slug, name, sort_order)
SELECT category.id, seed.slug, seed.name, seed.sort_order
FROM (VALUES
  ('footwear', 'sneakers', 'Sneakers', 1),
  ('footwear', 'sandals', 'Sandals', 2),
  ('footwear', 'loafers', 'Loafers', 3),
  ('footwear', 'heels', 'Heels', 4),
  ('footwear', 'flats', 'Flats', 5),
  ('footwear', 'platform', 'Platform', 6),
  ('footwear', 'mules', 'Mules', 7),
  ('bags-totes', 'leather-handbags', 'Leather Handbags', 1),
  ('bags-totes', 'totes', 'Totes', 2),
  ('bags-totes', 'carry-alls', 'Carry-alls', 3),
  ('clothing-fabrics', 'vintage-shirts', 'Vintage Shirts', 1),
  ('clothing-fabrics', 'tees', 'Tees', 2),
  ('clothing-fabrics', 'hoodies', 'Hoodies', 3),
  ('clothing-fabrics', 'sweatshirts', 'Sweatshirts', 4),
  ('clothing-fabrics', 'joggers', 'Joggers', 5),
  ('clothing-fabrics', 't-shirts', 'T-Shirts', 6),
  ('clothing-fabrics', 'african-print-fabrics', 'African Print Fabrics', 7),
  ('hair-accessories', 'bonnets', 'Bonnets', 1),
  ('hair-accessories', 'scrunchies', 'Scrunchies', 2),
  ('hair-accessories', 'scarves', 'Scarves', 3),
  ('hair-accessories', 'head-wraps', 'Head Wraps', 4),
  ('chef-aprons-caps', 'cook-baker-caps', 'Cook/Baker Caps', 1),
  ('chef-aprons-caps', 'cooking-aprons', 'Cooking Aprons', 2),
  ('others', 'wallets', 'Wallets', 1),
  ('others', 'bottles', 'Bottles', 2),
  ('others', 'bracelets', 'Bracelets', 3)
) AS seed(category_slug, slug, name, sort_order)
JOIN public.categories AS category ON category.slug = seed.category_slug
ON CONFLICT DO NOTHING;

INSERT INTO public.store_settings (key, value, is_public)
VALUES ('whatsapp_number', '"2348160309308"'::jsonb, true)
ON CONFLICT DO NOTHING;
