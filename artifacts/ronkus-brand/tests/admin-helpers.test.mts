import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProductImageStoragePath,
  buildSalesChartData,
  formatNaira,
  getAnalyticsDateRange,
  isValidAnalyticsDateRange,
  isInactivityExpired,
  normalizeWhatsAppNumber,
  parseNaira,
  parseWholeNumber,
  safeProductImageFilename,
  slugify,
  toLagosIso,
  validateCouponForm,
  validateProductForm,
  validateProductImageFile,
  validateWhatsAppNumber,
  type CouponFormValues,
  type ProductFormValues,
} from '../src/admin/helpers.ts';

test('inactivity expires exactly at the limit', () => {
  assert.equal(isInactivityExpired(1_000, 31_000, 30_000), true);
});

test('inactivity does not expire just under the limit', () => {
  assert.equal(isInactivityExpired(1_000, 30_999, 30_000), false);
});

test('inactivity expires just over the limit', () => {
  assert.equal(isInactivityExpired(1_000, 31_001, 30_000), true);
});

test('a clock moving backwards does not expire inactivity', () => {
  assert.equal(isInactivityExpired(31_000, 30_999, 30_000), false);
});

function couponValues(overrides: Partial<CouponFormValues> = {}): CouponFormValues {
  return {
    code: ' SAVE10 ',
    description: 'Ten percent off',
    discount_type: 'percent',
    value: '10',
    min_subtotal_ngn: '10000',
    max_discount_ngn: '5000',
    starts_at: '2026-11-03T10:00',
    expires_at: '2026-11-10T10:00',
    max_redemptions: '25',
    is_active: true,
    ...overrides,
  };
}

function productValues(overrides: Partial<ProductFormValues> = {}): ProductFormValues {
  return {
    name: 'Café & Co. Leather Bag',
    slug: 'cafe-co-leather-bag',
    description: '',
    price_ngn: '0',
    price_suffix: '',
    category_id: 'category-id',
    subcategory_id: '',
    audience: 'unisex',
    availability: 'ready_to_order',
    is_active: true,
    min_order_qty: '1',
    max_order_qty: '',
    lead_time_days_min: '',
    lead_time_days_max: '',
    lead_time_note: '',
    size_guide_note: '',
    ...overrides,
  };
}

test('slugify lowercases and hyphenates names consistently', () => {
  assert.equal(slugify('  Bags & Totes  '), 'bags-totes');
  assert.equal(slugify('Café / Head Wraps'), 'cafe-head-wraps');
});

test('product validation requires a name and a non-negative whole naira price', () => {
  assert.deepEqual(validateProductForm(productValues()), {});
  const errors = validateProductForm(productValues({
    name: '  ',
    price_ngn: '1.50',
  }));
  assert.ok(errors.name);
  assert.ok(errors.price_ngn);
  assert.ok(validateProductForm(productValues({ price_ngn: '2147483648' })).price_ngn);
});

test('product validation enforces minimums and max-versus-min quantity and lead-time rules', () => {
  const minimumErrors = validateProductForm(productValues({ min_order_qty: '0' }));
  const quantityErrors = validateProductForm(productValues({
    min_order_qty: '4',
    max_order_qty: '2',
  }));
  const leadTimeErrors = validateProductForm(productValues({
    lead_time_days_min: '5',
    lead_time_days_max: '3',
  }));
  assert.ok(minimumErrors.min_order_qty);
  assert.ok(quantityErrors.max_order_qty);
  assert.ok(leadTimeErrors.lead_time_days_max);
  assert.deepEqual(validateProductForm(productValues({
    lead_time_days_min: '0',
    lead_time_days_max: '0',
  })), {});
});

test('product slug and image storage names handle punctuation and accents safely', () => {
  assert.equal(slugify('  Étoile / Café & Co.!  '), 'etoile-cafe-co');
  assert.equal(safeProductImageFilename('Café & Table (MAIN).JPG'), 'cafe-table-main.jpg');
  assert.equal(
    buildProductImageStoragePath('product-id', 'Café & Table (MAIN).webp', 123),
    'products/product-id/123-cafe-table-main.webp',
  );
});

test('product image validation accepts only supported formats and a maximum 5 MB', () => {
  assert.equal(validateProductImageFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 }), null);
  assert.equal(validateProductImageFile({ type: 'image/gif', size: 10 }), 'Choose a JPEG, PNG, or WebP image.');
  assert.equal(
    validateProductImageFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }),
    'Choose an image no larger than 5 MB.',
  );
});

test('naira helpers parse whole amounts and format them for display', () => {
  assert.equal(parseNaira('₦12,345'), 12345);
  assert.equal(parseNaira('0'), 0);
  assert.equal(parseNaira('12.50'), null);
  assert.equal(parseNaira('not money'), null);
  assert.equal(formatNaira(12345), '₦12,345');
  assert.equal(formatNaira(1_234_567_890_123), '₦1,234,567,890,123');
  assert.equal(formatNaira(12345.5), '₦12,345.5');
  assert.equal(formatNaira(-1), '');
});

