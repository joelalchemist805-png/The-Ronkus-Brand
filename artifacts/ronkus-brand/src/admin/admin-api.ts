import type { Database } from '@/lib/db-types';
import type { Json } from '@/lib/db-types';
import { adminSupabase } from './admin-supabase';
import { buildProductImageStoragePath, buildPromoFlyerStoragePath } from './helpers';

export type Category = Database['public']['Tables']['categories']['Row'];
export type Subcategory = Database['public']['Tables']['subcategories']['Row'];
export type DeliveryArea = Database['public']['Tables']['delivery_areas']['Row'];
export type Coupon = Database['public']['Tables']['coupons']['Row'];
export type StoreSetting = Database['public']['Tables']['store_settings']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type ProductImage = Database['public']['Tables']['product_images']['Row'];
export type PromoBanner = Database['public']['Tables']['promo_banners']['Row'];
export type FeaturedProduct = Pick<
  Product,
  'id' | 'name' | 'price_ngn' | 'price_suffix' | 'availability' | 'is_active' | 'is_featured' | 'featured_position'
> & { photoUrl: string | null };
export type PromoBannerWrite = Pick<
  PromoBanner,
  'mode' | 'title' | 'message' | 'coupon_id' | 'image_path' | 'image_alt' | 'link_url' | 'starts_at' | 'ends_at' | 'is_active'
>;
export type ProductWrite = Pick<
  Product,
  | 'slug'
  | 'name'
  | 'description'
  | 'price_ngn'
  | 'price_suffix'
  | 'category_id'
  | 'subcategory_id'
  | 'audience'
  | 'availability'
  | 'is_active'
  | 'min_order_qty'
  | 'max_order_qty'
  | 'lead_time_days_min'
  | 'lead_time_days_max'
  | 'lead_time_note'
  | 'size_guide_note'
>;
export type ProductConfiguration = Pick<
  Product,
  | 'options'
  | 'custom_request_enabled'
  | 'custom_request_button_label'
  | 'custom_request_flow'
  | 'custom_request_fee_ngn'
  | 'custom_request_notice'
  | 'needed_by_mode'
  | 'custom_request_fields'
>;
export type ProductOptionsWrite = Pick<ProductConfiguration, 'options'>;
export type CustomOrderWrite = Pick<
  ProductConfiguration,
  | 'custom_request_enabled'
  | 'custom_request_button_label'
  | 'custom_request_flow'
  | 'custom_request_fee_ngn'
  | 'custom_request_notice'
  | 'needed_by_mode'
  | 'custom_request_fields'
>;

export type ProductListItem = Pick<
  Product,
  | 'id'
  | 'slug'
  | 'name'
  | 'price_ngn'
  | 'price_suffix'
  | 'category_id'
  | 'availability'
  | 'is_active'
  | 'is_featured'
  | 'updated_at'
> & {
  categoryName: string;
  photoUrl: string | null;
};

export type ProductListFilters = {
  search?: string;
  categoryId?: string;
  availability?: Product['availability'] | '';
  active?: boolean | null;
};

export type ProductListResult = {
  items: ProductListItem[];
  totalCount: number;
};

export type SubcategoryAdminRow = {
  subcategory: Subcategory;
  productCount: number;
};

type AdminError = { code?: string | null; message: string };

export function friendlyAdminError(error: AdminError): string {
  switch (error.code) {
    case '23505':
      return 'That value is already in use. Choose a different one.';
    case '23514':
      return 'Some of the entered values do not meet the required rules.';
    case '23503':
      return 'This item is still in use and cannot be deleted.';
    case '42501':
      return 'You do not have permission to perform this action.';
    default:
      return 'We could not complete that request. Please try again.';
  }
}

function friendlyProductError(error: AdminError): string {
  if (error.code === '23503') {
    return 'The selected category or subcategory is no longer available. Refresh and choose it again.';
  }
  if (error.code === '23514') {
    return 'Some product values do not meet the required rules. Review the fields and try again.';
  }
  return friendlyAdminError(error);
}

function throwOnProductSlugError(error: AdminError | null): void {
  if (error?.code === '23505') {
    throw new Error('That web address is already used by another product.');
  }
  throwOnProductError(error);
}

function throwOnError(error: AdminError | null): void {
  if (error) throw new Error(friendlyAdminError(error));
}

function throwOnProductError(error: AdminError | null): void {
  if (error) throw new Error(friendlyProductError(error));
}

