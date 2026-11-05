import type { Database } from '@/lib/db-types';
import { adminSupabase } from './admin-supabase';

export type Category = Database['public']['Tables']['categories']['Row'];
export type Subcategory = Database['public']['Tables']['subcategories']['Row'];
export type DeliveryArea = Database['public']['Tables']['delivery_areas']['Row'];
export type Coupon = Database['public']['Tables']['coupons']['Row'];
export type StoreSetting = Database['public']['Tables']['store_settings']['Row'];

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

function throwOnError(error: AdminError | null): void {
  if (error) throw new Error(friendlyAdminError(error));
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

  const subcategoryCounts = await Promise.all(subcategoryResult.data.map(async (subcategory) => {
    const { count, error } = await adminSupabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('subcategory_id', subcategory.id);
    throwOnError(error);
    return [subcategory.id, count ?? 0] as const;
  }));
  const countBySubcategory = new Map(subcategoryCounts);

  return Promise.all(categoryResult.data.map(async (category) => {
    const { count, error } = await adminSupabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', category.id);
    throwOnError(error);
    return {
      category,
      subcategories: subcategoryResult.data
        .filter((entry) => entry.category_id === category.id)
        .map((subcategory) => ({
          subcategory,
          productCount: countBySubcategory.get(subcategory.id) ?? 0,
        })),
      productCount: count ?? 0,
    };
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
