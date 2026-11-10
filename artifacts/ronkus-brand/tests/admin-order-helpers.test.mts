import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOrderSearchFilter,
  buildOrderSummaryText,
  buildWhatsAppUrl,
  escapePostgrestSearchTerm,
  getAwaitingPaymentLabel,
  getLagosDateRange,
  getOrderTransitions,
  isOrderAbandoned,
  isOrderInTab,
  renderCustomization,
  renderOrderItemDetails,
  renderSelectedOptions,
  type OrderForTransitions,
  type OrderStatus,
} from '../src/admin/order-helpers.ts';

const statuses: OrderStatus[] = [
  'pending',
  'paid',
  'preparing',
  'delivering',
  'delivered',
  'canceled',
];

function transitionOrder(
  order_status: OrderStatus,
  fulfilment_method: 'pickup' | 'delivery',
  payment_status: 'unpaid' | 'paid' | 'failed' | 'refunded' = 'paid',
): OrderForTransitions {
  return { order_status, fulfilment_method, payment_status };
}

test('allowed transitions cover every status and fulfilment method', () => {
  for (const fulfilment_method of ['pickup', 'delivery'] as const) {
    assert.deepEqual(
      getOrderTransitions(transitionOrder('pending', fulfilment_method, 'unpaid')).map(({ status }) => status),
      ['canceled'],
    );
    assert.deepEqual(
      getOrderTransitions(transitionOrder('paid', fulfilment_method)).map(({ status }) => status),
      ['preparing', 'canceled'],
    );
    assert.deepEqual(
      getOrderTransitions(transitionOrder('preparing', fulfilment_method)).map(({ status }) => status),
      fulfilment_method === 'delivery'
        ? ['delivering', 'canceled']
        : ['delivered', 'canceled'],
    );
    assert.deepEqual(
      getOrderTransitions(transitionOrder('delivering', fulfilment_method)).map(({ status }) => status),
      ['delivered', 'canceled'],
    );
    assert.deepEqual(getOrderTransitions(transitionOrder('delivered', fulfilment_method)), []);
    assert.deepEqual(getOrderTransitions(transitionOrder('canceled', fulfilment_method)), []);
  }

  for (const status of statuses) {
    for (const fulfilment_method of ['pickup', 'delivery'] as const) {
      const actions = getOrderTransitions(transitionOrder(status, fulfilment_method));
      assert.ok(actions.every(({ status: target }) => target !== 'paid' && target !== 'pending'));
    }
  }
});

test('a paid-status mismatch disables every action except cancellation', () => {
  for (const payment_status of ['unpaid', 'failed', 'refunded'] as const) {
    assert.deepEqual(
      getOrderTransitions(transitionOrder('paid', 'delivery', payment_status)).map(({ status }) => status),
      ['canceled'],
    );
  }
});

test('tab predicates and abandoned labels distinguish unpaid from paid orders', () => {
  const now = new Date('2026-11-07T08:15:00.000Z');
  const pendingUnpaid = { order_status: 'pending', payment_status: 'unpaid' } as const;
  assert.equal(isOrderInTab(pendingUnpaid, 'awaiting_payment'), true);
  assert.equal(isOrderInTab(pendingUnpaid, 'todo'), false);
  assert.equal(isOrderInTab(pendingUnpaid, 'all'), true);
  assert.equal(isOrderInTab({ order_status: 'pending', payment_status: 'paid' }, 'awaiting_payment'), false);
  for (const order_status of ['paid', 'preparing', 'delivering'] as const) {
    assert.equal(isOrderInTab({ order_status, payment_status: 'paid' }, 'todo'), true);
  }
  assert.equal(isOrderInTab({ order_status: 'delivered', payment_status: 'paid' }, 'todo'), false);

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneMillisecondBefore = new Date(now.getTime() - 60 * 60 * 1000 + 1).toISOString();
  assert.equal(isOrderAbandoned(oneHourAgo, now), true);
  assert.equal(getAwaitingPaymentLabel(oneHourAgo, now), 'Not paid');
  assert.equal(isOrderAbandoned(oneMillisecondBefore, now), false);
  assert.equal(getAwaitingPaymentLabel(oneMillisecondBefore, now), 'Waiting for payment');
  assert.equal(isOrderAbandoned('not a date', now), false);
});

test('Lagos date presets become UTC bounds and custom dates include the selected final day', () => {
  const now = new Date('2026-11-07T08:15:11.057+01:00');
  assert.deepEqual(getLagosDateRange('today', '', '', now), {
    from: '2026-11-06T23:00:00.000Z',
    to: '2026-11-07T23:00:00.000Z',
  });
  assert.deepEqual(getLagosDateRange('last7', '', '', now), {
    from: '2026-10-31T23:00:00.000Z',
    to: '2026-11-07T23:00:00.000Z',
  });
  assert.deepEqual(getLagosDateRange('last30', '', '', now), {
    from: '2026-10-08T23:00:00.000Z',
    to: '2026-11-07T23:00:00.000Z',
  });
  assert.deepEqual(getLagosDateRange('custom', '2026-01-02', '2026-01-04', now), {
    from: '2026-01-01T23:00:00.000Z',
    to: '2026-01-04T23:00:00.000Z',
  });
  assert.ok(getLagosDateRange('custom', '2026-02-30', '2026-03-01', now).error);
  assert.ok(getLagosDateRange('custom', '2026-03-02', '2026-03-01', now).error);
});

