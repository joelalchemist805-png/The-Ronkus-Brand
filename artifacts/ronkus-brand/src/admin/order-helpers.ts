import { formatNaira, normalizeWhatsAppNumber } from './helpers.ts';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'delivering'
  | 'delivered'
  | 'canceled';

export type OrderPaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded';
export type OrderFulfilmentMethod = 'pickup' | 'delivery';
export type OrderTab = 'todo' | 'awaiting_payment' | 'all';
export type OrderDatePreset = '' | 'today' | 'last7' | 'last30' | 'custom';

export type OrderTransition = {
  label: string;
  status: OrderStatus;
};

export type OrderForTransitions = {
  order_status: OrderStatus;
  payment_status: OrderPaymentStatus;
  fulfilment_method: OrderFulfilmentMethod;
};

const cancelTransition: OrderTransition = { status: 'canceled', label: 'Cancel order' };

export function getOrderTransitions(order: OrderForTransitions): OrderTransition[] {
  if (order.order_status === 'delivered' || order.order_status === 'canceled') return [];

  if (order.order_status === 'pending') {
    return [cancelTransition];
  }

  if (order.payment_status !== 'paid') {
    return [cancelTransition];
  }

  if (order.order_status === 'paid') {
    return [
      { status: 'preparing', label: 'Start preparing' },
      cancelTransition,
    ];
  }

  if (order.order_status === 'preparing') {
    return [
      order.fulfilment_method === 'delivery'
        ? { status: 'delivering', label: 'Out for delivery' }
        : { status: 'delivered', label: 'Mark delivered' },
      cancelTransition,
    ];
  }

  if (order.order_status === 'delivering') {
    return [{ status: 'delivered', label: 'Mark delivered' }, cancelTransition];
  }

  return [];
}

export function isOrderInTab(
  order: Pick<OrderForTransitions, 'order_status' | 'payment_status'>,
  tab: OrderTab,
): boolean {
  if (tab === 'todo') {
    return ['paid', 'preparing', 'delivering'].includes(order.order_status);
  }
  if (tab === 'awaiting_payment') {
    return order.order_status === 'pending' && order.payment_status === 'unpaid';
  }
  return true;
}

export function isOrderAbandoned(createdAt: string, now: number | Date = Date.now()): boolean {
  const createdTime = new Date(createdAt).getTime();
  const nowTime = now instanceof Date ? now.getTime() : now;
  return Number.isFinite(createdTime)
    && Number.isFinite(nowTime)
    && nowTime - createdTime >= 60 * 60 * 1000;
}

export function getAwaitingPaymentLabel(createdAt: string, now: number | Date = Date.now()): string {
  return isOrderAbandoned(createdAt, now) ? 'Abandoned' : 'Awaiting payment';
}

export function getLagosDateRange(
  preset: OrderDatePreset,
  startDate = '',
  endDate = '',
  now: Date = new Date(),
): { from: string | null; to: string | null; error?: string } {
  if (!preset) return { from: null, to: null };

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  let firstDate = today;
  let lastDate = today;
  if (preset === 'last7') firstDate = shiftCalendarDate(today, -6);
  if (preset === 'last30') firstDate = shiftCalendarDate(today, -29);
  if (preset === 'custom') {
    if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
      return { from: null, to: null, error: 'Choose a valid start and end date.' };
    }
    if (startDate > endDate) {
      return { from: null, to: null, error: 'The end date must be on or after the start date.' };
    }
    firstDate = startDate;
    lastDate = endDate;
  }

  return {
    from: new Date(`${firstDate}T00:00:00+01:00`).toISOString(),
    to: new Date(`${shiftCalendarDate(lastDate, 1)}T00:00:00+01:00`).toISOString(),
  };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function escapePostgrestSearchTerm(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[%_]/g, '\\$&')
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
}

export function buildOrderSearchFilter(value: string): string | null {
  const search = value.trim();
  if (!search) return null;
  const term = `"%${escapePostgrestSearchTerm(search)}%"`;
  return `order_number.ilike.${term},customer_name.ilike.${term},customer_phone.ilike.${term}`;
}

function readableValue(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || depth > 5) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => readableValue(entry, depth + 1));
  }
  if (typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const lines = readableValue(entry, depth + 1);
    return lines.map((line) => `${key}: ${line}`);
  });
}