function throwOnPromoError(error: AdminError | null): void {
  if (!error) return;
  switch (error.code) {
    case '23514':
      throw new Error('The banner does not meet the content or date rules. Check its mode, required content, and date window.');
    case '23503':
      throw new Error('The selected coupon is no longer available. Refresh the coupon list and try again.');
    case '42501':
      throw new Error('You do not have permission to manage promotions.');
    default:
      throw new Error(friendlyAdminError(error));
  }
}

function publicProductImageUrl(path: string): string {
  return adminSupabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

export function getProductImageUrl(path: string): string {
  return publicProductImageUrl(path);
}

export function getPromoFlyerUrl(path: string): string {
  return adminSupabase.storage.from('promo-flyers').getPublicUrl(path).data.publicUrl;
}

export async function listFeaturedProducts(): Promise<FeaturedProduct[]> {
  const { data, error } = await adminSupabase
    .from('products')
    .select('id, name, price_ngn, price_suffix, availability, is_active, is_featured, featured_position')
    .eq('is_featured', true)
    .order('featured_position', { ascending: true, nullsFirst: false })
    .order('name');
  throwOnProductError(error);
  if (!data) throw new Error('Featured products could not be loaded.');
  if (data.length === 0) return [];

  const { data: images, error: imageError } = await adminSupabase
    .from('product_images')
    .select('product_id, storage_path')
    .in('product_id', data.map(({ id }) => id))
    .eq('position', 1);
  throwOnProductError(imageError);
  if (!images) throw new Error('Featured product photos could not be loaded.');
  const photoPaths = new Map(images.map((image) => [image.product_id, image.storage_path]));
  return data.map((product) => ({
    ...product,
    photoUrl: photoPaths.has(product.id) ? publicProductImageUrl(photoPaths.get(product.id)!) : null,
  }));
}

export async function listAvailableFeaturedProducts(): Promise<FeaturedProduct[]> {
  const { data, error } = await adminSupabase
    .from('products')
    .select('id, name, price_ngn, price_suffix, availability, is_active, is_featured, featured_position')
    .eq('is_active', true)
    .eq('is_featured', false)
    .order('name');
  throwOnProductError(error);
  if (!data) throw new Error('Available products could not be loaded.');
  return data.map((product) => ({ ...product, photoUrl: null }));
}

export async function setFeaturedProduct(
  id: string,
  values: Pick<Product, 'is_featured' | 'featured_position'>,
): Promise<void> {
  const { data, error } = await adminSupabase
    .from('products')
    .update(values)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  throwOnProductError(error);
  if (!data) throw new Error('The product could not be updated. Refresh and try again.');
}

export async function saveFeaturedPositions(
  positions: readonly { id: string; featured_position: number }[],
): Promise<void> {
  for (const { id, featured_position } of positions) {
    const { data, error } = await adminSupabase
      .from('products')
      .update({ featured_position })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    throwOnProductError(error);
    if (!data) throw new Error('A product position could not be saved. Refresh and try again.');
  }
}

export async function listPromoBanners(): Promise<PromoBanner[]> {
  const { data, error } = await adminSupabase
    .from('promo_banners')
    .select('*')
    .order('created_at', { ascending: false });
  throwOnPromoError(error);
  if (!data) throw new Error('Promotional banners could not be loaded.');
  return data;
}

export async function getActivePromoBannerNow(): Promise<Database['public']['Functions']['get_active_promo_banner']['Returns'][number] | null> {
  const { data, error } = await adminSupabase.rpc('get_active_promo_banner');
  throwOnPromoError(error);
  if (!data) throw new Error('The current storefront banner could not be loaded.');
  return data[0] ?? null;
}

export async function savePromoBanner(values: PromoBannerWrite, id?: string): Promise<void> {
  if (id) {
    const { data, error } = await adminSupabase
      .from('promo_banners')
      .update(values)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    throwOnPromoError(error);
    if (!data) throw new Error('The banner could not be found. Refresh and try again.');
    return;
  }
  const { error } = await adminSupabase.from('promo_banners').insert(values);
  throwOnPromoError(error);
}

export async function deactivatePromoBanner(id: string): Promise<void> {
  const { data, error } = await adminSupabase
    .from('promo_banners')
    .update({ is_active: false })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  throwOnPromoError(error);
  if (!data) throw new Error('The banner could not be found. Refresh and try again.');
}

export async function deletePromoBanner(id: string): Promise<void> {
  const { data, error } = await adminSupabase
    .from('promo_banners')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  throwOnPromoError(error);
  if (!data) throw new Error('The banner could not be found. Refresh and try again.');
}

export async function uploadPromoFlyer(file: File): Promise<string> {
  const path = buildPromoFlyerStoragePath(file.name, crypto.randomUUID());
  try {
    const { error } = await adminSupabase.storage
      .from('promo-flyers')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error('The flyer could not be uploaded. Please try again.');
  } catch (error) {
    if (error instanceof Error && error.message === 'The flyer could not be uploaded. Please try again.') {
      throw error;
    }
    throw new Error('The flyer could not be uploaded. Please try again.');
  }
  return path;
}

export async function removePromoFlyer(path: string): Promise<void> {
  try {
    const { error } = await adminSupabase.storage.from('promo-flyers').remove([path]);
    if (error) console.warn('Could not delete a promotional flyer from storage.');
  } catch {
    console.warn('Could not delete a promotional flyer from storage.');
  }
}

function warnStorageCleanup(): void {
  console.warn('Could not delete a product photo from storage.');
}

async function removeProductStorageFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await adminSupabase.storage.from('product-images').remove(paths);
    if (error) warnStorageCleanup();
  } catch {
    warnStorageCleanup();
  }
}