test('PostgREST search escaping protects wildcards and quotes user values around filter separators', () => {
  assert.equal(
    escapePostgrestSearchTerm('ab%,_c"\\(x),y'),
    'ab\\%,\\_c\\"\\\\(x),y',
  );
  assert.equal(
    buildOrderSearchFilter('ab%,_c"\\(x),y'),
    'order_number.ilike."%ab\\%,\\_c\\"\\\\(x),y%",customer_name.ilike."%ab\\%,\\_c\\"\\\\(x),y%",customer_phone.ilike."%ab\\%,\\_c\\"\\\\(x),y%"',
  );
  assert.equal(buildOrderSearchFilter('  '), null);
  assert.equal(escapePostgrestSearchTerm('a\nb'), 'a b');
});

test('selected options render standard snapshots, nested values, empty, and unexpected shapes', () => {
  assert.deepEqual(renderSelectedOptions([]), []);
  assert.deepEqual(
    renderSelectedOptions([
      { group_label: 'Colour', label: 'Wine', value: 'wine' },
      { group_label: 'Length', value: 42, unit: 'cm' },
      { group_label: 'Size', value: 'Large', price_delta_ngn: 1500 },
    ]),
    ['Colour: Wine', 'Length: 42 cm', 'Size: Large (+₦1,500)'],
  );
  assert.deepEqual(renderSelectedOptions({ unusual: { nested: ['ok', 3] } }), [
    'unusual: nested: ok',
    'unusual: nested: 3',
  ]);
  assert.deepEqual(renderSelectedOptions([null, false, ['unexpected']]), ['false', 'unexpected']);
});

test('customization renders answers and gracefully handles empty and unexpected data', () => {
  assert.deepEqual(renderCustomization(null), []);
  assert.deepEqual(renderCustomization({ flow: 'checkout', answers: [], notice: '' }), []);
  assert.deepEqual(
    renderCustomization({
      flow: 'checkout',
      answers: [
        { label: 'Colour', value: 'Blue' },
        { label: 'Foot length', value: 25, unit: 'cm' },
      ],
      notice: 'Made to order',
    }),
    ['Colour: Blue', 'Foot length: 25 cm', 'Made to order'],
  );
  assert.deepEqual(renderCustomization({ answers: { dimensions: { width: 10 } }, extra: ['ok'] }), [
    'dimensions: width: 10',
    'extra: ok',
  ]);
  assert.deepEqual(renderOrderItemDetails('custom options', ['odd', { shape: 'unexpected' }]), [
    'custom options',
    'odd',
    'shape: unexpected',
  ]);
});

test('order summary is plain text and includes products, options, totals, and delivery address', () => {
  const summary = buildOrderSummaryText({
    order_number: 'TRB-000042',
    customer_name: 'Ada',
    customer_phone: '08160309308',
    fulfilment_method: 'delivery',
    delivery_area_name: 'Ikeja',
    delivery_address: '12 Example Street',
    subtotal_ngn: 10000,
    delivery_fee_ngn: 1500,
    discount_ngn: 500,
    coupon_code: 'SAVE5',
    total_ngn: 11000,
  }, [{
    product_name: 'Leather bag',
    quantity: 2,
    unit_price_ngn: 5000,
    line_total_ngn: 10000,
    selected_options: [{ group_label: 'Colour', label: 'Black' }],
    customization: { answers: [{ label: 'Initials', value: 'A.R.' }] },
    customization_fee_ngn: 200,
    needed_by: '2026-12-01',
  }]);

  assert.match(summary, /Order TRB-000042/);
  assert.match(summary, /Customer: Ada/);
  assert.match(summary, /2 × Leather bag — ₦5,000 each; line ₦10,000/);
  assert.match(summary, /Colour: Black/);
  assert.match(summary, /Initials: A\.R\./);
  assert.match(summary, /12 Example Street/);
  assert.match(summary, /Discount \(SAVE5\): −₦500/);
  assert.match(summary, /Total: ₦11,000/);
});

test('WhatsApp links normalize Nigerian local and international numbers', () => {
  for (const phone of ['08160309308', '+234 816 030 9308', '2348160309308']) {
    assert.equal(buildWhatsAppUrl(phone), 'https://wa.me/2348160309308');
  }
  assert.equal(buildWhatsAppUrl('not a phone'), null);
});
