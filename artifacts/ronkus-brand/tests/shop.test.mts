import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  filterProducts,
  getCartSubtotal,
  mergeCartItem,
  type CartItem,
  type CartItemDraft,
} from '../src/lib/shop.ts';
import { slugifyLabel } from '../src/lib/catalog.ts';

function cartItem(overrides: Partial<CartItemDraft> = {}): CartItemDraft {
  return {
    product_id: 'product-1',
    slug: 'sample-product',
    name: 'Sample product',
    image: '/assets/sample.jpg',
    quantity: 1,
    min_order_qty: 1,
    max_order_qty: null,
    selected_options: {},
    custom_request: null,
    needed_by: null,
    display_unit_price: 12000,
    ...overrides,
  };
}

test('category slugs match the seeded category names', () => {
  assert.equal(slugifyLabel('Bags & Totes'), 'bags-totes');
  assert.equal(slugifyLabel('Clothing & Fabrics'), 'clothing-fabrics');
});

test('cart entries merge only when product choices and custom answers match', () => {
  const first = cartItem({ selected_options: { size: '38', colour: 'Black' } });
  const same = cartItem({ selected_options: { size: '38', colour: 'Black' } });
  const different = cartItem({ selected_options: { size: '39', colour: 'Black' } });
  let items: CartItem[] = [];
  items = mergeCartItem(items, first);
  items = mergeCartItem(items, same);
  items = mergeCartItem(items, different);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(({ quantity }) => quantity), [2, 1]);
});

test('cart custom request answer, date and display unit price are persisted in the item model', () => {
  const item = cartItem({
    quantity: 10,
    min_order_qty: 10,
    max_order_qty: 20,
    custom_request: {
      flow: 'checkout',
      answers: [{ id: 'bust', label: 'Bust', value: 92, unit: 'cm' }],
      fee_ngn: 2000,
      notice: 'Allow two weeks.',
    },
    needed_by: '2026-11-20',
    display_unit_price: 14000,
  });
  const items = mergeCartItem([], item);
  assert.equal(items[0].product_id, 'product-1');
  assert.equal(items[0].slug, 'sample-product');
  assert.equal(items[0].selected_options, item.selected_options);
  assert.equal(items[0].custom_request?.answers[0].unit, 'cm');
  assert.equal(items[0].needed_by, '2026-11-20');
  assert.equal(getCartSubtotal(items), 140000);
});

test('search filters live product records by name, description and category id', () => {
  const inventory = [
    { name: 'Leather slides', description: 'Soft footwear', category_id: 'footwear' },
    { name: 'Print fabric', description: 'African cotton by the yard', category_id: 'fabric' },
  ];
  assert.deepEqual(filterProducts(inventory, 'slides', 'all').map(({ name }) => name), ['Leather slides']);
  assert.deepEqual(filterProducts(inventory, '', 'fabric').map(({ name }) => name), ['Print fabric']);
});

test('WhatsApp order message and URL include cart details and use the provided store number', () => {
  const item = cartItem({
    selected_options: { size: '38', colour: ['Black', 'Gold'] },
    custom_request: {
      flow: 'checkout',
      answers: [{ id: 'design', label: 'Design', value: 'Blue embroidery', unit: null }],
      fee_ngn: 2000,
      notice: null,
    },
    needed_by: '2026-11-20',
    display_unit_price: 14000,
  });
  const items = mergeCartItem([], item);
  const message = buildWhatsAppMessage(
    { name: 'Ada Okafor', phone: '+234 800 111 2222', address: '12 Market Road, Lagos' },
    items,
    getCartSubtotal(items),
  );
  const url = new URL(buildWhatsAppUrl(message, '+234 816 030 9308'));

  assert.equal(url.host, 'wa.me');
  assert.equal(url.pathname, '/2348160309308');
  assert.equal(url.searchParams.get('text'), message);
  assert.match(message, /Name: Ada Okafor/);
  assert.match(message, /size: 38/);
  assert.match(message, /colour: Black, Gold/);
  assert.match(message, /Design: Blue embroidery/);
  assert.match(message, /Needed by: 2026-11-20/);
  assert.match(message, /Line total: ₦?14,000/);
  assert.match(message, /Order total: ₦?14,000/);
});
