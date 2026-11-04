import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatNaira,
  parseNaira,
  slugify,
  toLagosIso,
  validateCouponForm,
  validateWhatsAppNumber,
  type CouponFormValues,
} from '../src/admin/helpers.ts';

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

test('slugify lowercases and hyphenates names consistently', () => {
  assert.equal(slugify('  Bags & Totes  '), 'bags-totes');
  assert.equal(slugify('Café / Head Wraps'), 'cafe-head-wraps');
});

test('naira helpers parse whole amounts and format them for display', () => {
  assert.equal(parseNaira('₦12,345'), 12345);
  assert.equal(parseNaira('0'), 0);
  assert.equal(parseNaira('12.50'), null);
  assert.equal(parseNaira('not money'), null);
  assert.equal(formatNaira(12345), '₦12,345');
  assert.equal(formatNaira(-1), '');
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

test('WhatsApp number validation requires digits and an international country code', () => {
  assert.equal(validateWhatsAppNumber('2348160309308'), null);
  assert.ok(validateWhatsAppNumber('08160309308'));
  assert.ok(validateWhatsAppNumber('+2348160309308'));
  assert.ok(validateWhatsAppNumber('234 816 030 9308'));
  assert.ok(validateWhatsAppNumber(' 2348160309308 '));
});
