import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductRow } from '../src/lib/db-types.ts';
import { computeUnitPrice, fromPrice } from '../src/lib/pricing.ts';

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'product-id',
    slug: 'test-product',
    name: 'Test product',
    description: '',
    price_ngn: 0,
    price_suffix: null,
    category_id: 'category-id',
    subcategory_id: null,
    audience: 'unisex',
    availability: 'ready_to_order',
    is_featured: false,
    featured_position: null,
    is_active: true,
    min_order_qty: 1,
    max_order_qty: null,
    lead_time_days_min: null,
    lead_time_days_max: null,
    lead_time_note: null,
    size_guide_note: null,
    options: [],
    custom_request_enabled: false,
    custom_request_button_label: 'Request custom order',
    custom_request_flow: 'whatsapp_quote',
    custom_request_fee_ngn: 0,
    custom_request_notice: null,
    custom_request_min_qty: 1,
    needed_by_mode: 'off',
    custom_request_fields: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

test('fabric yardage prices 1 through 10 yards at ₦1,000 per yard', () => {
  const fabric = product({
    price_suffix: 'per yard',
    options: [{
      id: 'yardage',
      label: 'Yardage',
      type: 'range',
      required: true,
      min: 1,
      max: 10,
      step: 1,
      unit: 'yard',
      price_per_unit: 1000,
    }],
  });

  for (let yards = 1; yards <= 10; yards += 1) {
    assert.equal(computeUnitPrice(fabric, { yardage: yards }), yards * 1000);
  }
  assert.equal(fromPrice(fabric), 1000);
});

test('shoe-size choices add the selected choice price delta', () => {
  const shoe = product({
    price_ngn: 18000,
    options: [{
      id: 'size',
      label: 'Shoe size',
      type: 'choice',
      required: true,
      multiple: false,
      values: [
        { value: '38', label: '38', price_delta: 0, swatch: null, available: true },
        { value: '39', label: '39', price_delta: 1500, swatch: null, available: true },
      ],
    }],
  });

  assert.equal(computeUnitPrice(shoe, { size: '38' }), 18000);
  assert.equal(computeUnitPrice(shoe, { size: '39' }), 19500);
  assert.equal(fromPrice(shoe), 18000);
});

test('multi-select add-ons sum the selected price deltas', () => {
  const item = product({
    price_ngn: 5000,
    options: [{
      id: 'add-ons',
      label: 'Add-ons',
      type: 'choice',
      required: false,
      multiple: true,
      values: [
        { value: 'embroidery', label: 'Embroidery', price_delta: 1200, swatch: null, available: true },
        { value: 'gift-wrap', label: 'Gift wrap', price_delta: 500, swatch: null, available: true },
        { value: 'unavailable', label: 'Unavailable', price_delta: 900, swatch: null, available: false },
      ],
    }],
  });

  assert.equal(computeUnitPrice(item, { 'add-ons': ['embroidery', 'gift-wrap'] }), 6700);
  assert.equal(computeUnitPrice(item, { 'add-ons': ['embroidery', 'unavailable'] }), 6200);
  assert.equal(fromPrice(item), 5000);
});

test('fromPrice includes required groups and ignores optional groups', () => {
  const item = product({
    price_ngn: 10000,
    options: [
      {
        id: 'size',
        label: 'Size',
        type: 'choice',
        required: true,
        multiple: false,
        values: [
          { value: 'standard', label: 'Standard', price_delta: 1000, swatch: null, available: true },
          { value: 'premium', label: 'Premium', price_delta: 4000, swatch: null, available: true },
        ],
      },
      {
        id: 'personalisation',
        label: 'Personalisation',
        type: 'choice',
        required: false,
        multiple: true,
        values: [
          { value: 'name', label: 'Add a name', price_delta: 2000, swatch: null, available: true },
        ],
      },
      {
        id: 'length',
        label: 'Length',
        type: 'range',
        required: true,
        min: 2,
        max: 8,
        step: 2,
        unit: 'metres',
        price_per_unit: 500,
      },
    ],
  });

  assert.equal(fromPrice(item), 12000);
  assert.equal(computeUnitPrice(item, { size: 'premium', length: 4 }), 16000);
});