export async function listProductCategories(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await adminSupabase
    .from('categories')
    .select('id, name')
    .order('sort_order')
    .order('name');
  throwOnError(error);
  if (!data) throw new Error('Categories could not be loaded.');
  return data;
}

export async function listProductSubcategories(
  categoryId: string,
): Promise<{ id: string; category_id: string; name: string }[]> {
  const { data, error } = await adminSupabase
    .from('subcategories')
    .select('id, category_id, name')
    .eq('category_id', categoryId)
    .order('sort_order')
    .order('name');
  throwOnError(error);
  if (!data) throw new Error('Subcategories could not be loaded.');
  return data;
}

export async function listProducts(
  filters: ProductListFilters,
  from: number,
  pageSize = 25,
): Promise<ProductListResult> {
  let query = adminSupabase
    .from('products')
    .select(
      'id, slug, name, price_ngn, price_suffix, category_id, availability, is_active, is_featured, updated_at',
      { count: 'exact' },
    )
    .order('updated_at', { ascending: false })
    .range(from, from + pageSize - 1);
  const search = filters.search?.trim();
  if (search) query = query.ilike('name', `%${search.replace(/[\\%_]/g, '\\$&')}%`);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.availability) query = query.eq('availability', filters.availability);
  if (filters.active !== null && filters.active !== undefined) {
    query = query.eq('is_active', filters.active);
  }

  const { data, count, error } = await query;
  throwOnProductError(error);
  if (!data) throw new Error('Products could not be loaded.');
  if (data.length === 0) return { items: [], totalCount: count ?? 0 };

  const categoryIds = [...new Set(data.map((product) => product.category_id))];
  const productIds = data.map((product) => product.id);
  const [categoryResult, imageResult] = await Promise.all([
    adminSupabase.from('categories').select('id, name').in('id', categoryIds),
    adminSupabase
      .from('product_images')
      .select('product_id, storage_path')
      .in('product_id', productIds)
      .eq('position', 1),
  ]);
  throwOnError(categoryResult.error);
  throwOnError(imageResult.error);
  if (!categoryResult.data || !imageResult.data) {
    throw new Error('Product details could not be loaded.');
  }
  const categoryNames = new Map(categoryResult.data.map((category) => [category.id, category.name]));
  const photoPaths = new Map(imageResult.data.map((image) => [image.product_id, image.storage_path]));

  return {
    items: data.map((product) => ({
      ...product,
      categoryName: categoryNames.get(product.category_id) ?? 'Unknown category',
      photoUrl: photoPaths.has(product.id)
        ? publicProductImageUrl(photoPaths.get(product.id)!)
        : null,
    })),
    totalCount: count ?? 0,
  };
}

export async function getProduct(id: string): Promise<ProductWrite | null> {
  const { data, error } = await adminSupabase
    .from('products')
    .select(
      'slug, name, description, price_ngn, price_suffix, category_id, subcategory_id, audience, availability, is_active, min_order_qty, max_order_qty, lead_time_days_min, lead_time_days_max, lead_time_note, size_guide_note',
    )
    .eq('id', id)
    .maybeSingle();
  throwOnProductError(error);
  return data;
}

