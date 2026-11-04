export type DiscountType = 'percent' | 'fixed';

export type CouponFormValues = {
  code: string;
  description: string;
  discount_type: DiscountType;
  value: string;
  min_subtotal_ngn: string;
  max_discount_ngn: string;
  starts_at: string;
  expires_at: string;
  max_redemptions: string;
  is_active: boolean;
};

export type CouponFieldErrors = Partial<Record<keyof CouponFormValues, string>>;

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseNaira(value: string): number | null {
  const normalized = value.trim().replace(/[,\s₦]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function formatNaira(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return '';
  return `₦${new Intl.NumberFormat('en-NG').format(value)}`;
}

export function validateWhatsAppNumber(value: string): string | null {
  if (!value) return 'Enter a WhatsApp number.';
  if (!/^234\d{10}$/.test(value)) {
    return 'Use digits only, including the country code (for example 2348160309308).';
  }
  return null;
}

export function toLagosIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+01:00`);
  if (Number.isNaN(date.getTime()) || toLagosDateTimeInput(date.toISOString()) !== value) return null;
  return date.toISOString();
}

export function toLagosDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function isOptionalInteger(value: string, minimum: number, asNaira = false): boolean {
  if (!value.trim()) return true;
  const parsed = asNaira ? parseNaira(value) : Number(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= minimum;
}

export function validateCouponForm(values: CouponFormValues): CouponFieldErrors {
  const errors: CouponFieldErrors = {};
  const code = values.code.trim();
  const parsedValue = Number(values.value);

  if (!code) errors.code = 'Enter a coupon code.';
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    errors.value = 'Enter a whole number greater than zero.';
  } else if (values.discount_type === 'percent' && parsedValue > 100) {
    errors.value = 'A percentage must be between 1 and 100.';
  }

  if (!isOptionalInteger(values.min_subtotal_ngn, 0, true)) {
    errors.min_subtotal_ngn = 'Enter a whole naira amount of zero or more.';
  }
  if (
    values.max_discount_ngn.trim()
    && values.discount_type !== 'percent'
  ) {
    errors.max_discount_ngn = 'A maximum discount is only available for percentage coupons.';
  } else if (!isOptionalInteger(values.max_discount_ngn, 0, true)) {
    errors.max_discount_ngn = 'Enter a whole naira amount of zero or more.';
  }
  if (!isOptionalInteger(values.max_redemptions, 0)) {
    errors.max_redemptions = 'Enter a whole number of zero or more.';
  }

  const startsAt = toLagosIso(values.starts_at);
  const expiresAt = toLagosIso(values.expires_at);
  if (values.starts_at && !startsAt) errors.starts_at = 'Enter a valid start date and time.';
  if (values.expires_at && !expiresAt) errors.expires_at = 'Enter a valid expiry date and time.';
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
    errors.expires_at = 'Expiry must be after the start date.';
  }

  return errors;
}