test('analytics date presets use Lagos calendar dates and inclusive preset ranges', () => {
  const acrossUtcMonthBoundary = new Date('2026-03-31T23:30:00.000Z');
  assert.deepEqual(getAnalyticsDateRange('today', acrossUtcMonthBoundary), {
    from: '2026-04-01',
    to: '2026-04-01',
  });
  assert.deepEqual(getAnalyticsDateRange('last7Days', acrossUtcMonthBoundary), {
    from: '2026-03-26',
    to: '2026-04-01',
  });
  assert.deepEqual(getAnalyticsDateRange('last30Days', acrossUtcMonthBoundary), {
    from: '2026-03-03',
    to: '2026-04-01',
  });
  assert.deepEqual(getAnalyticsDateRange('thisMonth', acrossUtcMonthBoundary), {
    from: '2026-04-01',
    to: '2026-04-01',
  });
  assert.deepEqual(getAnalyticsDateRange('custom', new Date(), '2026-02-28', '2026-03-01'), {
    from: '2026-02-28',
    to: '2026-03-01',
  });
  assert.equal(getAnalyticsDateRange('today', new Date('2026-04-30T22:59:00.000Z')).to, '2026-04-30');
  assert.equal(getAnalyticsDateRange('today', new Date('2026-04-30T23:00:00.000Z')).to, '2026-05-01');
});

test('analytics date ranges reject invalid, reversed, or overlong ranges', () => {
  assert.equal(isValidAnalyticsDateRange('2026-02-28', '2026-03-01'), true);
  assert.equal(isValidAnalyticsDateRange('2026-02-30', '2026-03-01'), false);
  assert.equal(isValidAnalyticsDateRange('2026-03-01', '2026-02-28'), false);
  assert.equal(isValidAnalyticsDateRange('2025-01-01', '2026-01-03'), false);
});

test('sales chart data fills missing days and handles empty results', () => {
  assert.deepEqual(buildSalesChartData([
    { day: '2026-04-01', orderCount: 2, revenueNgn: 15_000 },
    { day: '2026-04-03', orderCount: 1, revenueNgn: 8_000 },
  ], '2026-04-01', '2026-04-04'), [
    { day: '2026-04-01', orderCount: 2, revenueNgn: 15_000 },
    { day: '2026-04-02', orderCount: 0, revenueNgn: 0 },
    { day: '2026-04-03', orderCount: 1, revenueNgn: 8_000 },
    { day: '2026-04-04', orderCount: 0, revenueNgn: 0 },
  ]);
  assert.deepEqual(buildSalesChartData([], '2026-04-01', '2026-04-02'), [
    { day: '2026-04-01', orderCount: 0, revenueNgn: 0 },
    { day: '2026-04-02', orderCount: 0, revenueNgn: 0 },
  ]);
});

test('whole-number parsing accepts only trimmed safe integers', () => {
  assert.equal(parseWholeNumber('12'), 12);
  assert.equal(parseWholeNumber(' 12 '), 12);
  assert.equal(parseWholeNumber('1e3'), null);
  assert.equal(parseWholeNumber('0x10'), null);
  assert.equal(parseWholeNumber('-5'), null);
  assert.equal(parseWholeNumber('-5', { allowNegative: true }), -5);
  assert.equal(parseWholeNumber(''), null);
  assert.equal(parseWholeNumber('1.5'), null);
  assert.equal(parseWholeNumber('9007199254740992'), null);
});

test('coupon validation accepts valid percentage coupons and Lagos dates', () => {
  assert.deepEqual(validateCouponForm(couponValues()), {});
  assert.equal(toLagosIso('2026-11-03T10:00'), '2026-11-03T09:00:00.000Z');
});

test('coupon validation flags percentage, amount, redemption, and date errors', () => {
  const errors = validateCouponForm(couponValues({
    value: '101',
    min_subtotal_ngn: '-1',
    max_redemptions: '1.5',
    starts_at: '2026-11-10T10:00',
    expires_at: '2026-11-03T10:00',
  }));
  assert.ok(errors.value);
  assert.ok(errors.min_subtotal_ngn);
  assert.ok(errors.max_redemptions);
  assert.ok(errors.expires_at);
});

test('fixed coupons cannot set a percentage-only maximum discount', () => {
  const errors = validateCouponForm(couponValues({ discount_type: 'fixed', max_discount_ngn: '2000' }));
  assert.ok(errors.max_discount_ngn);
});

test('WhatsApp numbers normalize local and international formats', () => {
  assert.equal(normalizeWhatsAppNumber('08160309308'), '2348160309308');
  assert.equal(normalizeWhatsAppNumber('+234 816 030 9308'), '2348160309308');
  assert.equal(normalizeWhatsAppNumber('0816-030-9308'), '2348160309308');
  assert.equal(normalizeWhatsAppNumber('(0816).030 [9308]'), '2348160309308');
  assert.equal(normalizeWhatsAppNumber('2348160309308'), '2348160309308');
  assert.equal(normalizeWhatsAppNumber('00 234 816 030 9308'), '2348160309308');
  assert.equal(normalizeWhatsAppNumber('2340816030930'), '2340816030930');
});

test('WhatsApp validation accepts valid normalized numbers and rejects invalid ones', () => {
  assert.equal(validateWhatsAppNumber('08160309308'), null);
  assert.equal(validateWhatsAppNumber('+234 816 030 9308'), null);
  assert.equal(validateWhatsAppNumber('0816-030-9308'), null);
  assert.equal(validateWhatsAppNumber('2348160309308'), null);
  assert.equal(validateWhatsAppNumber('00 234 816 030 9308'), null);
  assert.equal(
    validateWhatsAppNumber('2340816030930'),
    'Remove the 0 after 234 (for example 2348160309308).',
  );
  assert.equal(validateWhatsAppNumber('447700900123'), null);
  assert.ok(validateWhatsAppNumber('1234567'));
  assert.ok(validateWhatsAppNumber('1234567890123456'));
  assert.ok(validateWhatsAppNumber('234abc'));
  assert.equal(validateWhatsAppNumber(''), 'Enter a WhatsApp number.');
});