export async function createProduct(values: ProductWrite): Promise<string> {
  const { data, error } = await adminSupabase
    .from('products')
    .insert(values)
    .select('id')
    .single();
  throwOnProductSlugError(error);
  if (!data) throw new Error('The product could not be created.');
  return data.id;
}

export async function updateProduct(id: string, values: ProductWrite): Promise<void> {
  const { data, error } = await adminSupabase
    .from('products')
    .update(values)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  throwOnProductSlugError(error);
  if (!data) throw new Error('Product not found.');
}

export async function getProductConfiguration(id: string): Promise<ProductConfiguration | null> {
  const { data, error } = await adminSupabase
    .from('products')
    .select(
      'options, custom_request_enabled, custom_request_button_label, custom_request_flow, custom_request_fee_ngn, custom_request_notice, needed_by_mode, custom_request_fields',
    )
    .eq('id', id)
    .maybeSingle();
  throwOnProductError(error);
  return data;
}

export async function validateOptionsWithDatabase(options: ProductConfiguration['options']): Promise<void> {
  const { data, error } = await adminSupabase.rpc('validate_product_options', {
    options: options as Json,
  });
  throwOnProductError(error);
  if (data !== true) throw new Error('Review the Options section; the database rejected its settings.');
}

export async function validateCustomFieldsWithDatabase(
  fields: ProductConfiguration['custom_request_fields'],
): Promise<void> {
  const { data, error } = await adminSupabase.rpc('validate_custom_request_fields', {
    fields: fields as Json,
  });
  throwOnProductError(error);
  if (data !== true) throw new Error('Review the Custom orders section; the database rejected its fields.');
}

export async function updateProductOptions(id: string, values: ProductOptionsWrite): Promise<void> {
  const { data, error } = await adminSupabase
    .from('products')
    .update(values)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error?.code === '23514') {
    throw new Error('Some option or custom-order settings are not valid. Review the Options section.');
  }
  throwOnProductError(error);
  if (!data) throw new Error('Product not found.');
}

export async function updateProductCustomOrder(id: string, values: CustomOrderWrite): Promise<void> {
  const { data, error } = await adminSupabase
    .from('products')
    .update(values)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error?.code === '23514') {
    throw new Error('Some option or custom-order settings are not valid. Review the Custom orders section.');
  }
  throwOnProductError(error);
  if (!data) throw new Error('Product not found.');
}

export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  const { data, error } = await adminSupabase
    .from('products')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  throwOnProductError(error);
  if (!data) throw new Error('Product not found.');
}

export async function productHasOrders(id: string): Promise<boolean> {
  const { count, error } = await adminSupabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id);
  throwOnError(error);
  return (count ?? 0) > 0;
}

export async function deleteProduct(id: string): Promise<void> {
  if (await productHasOrders(id)) {
    throw new Error('This product appears in order history. Hide it from the storefront instead.');
  }
  const images = await listProductImages(id);
  const { data, error } = await adminSupabase
    .from('products')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  throwOnProductError(error);
  if (!data) throw new Error('Product not found.');
  await removeProductStorageFiles(images.map((image) => image.storage_path));
}

export async function listProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await adminSupabase
    .from('product_images')
    .select('id, product_id, storage_path, alt_text, position, created_at, updated_at')
    .eq('product_id', productId)
    .order('position');
  throwOnProductError(error);
  if (!data) throw new Error('Product photos could not be loaded.');
  return data;
}

export async function uploadProductImage(
  productId: string,
  position: number,
  file: File,
  altText: string,
  imageId?: string,
): Promise<void> {
  let oldPath: string | null = null;
  if (imageId) {
    const { data, error } = await adminSupabase
      .from('product_images')
      .select('storage_path')
      .eq('id', imageId)
      .eq('product_id', productId)
      .maybeSingle();
    throwOnProductError(error);
    if (!data) throw new Error('The photo could not be found.');
    oldPath = data.storage_path;
  }

  const path = buildProductImageStoragePath(productId, file.name);
  try {
    const { error: uploadError } = await adminSupabase.storage
      .from('product-images')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error('The photo could not be uploaded. Please try again.');
  } catch {
    throw new Error('The photo could not be uploaded. Please try again.');
  }

  if (imageId) {
    const { data, error } = await adminSupabase
      .from('product_images')
      .update({ storage_path: path, alt_text: altText })
      .eq('id', imageId)
      .eq('product_id', productId)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      await removeProductStorageFiles([path]);
      if (error) throwOnProductError(error);
      throw new Error('The photo could not be replaced. Please try again.');
    }
    if (oldPath && oldPath !== path) await removeProductStorageFiles([oldPath]);
    return;
  }

  const { error } = await adminSupabase.from('product_images').insert({
    product_id: productId,
    storage_path: path,
    alt_text: altText,
    position,
  });
  if (error) {
    await removeProductStorageFiles([path]);
    throwOnProductError(error);
  }
}