function displaySelection(selection: Record<string, unknown>): string | null {
  const label = selection.label;
  const value = selection.value;
  const selected = typeof label === 'string' && label.trim()
    ? label.trim()
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : null;
  if (!selected) return null;

  const group = [selection.group_label, selection.group, selection.name]
    .find((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()));
  const unit = typeof selection.unit === 'string' && selection.unit.trim()
    ? ` ${selection.unit.trim()}`
    : '';
  const delta = typeof selection.price_delta_ngn === 'number' && selection.price_delta_ngn !== 0
    ? ` (${selection.price_delta_ngn > 0 ? '+' : '−'}${formatNaira(Math.abs(selection.price_delta_ngn))})`
    : '';
  return `${group ? `${group.trim()}: ` : ''}${selected}${unit}${delta}`;
}

export function renderSelectedOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return readableValue(value);
  return value.flatMap((entry) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const selection = displaySelection(entry as Record<string, unknown>);
      return selection ? [selection] : readableValue(entry);
    }
    return readableValue(entry);
  });
}

export function renderCustomization(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return readableValue(value);
  }

  const customization = value as Record<string, unknown>;
  const lines: string[] = [];
  if (Array.isArray(customization.answers)) {
    for (const answer of customization.answers) {
      if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
        const record = answer as Record<string, unknown>;
        const label = typeof record.label === 'string' && record.label.trim()
          ? record.label.trim()
          : null;
        const answerValue = readableValue(record.value).join(', ');
        const unit = typeof record.unit === 'string' && record.unit.trim()
          ? ` ${record.unit.trim()}`
          : '';
        if (label && answerValue) lines.push(`${label}: ${answerValue}${unit}`);
        else lines.push(...readableValue(record));
      } else {
        lines.push(...readableValue(answer));
      }
    }
  } else if (customization.answers && typeof customization.answers === 'object') {
    lines.push(...readableValue(customization.answers));
  }
  if (typeof customization.notice === 'string' && customization.notice.trim()) {
    lines.push(customization.notice.trim());
  }

  const otherValues = Object.fromEntries(
    Object.entries(customization).filter(([key]) => !['answers', 'notice', 'flow'].includes(key)),
  );
  lines.push(...readableValue(otherValues));
  return lines;
}

export function renderOrderItemDetails(selectedOptions: unknown, customization: unknown): string[] {
  return [
    ...renderSelectedOptions(selectedOptions),
    ...renderCustomization(customization),
  ];
}

export function buildWhatsAppUrl(phone: string): string | null {
  const number = normalizeWhatsAppNumber(phone);
  return /^\d{8,15}$/.test(number) ? `https://wa.me/${number}` : null;
}

export type OrderSummaryItem = {
  product_name: string;
  quantity: number;
  unit_price_ngn: number;
  line_total_ngn: number;
  selected_options: unknown;
  customization: unknown;
  customization_fee_ngn: number;
  needed_by: string | null;
};

export type OrderSummary = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  fulfilment_method: OrderFulfilmentMethod;
  delivery_area_name: string | null;
  delivery_address: string | null;
  subtotal_ngn: number;
  delivery_fee_ngn: number;
  discount_ngn: number;
  coupon_code: string | null;
  total_ngn: number;
};

export function buildOrderSummaryText(
  order: OrderSummary,
  items: readonly OrderSummaryItem[],
): string {
  const lines = [
    `Order ${order.order_number}`,
    `Customer: ${order.customer_name}`,
    `Phone: ${order.customer_phone}`,
    `Fulfilment: ${order.fulfilment_method}`,
  ];
  if (order.fulfilment_method === 'delivery') {
    if (order.delivery_area_name) lines.push(`Area: ${order.delivery_area_name}`);
    if (order.delivery_address) lines.push(`Address: ${order.delivery_address}`);
  }
  lines.push('', 'Items:');
  for (const item of items) {
    lines.push(
      `${item.quantity} × ${item.product_name} — ${formatNaira(item.unit_price_ngn)} each; line ${formatNaira(item.line_total_ngn)}`,
    );
    lines.push(...renderOrderItemDetails(item.selected_options, item.customization).map((detail) => `  ${detail}`));
    if (item.customization_fee_ngn > 0) {
      lines.push(`  Customization fee: ${formatNaira(item.customization_fee_ngn)}`);
    }
    if (item.needed_by) lines.push(`  Needed by: ${item.needed_by}`);
  }
  lines.push(
    '',
    `Subtotal: ${formatNaira(order.subtotal_ngn)}`,
    `Delivery: ${formatNaira(order.delivery_fee_ngn)}`,
    `Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}: −${formatNaira(order.discount_ngn)}`,
    `Total: ${formatNaira(order.total_ngn)}`,
  );
  return lines.join('\n');
}
