import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPromoFlyerStoragePath,
  formatLagosDateTime,
  getPromoBannerStatus,
  getQualifyingPromoBanners,
  renumberFeaturedPositions,
  toLagosDateTimeInput,
  toLagosIso,
  validatePromoBannerForm,
  validatePromoLinkUrl,
  type PromoBannerFormValues,
} from '../src/admin/helpers.ts';

const validMessage: PromoBannerFormValues = {
  mode: 'message',
  title: 'Weekend offer',
  message: 'Save on selected items',
  image_alt: '',
  coupon_id: '',
  link_url: '/shop',
  starts_at: '2026-11-07T10:00',
  ends_at: '2026-11-08T10:00',
  is_active: true,
};

test('promo link validation matches the permitted same-site and HTTPS forms', () => {
  assert.equal(validatePromoLinkUrl('/'), null);
  assert.equal(validatePromoLinkUrl('/shop'), null);
  assert.equal(validatePromoLinkUrl('https://example.com'), null);
  assert.ok(validatePromoLinkUrl('//evil.com'));
  assert.ok(validatePromoLinkUrl('http://x'));
  assert.ok(validatePromoLinkUrl('javascript:alert(1)'));
});

test('message banners require a title and enforce content limits', () => {
  assert.deepEqual(validatePromoBannerForm(validMessage, false), {});
  assert.ok(validatePromoBannerForm({ ...validMessage, title: ' ' }, false).title);
  assert.ok(validatePromoBannerForm({ ...validMessage, title: 'x'.repeat(81) }, false).title);
  assert.ok(validatePromoBannerForm({ ...validMessage, message: 'x'.repeat(201) }, false).message);
});

test('flyer banners require an image and cap alt text at 160 characters', () => {
  const flyer = { ...validMessage, mode: 'flyer' as const };
  assert.ok(validatePromoBannerForm(flyer, false).image);
  assert.deepEqual(validatePromoBannerForm(flyer, true), {});
  assert.ok(validatePromoBannerForm({ ...flyer, image_alt: 'x'.repeat(161) }, true).image_alt);
});

test('promo date windows validate Lagos input and require end after start', () => {
  assert.equal(toLagosIso('2026-11-07T10:00'), '2026-11-07T09:00:00.000Z');
  assert.equal(toLagosDateTimeInput('2026-11-07T09:00:00.000Z'), '2026-11-07T10:00');
  assert.match(formatLagosDateTime('2026-11-07T09:00:00.000Z'), /2026/);
  assert.deepEqual(validatePromoBannerForm(validMessage, false), {});
  const errors = validatePromoBannerForm({
    ...validMessage,
    starts_at: '2026-11-08T10:00',
    ends_at: '2026-11-07T10:00',
  }, false);
  assert.ok(errors.ends_at);
  assert.ok(validatePromoBannerForm({ ...validMessage, starts_at: 'invalid' }, false).starts_at);
});

test('promo banner status accounts for active state and its date window', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');
  assert.equal(getPromoBannerStatus(true, null, null, now), 'Live now');
  assert.equal(getPromoBannerStatus(true, '2026-11-06T13:00:00.000Z', null, now), 'Scheduled');
  assert.equal(getPromoBannerStatus(true, null, '2026-11-06T11:00:00.000Z', now), 'Expired');
  assert.equal(getPromoBannerStatus(false, null, null, now), 'Inactive');
});

test('qualifying promo banners follow coupon validity and newest-created-first precedence', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');
  const banners = [
    { id: 'older', created_at: '2026-11-05T00:00:00.000Z', is_active: true, starts_at: null, ends_at: null, coupon_id: null },
    { id: 'newer', created_at: '2026-11-06T00:00:00.000Z', is_active: true, starts_at: null, ends_at: null, coupon_id: 'valid' },
    { id: 'suppressed', created_at: '2026-11-07T00:00:00.000Z', is_active: true, starts_at: null, ends_at: null, coupon_id: 'exhausted' },
  ];
  const coupons = [
    { id: 'valid', is_active: true, starts_at: null, expires_at: null, max_redemptions: 4, redemption_count: 3 },
    { id: 'exhausted', is_active: true, starts_at: null, expires_at: null, max_redemptions: 1, redemption_count: 1 },
  ];
  assert.deepEqual(getQualifyingPromoBanners(banners, coupons, now).map(({ id }) => id), ['newer', 'older']);
});

test('featured reordering assigns contiguous positions in the supplied order', () => {
  assert.deepEqual(
    renumberFeaturedPositions([{ id: 'third' }, { id: 'first' }, { id: 'second' }]),
    [
      { id: 'third', featured_position: 1 },
      { id: 'first', featured_position: 2 },
      { id: 'second', featured_position: 3 },
    ],
  );
  assert.equal(buildPromoFlyerStoragePath('Café & Sale.PNG', 'promo-1'), 'promotions/promo-1-cafe-sale.png');
});