export async function saveProductImageMeta(imageId: string, altText: string): Promise<void> {
  const { data, error } = await adminSupabase
    .from('product_images')
    .update({ alt_text: altText })
    .eq('id', imageId)
    .select('id')
    .maybeSingle();
  throwOnProductError(error);
  if (!data) throw new Error('The photo could not be updated.');
}

export async function saveProductImagePosition(imageId: string, position: number): Promise<void> {
  const { data, error } = await adminSupabase
    .from('product_images')
    .update({ position })
    .eq('id', imageId)
    .select('id')
    .maybeSingle();
  throwOnProductError(error);
  if (!data) throw new Error('The photo could not be moved.');
}

export async function swapProductImages(
  productId: string,
  firstImageId: string,
  secondImageId: string,
): Promise<void> {
  const { data, error } = await adminSupabase
    .from('product_images')
    .select('id, product_id, storage_path, alt_text, position, created_at, updated_at')
    .eq('product_id', productId)
    .in('id', [firstImageId, secondImageId]);
  throwOnProductError(error);
  if (!data || data.length !== 2) throw new Error('The photos could not be reordered. Refresh and try again.');

  const [first, second] = data;
  const { error: deleteError } = await adminSupabase
    .from('product_images')
    .delete()
    .eq('product_id', productId)
    .in('id', [first.id, second.id]);
  if (deleteError) throwOnProductError(deleteError);

  const { error: insertError } = await adminSupabase.from('product_images').insert([
    {
      product_id: productId,
      storage_path: first.storage_path,
      alt_text: first.alt_text,
      position: second.position,
    },
    {
      product_id: productId,
      storage_path: second.storage_path,
      alt_text: second.alt_text,
      position: first.position,
    },
  ]);
  if (!insertError) return;

  const { error: restoreError } = await adminSupabase.from('product_images').insert([
    {
      product_id: productId,
      storage_path: first.storage_path,
      alt_text: first.alt_text,
      position: first.position,
    },
    {
      product_id: productId,
      storage_path: second.storage_path,
      alt_text: second.alt_text,
      position: second.position,
    },
  ]);
  if (restoreError) {
    throw new Error('Photo order could not be saved or restored. Reload the page to see the current order.');
  }
  throw new Error('Photo order could not be changed. The previous order was restored.');
}

export async function removeProductImage(imageId: string): Promise<void> {
  const { data, error: readError } = await adminSupabase
    .from('product_images')
    .select('storage_path')
    .eq('id', imageId)
    .maybeSingle();
  throwOnProductError(readError);
  if (!data) throw new Error('The photo could not be found.');

  const { data: deleted, error } = await adminSupabase
    .from('product_images')
    .delete()
    .eq('id', imageId)
    .select('id')
    .maybeSingle();
  throwOnProductError(error);
  if (!deleted) throw new Error('The photo could not be removed.');
  await removeProductStorageFiles([data.storage_path]);
}

export type CategoryAdminRow = {
  category: Category;
  subcategories: SubcategoryAdminRow[];
  productCount: number;
};

export async function listCategories(): Promise<CategoryAdminRow[]> {
  const [categoryResult, subcategoryResult] = await Promise.all([
    adminSupabase.from('categories').select('*').order('sort_order').order('name'),
    adminSupabase.from('subcategories').select('*').order('sort_order').order('name'),
  ]);
  throwOnError(categoryResult.error);
  throwOnError(subcategoryResult.error);
  if (!categoryResult.data || !subcategoryResult.data) {
    throw new Error('The category list could not be loaded.');
  }

  const countByCategory = new Map<string, number>();
  const countBySubcategory = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await adminSupabase
      .from('products')
      .select('category_id, subcategory_id')
      .range(from, from + 999);
    throwOnError(error);
    if (!data) throw new Error('The category product counts could not be loaded.');
    for (const product of data) {
      if (product.category_id) {
        countByCategory.set(product.category_id, (countByCategory.get(product.category_id) ?? 0) + 1);
      }
      if (product.subcategory_id) {
        countBySubcategory.set(product.subcategory_id, (countBySubcategory.get(product.subcategory_id) ?? 0) + 1);
      }
    }
    if (data.length < 1000) break;
  }

  return categoryResult.data.map((category) => ({
    category,
    subcategories: subcategoryResult.data
      .filter((entry) => entry.category_id === category.id)
      .map((subcategory) => ({
        subcategory,
        productCount: countBySubcategory.get(subcategory.id) ?? 0,
      })),
    productCount: countByCategory.get(category.id) ?? 0,
  }));
}

