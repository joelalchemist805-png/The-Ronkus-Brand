import type { CustomRequestFlow } from '@/lib/db-types';
import type { ProductSelections } from '@/lib/pricing';

export type CustomRequestAnswer = {
  id: string;
  label: string;
  value: string | number;
  unit: string | null;
};

export type CartCustomRequest = {
  flow: CustomRequestFlow;
  answers: CustomRequestAnswer[];
  fee_ngn: number;
  notice: string | null;
};

export type CartItemDraft = {
  product_id: string;
  slug: string;
  name: string;
  image: string;
  quantity: number;
  min_order_qty: number;
  max_order_qty: number | null;
  selected_options: ProductSelections;
  custom_request: CartCustomRequest | null;
  needed_by: string | null;
  display_unit_price: number;
};

export type CartItem = CartItemDraft & {
  key: string;
};

export type CheckoutCustomer = {
  name: string;
  phone: string;
  address: string;
};

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getCartItemKey(item: CartItemDraft): string {
  const selectedOptions = Object.fromEntries(
    Object.entries(item.selected_options)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]),
  );
  return JSON.stringify({
    product_id: item.product_id,
    selected_options: selectedOptions,
    custom_request: item.custom_request,
    needed_by: item.needed_by,
    display_unit_price: item.display_unit_price,
  });
}

export function mergeCartItem(items: CartItem[], draft: CartItemDraft): CartItem[] {
  const key = getCartItemKey(draft);
  const existing = items.find((item) => item.key === key);
  if (!existing) return [...items, { ...draft, key }];

  return items.map((item) => {
    if (item.key !== key) return item;
    const quantity = item.quantity + draft.quantity;
    return {
      ...item,
      quantity: item.max_order_qty === null ? quantity : Math.min(quantity, item.max_order_qty),
    };
  });
}

export function getCartSubtotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.display_unit_price * item.quantity, 0);
}

export function filterProducts<T extends {
  name: string;
  description: string;
  category_id: string;
}>(inventory: T[], searchText: string, categoryId: string): T[] {
  const query = searchText.trim().toLocaleLowerCase();
  return inventory.filter((product) => {
    const matchesCategory = categoryId === 'all' || product.category_id === categoryId;
    const searchableText = `${product.name} ${product.description}`.toLocaleLowerCase();
    return matchesCategory && (!query || searchableText.includes(query));
  });
}

export function buildWhatsAppMessage(
  customer: CheckoutCustomer,
  items: CartItem[],
  orderTotal: number,
): string {
  const origin = typeof window === 'undefined'
    ? 'https://theronkusbrand.com.ng'
    : window.location.origin;
  const orderLines = items.map((item, index) => {
    const optionLines = Object.entries(item.selected_options).map(([label, selection]) => {
      const value = Array.isArray(selection) ? selection.join(', ') : selection;
      return `   ${label}: ${value}`;
    });
    const customLines = item.custom_request?.answers.map(({ label, value, unit }) =>
      `   ${label}: ${value}${unit ? ` ${unit}` : ''}`,
    ) ?? [];

    return [
      `${index + 1}. ${item.name} × ${item.quantity}`,
      `   Product: ${origin}/product/${item.slug}`,
      ...optionLines,
      ...customLines,
      ...(item.needed_by ? [`   Needed by: ${item.needed_by}`] : []),
      ...(item.custom_request && item.custom_request.fee_ngn > 0
        ? [`   Custom request fee: ${formatNaira(item.custom_request.fee_ngn)} per unit`]
        : []),
      `   ${formatNaira(item.display_unit_price)} each`,
      `   Line total: ${formatNaira(item.display_unit_price * item.quantity)}`,
    ].join('\n');
  });

  return [
    'Hello The Ronkus Brand, I would like to place an order.',
    '',
    'CUSTOMER DETAILS',
    `Name: ${customer.name.trim()}`,
    `Phone: ${customer.phone.trim()}`,
    `Delivery address: ${customer.address.trim()}`,
    '',
    'ORDER',
    ...orderLines,
    '',
    `Order total: ${formatNaira(orderTotal)}`,
    'Delivery fee, if applicable, will be confirmed separately.',
  ].join('\n');
}

export function buildWhatsAppUrl(message: string, whatsappNumber: string): string {
  const number = whatsappNumber.replace(/\D/g, '');
  if (!number) throw new Error('A valid store WhatsApp number is required.');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
