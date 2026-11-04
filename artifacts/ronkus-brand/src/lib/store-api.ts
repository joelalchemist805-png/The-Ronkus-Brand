import { useQuery } from '@tanstack/react-query';
import type {
  ActivePromoBannerRow,
  CategoryRow,
  CategoryWithSubcategories,
  DeliveryAreaRow,
  ProductImage,
  ProductImageRow,
  ProductRow,
  ProductWithImages,
  StoreSettingRow,
  SubcategoryRow,
} from '@/lib/db-types';
import { requireSupabase } from '@/lib/supabase';

const staleTime = 5 * 60 * 1000;

function throwOnError<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export function getImageUrl(path: string): string {
  if (path.startsWith('/')) return path;
  return requireSupabase().storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

export async function getCategories(): Promise<CategoryWithSubcategories[]> {
  const client = requireSupabase();
  const categories = throwOnError(
    await client.from('categories').select('*').eq('is_active', true)
      .order('sort_order').order('name'),
  ) as CategoryRow[];
  if (categories.length === 0) return [];

  const subcategories = throwOnError(
    await client.from('subcategories').select('*').eq('is_active', true)
      .in('category_id', categories.map(({ id }) => id))
      .order('sort_order').order('name'),
  ) as SubcategoryRow[];

  return categories.map((category) => ({
    ...category,
    subcategories: subcategories.filter((subcategory) => subcategory.category_id === category.id),
  }));
}

async function addProductImages(products: ProductRow[]): Promise<ProductWithImages[]> {
  if (products.length === 0) return [];
  const rows = throwOnError(
    await requireSupabase().from('product_images').select('*')
      .in('product_id', products.map(({ id }) => id))
      .order('position'),
  ) as ProductImageRow[];
  const images: ProductImage[] = rows.map((image) => ({
    ...image,
    url: getImageUrl(image.storage_path),
  }));
  return products.map((product) => ({
    ...product,
    product_images: images.filter((image) => image.product_id === product.id),
  }));
}

export async function getProducts({
  categorySlug,
  subcategorySlug,
}: {
  categorySlug?: string;
  subcategorySlug?: string;
} = {}): Promise<ProductWithImages[]> {
  const client = requireSupabase();
  let categoryId: string | undefined;
  let subcategoryId: string | undefined;

  if (categorySlug) {
    const category = throwOnError(
      await client.from('categories').select('id').eq('slug', categorySlug)
        .eq('is_active', true).maybeSingle(),
    ) as Pick<CategoryRow, 'id'> | null;
    if (!category) return [];
    categoryId = category.id;
  }

  if (subcategorySlug) {
    if (!categoryId) throw new Error('A category slug is required with a subcategory slug.');
    const subcategory = throwOnError(
      await client.from('subcategories').select('id').eq('slug', subcategorySlug)
        .eq('category_id', categoryId).eq('is_active', true).maybeSingle(),
    ) as Pick<SubcategoryRow, 'id'> | null;
    if (!subcategory) return [];
    subcategoryId = subcategory.id;
  }

  let request = client.from('products').select('*').eq('is_active', true);
  if (categoryId) request = request.eq('category_id', categoryId);
  if (subcategoryId) request = request.eq('subcategory_id', subcategoryId);
  const products = throwOnError(await request.order('name')) as ProductRow[];
  return addProductImages(products);
}

export async function getFeaturedProducts(): Promise<ProductWithImages[]> {
  const products = throwOnError(
    await requireSupabase().from('products').select('*')
      .eq('is_active', true).eq('is_featured', true)
      .order('featured_position', { ascending: true, nullsFirst: false })
      .order('name').limit(12),
  ) as ProductRow[];
  return addProductImages(products);
}

export async function getProductBySlug(slug: string): Promise<ProductWithImages | null> {
  const product = throwOnError(
    await requireSupabase().from('products').select('*').eq('slug', slug)
      .eq('is_active', true).maybeSingle(),
  ) as ProductRow | null;
  if (!product) return null;
  const [withImages] = await addProductImages([product]);
  return withImages;
}

export async function getStoreSettings(): Promise<{ whatsapp_number: string | null }> {
  const settings = throwOnError(
    await requireSupabase().from('store_settings').select('*').eq('is_public', true),
  ) as StoreSettingRow[];
  const setting = settings.find(({ key }) => key === 'whatsapp_number');
  const value = setting?.value;
  return {
    whatsapp_number: typeof value === 'string' ? value : null,
  };
}

export async function getDeliveryAreas(): Promise<DeliveryAreaRow[]> {
  return throwOnError(
    await requireSupabase().from('delivery_areas').select('*').eq('is_active', true)
      .order('sort_order').order('name'),
  ) as DeliveryAreaRow[];
}

export async function getActivePromoBanner(): Promise<ActivePromoBannerRow | null> {
  const rows = throwOnError(await requireSupabase().rpc('get_active_promo_banner'));
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime });
}

export function useProducts(filters: { categorySlug?: string; subcategorySlug?: string } = {}) {
  return useQuery({
    queryKey: ['products', filters.categorySlug ?? null, filters.subcategorySlug ?? null],
    queryFn: () => getProducts(filters),
    staleTime,
  });
}

export function useFeaturedProducts() {
  return useQuery({ queryKey: ['featured-products'], queryFn: getFeaturedProducts, staleTime });
}

export function useProductBySlug(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => getProductBySlug(slug),
    staleTime,
  });
}

export function useStoreSettings() {
  return useQuery({ queryKey: ['store-settings'], queryFn: getStoreSettings, staleTime });
}

export function useDeliveryAreas() {
  return useQuery({ queryKey: ['delivery-areas'], queryFn: getDeliveryAreas, staleTime });
}

export function useActivePromoBanner() {
  return useQuery({ queryKey: ['active-promo-banner'], queryFn: getActivePromoBanner, staleTime });
}