export async function updateCategory(
  id: string,
  changes: Pick<Category, 'name' | 'image_path' | 'sort_order' | 'is_active'>,
): Promise<void> {
  const { error } = await adminSupabase.from('categories').update(changes).eq('id', id);
  throwOnError(error);
}

export async function addSubcategory(
  values: Pick<Subcategory, 'category_id' | 'slug' | 'name' | 'sort_order' | 'is_active'>,
): Promise<void> {
  const { error } = await adminSupabase.from('subcategories').insert(values);
  throwOnError(error);
}

export async function updateSubcategory(
  id: string,
  changes: Pick<Subcategory, 'name' | 'sort_order' | 'is_active'>,
): Promise<void> {
  const { error } = await adminSupabase.from('subcategories').update(changes).eq('id', id);
  throwOnError(error);
}

export async function deleteCategoryIfEmpty(id: string): Promise<void> {
  const { count, error: countError } = await adminSupabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  throwOnError(countError);
  if ((count ?? 0) > 0) throw new Error('This category has products. Hide it instead.');
  const { error } = await adminSupabase.from('categories').delete().eq('id', id);
  throwOnError(error);
}

export async function deleteSubcategoryIfEmpty(id: string): Promise<void> {
  const { count, error: countError } = await adminSupabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('subcategory_id', id);
  throwOnError(countError);
  if ((count ?? 0) > 0) throw new Error('This subcategory has products. Hide it instead.');
  const { error } = await adminSupabase.from('subcategories').delete().eq('id', id);
  throwOnError(error);
}

export async function listDeliveryAreas(): Promise<DeliveryArea[]> {
  const { data, error } = await adminSupabase
    .from('delivery_areas')
    .select('*')
    .order('sort_order')
    .order('name');
  throwOnError(error);
  if (!data) throw new Error('Delivery areas could not be loaded.');
  return data;
}

export async function saveDeliveryArea(
  changes: Pick<DeliveryArea, 'name' | 'fee_ngn' | 'is_active' | 'sort_order'>,
  id?: string,
): Promise<void> {
  const result = id
    ? await adminSupabase.from('delivery_areas').update(changes).eq('id', id)
    : await adminSupabase.from('delivery_areas').insert(changes);
  throwOnError(result.error);
}

export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await adminSupabase
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });
  throwOnError(error);
  if (!data) throw new Error('Coupons could not be loaded.');
  return data;
}

export type CouponWrite = Pick<
  Coupon,
  | 'code'
  | 'description'
  | 'discount_type'
  | 'value'
  | 'min_subtotal_ngn'
  | 'max_discount_ngn'
  | 'starts_at'
  | 'expires_at'
  | 'max_redemptions'
  | 'is_active'
>;

export async function saveCoupon(values: CouponWrite, id?: string): Promise<void> {
  const result = id
    ? await adminSupabase.from('coupons').update(values).eq('id', id)
    : await adminSupabase.from('coupons').insert(values);
  throwOnError(result.error);
}

export async function deleteCouponIfUnused(id: string): Promise<void> {
  const { data, error: readError } = await adminSupabase
    .from('coupons')
    .select('redemption_count')
    .eq('id', id)
    .single();
  throwOnError(readError);
  if (!data) throw new Error('Coupon could not be loaded.');
  if (data.redemption_count > 0) {
    throw new Error('This coupon has redemptions. Deactivate it instead.');
  }
  const { error } = await adminSupabase.from('coupons').delete().eq('id', id);
  throwOnError(error);
}

export async function getWhatsAppSetting(): Promise<StoreSetting | null> {
  const { data, error } = await adminSupabase
    .from('store_settings')
    .select('*')
    .eq('key', 'whatsapp_number')
    .maybeSingle();
  throwOnError(error);
  return data;
}

export async function saveWhatsAppNumber(value: string): Promise<void> {
  const { error } = await adminSupabase
    .from('store_settings')
    .upsert({ key: 'whatsapp_number', value, is_public: true });
  throwOnError(error);
}
