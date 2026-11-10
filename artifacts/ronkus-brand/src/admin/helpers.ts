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

export type ProductFormValues = {
  name: string;
  slug: string;
  description: string;
  price_ngn: string;
  price_suffix: string;
  category_id: string;
  subcategory_id: string;
  audience: 'male' | 'female' | 'unisex';
  availability: 'ready_to_order' | 'made_to_order' | 'out_of_stock';
  is_active: boolean;
  min_order_qty: string;
  max_order_qty: string;
  lead_time_days_min: string;
  lead_time_days_max: string;
  lead_time_note: string;
  size_guide_note: string;
};

export type ProductFieldErrors = Partial<Record<keyof ProductFormValues, string>>;

export function isInactivityExpired(lastActivity: number, now: number, limitMs: number): boolean {
  return now >= lastActivity && now - lastActivity >= limitMs;
}

export function shouldBlockForSignedIn(
  verifiedUserId: string | null,
  sessionUserId: string,
  isAdmin: boolean,
): boolean {
  return !isAdmin || verifiedUserId !== sessionUserId;
}

export type PromoBannerFormValues = {
  mode: 'flyer' | 'message';
  title: string;
  message: string;
  image_alt: string;
  coupon_id: string;
  link_url: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export type PromoBannerFieldErrors = Partial<Record<keyof PromoBannerFormValues | 'image', string>>;

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

export function uniqueSlugFromName(name: string, existingSlugs: Iterable<string>): string {
  const base = slugify(name) || 'item';
  const existing = new Set(Array.from(existingSlugs, (slug) => slug.toLowerCase()));
  if (!existing.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
}

export function validateProductForm(values: ProductFormValues): ProductFieldErrors {
  const maxDatabaseInteger = 2_147_483_647;
  const errors: ProductFieldErrors = {};
  const name = values.name.trim();
  const price = parseNaira(values.price_ngn);
  const minimumQuantity = parseWholeNumber(values.min_order_qty);
  const maximumQuantity = values.max_order_qty.trim()
    ? parseWholeNumber(values.max_order_qty)
    : null;
  const minimumLeadTime = values.lead_time_days_min.trim()
    ? parseWholeNumber(values.lead_time_days_min)
    : null;
  const maximumLeadTime = values.lead_time_days_max.trim()
    ? parseWholeNumber(values.lead_time_days_max)
    : null;

  if (!name) errors.name = 'Enter a product name.';
  if (price === null || price < 0 || price > maxDatabaseInteger) {
    errors.price_ngn = 'Enter a whole naira amount of zero or more.';
  }
  if (values.price_suffix.trim().length > 40) {
    errors.price_suffix = 'Keep the price suffix to 40 characters or fewer.';
  }
  if (!values.category_id) errors.category_id = 'Choose a category.';
  if (minimumQuantity === null || minimumQuantity < 1 || minimumQuantity > maxDatabaseInteger) {
    errors.min_order_qty = 'Enter a whole number of at least 1.';
  }
  if (
    values.max_order_qty.trim()
    && (maximumQuantity === null || maximumQuantity > maxDatabaseInteger)
  ) {
    errors.max_order_qty = 'Enter a whole number of zero or more.';
  } else if (
    maximumQuantity !== null
    && minimumQuantity !== null
    && maximumQuantity < minimumQuantity
  ) {
    errors.max_order_qty = 'Maximum quantity must be at least the minimum quantity.';
  }
  if (
    values.lead_time_days_min.trim()
    && (minimumLeadTime === null || minimumLeadTime < 0 || minimumLeadTime > maxDatabaseInteger)
  ) {
    errors.lead_time_days_min = 'Enter a whole number of zero or more.';
  }
  if (
    values.lead_time_days_max.trim()
    && (maximumLeadTime === null || maximumLeadTime < 0 || maximumLeadTime > maxDatabaseInteger)
  ) {
    errors.lead_time_days_max = 'Enter a whole number of zero or more.';
  } else if (
    minimumLeadTime !== null
    && maximumLeadTime !== null
    && maximumLeadTime < minimumLeadTime
  ) {
    errors.lead_time_days_max = 'Maximum lead time must be at least the minimum lead time.';
  }

  return errors;
}

export function validateProductImageFile(file: { type: string; size: number }): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Choose a JPEG, PNG, or WebP image.';
  }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > 5 * 1024 * 1024) {
    return 'Choose an image no larger than 5 MB.';
  }
  return null;
}

export function safeProductImageFilename(filename: string): string {
  const leafName = filename.split(/[\\/]/).pop() ?? '';
  const extensionMatch = /\.([a-z0-9]+)$/i.exec(leafName);
  const extension = extensionMatch?.[1].toLowerCase() ?? 'jpg';
  const basename = extensionMatch ? leafName.slice(0, -extensionMatch[0].length) : leafName;
  return `${slugify(basename) || 'photo'}.${extension}`;
}

export function buildProductImageStoragePath(
  productId: string,
  filename: string,
  timestamp = Date.now(),
): string {
  const safeTimestamp = Number.isSafeInteger(timestamp) && timestamp >= 0
    ? timestamp
    : Date.now();
  return `products/${productId}/${safeTimestamp}-${safeProductImageFilename(filename)}`;
}

export function buildCategoryImageStoragePath(
  categoryId: string,
  filename: string,
  timestamp = Date.now(),
): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(categoryId)) {
    throw new Error('The category could not be found.');
  }
  const safeTimestamp = Number.isSafeInteger(timestamp) && timestamp >= 0
    ? timestamp
    : Date.now();
  const name = safeProductImageFilename(filename).replace(/\.[^.]+$/, '');
  return `categories/${categoryId}/${safeTimestamp}-${name}.webp`;
}

export function buildCategoryImagePublicUrl(publicBucketUrl: string, storagePath: string): string {
  const safePath = categoryImageStoragePathToDelete(storagePath);
  if (!safePath || safePath !== storagePath) {
    throw new Error('The category photo path is not valid.');
  }
  const url = new URL(publicBucketUrl);
  const bucketPath = '/storage/v1/object/public/product-images/';
  const bucketIndex = url.pathname.indexOf(bucketPath);
  if (bucketIndex < 0) throw new Error('The category photo link could not be created.');
  url.pathname = `${url.pathname.slice(0, bucketIndex)}${bucketPath}${storagePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function categoryImageStoragePathToDelete(
  imagePath: string,
  expectedOrigin?: string,
): string | null {
  let objectPath = imagePath;
  if (/^https?:\/\//i.test(imagePath)) {
    try {
      const url = new URL(imagePath);
      const prefix = '/storage/v1/object/public/product-images/';
      if (!expectedOrigin || url.origin !== expectedOrigin || !url.pathname.startsWith(prefix)) return null;
      objectPath = url.pathname.slice(prefix.length);
    } catch {
      return null;
    }
  }
  let decodedPath: string;
  try {
    decodedPath = objectPath.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
  const parts = decodedPath.split('/');
  if (
    parts.length !== 3
    || parts[0] !== 'categories'
    || !/^[a-zA-Z0-9_-]+$/.test(parts[1])
    || !/^[a-zA-Z0-9._-]+$/.test(parts[2])
    || parts.some((part) => part === '.' || part === '..')
  ) {
    return null;
  }
  return decodedPath;
}

export function keepMobileMenuOpenAfterNavigation(
  isOpen: boolean,
  navigationSucceeded: boolean,
): boolean {
  return isOpen && !navigationSucceeded;
}

export function parseNaira(value: string): number | null {
  const normalized = value.trim().replace(/[,\s₦]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseWholeNumber(
  text: string,
  options: { allowNegative?: boolean } = {},
): number | null {
  const normalized = text.trim();
  const pattern = options.allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function formatNaira(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '';
  return `₦${new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export type AnalyticsDatePreset = 'today' | 'last7Days' | 'last30Days' | 'thisMonth' | 'custom';

export type AnalyticsDateRange = {
  from: string;
  to: string;
};

export type SalesChartDatum = {
  day: string;
  orderCount: number;
  revenueNgn: number;
};

function getLagosDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getAnalyticsDateRange(
  preset: AnalyticsDatePreset,
  now: Date = new Date(),
  customFrom = '',
  customTo = '',
): AnalyticsDateRange {
  if (preset === 'custom') return { from: customFrom, to: customTo };

  const today = getLagosDate(now);
  switch (preset) {
    case 'last7Days':
      return { from: shiftDate(today, -6), to: today };
    case 'last30Days':
      return { from: shiftDate(today, -29), to: today };
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'today':
      return { from: today, to: today };
  }
}

export function isValidAnalyticsDateRange(from: string, to: string): boolean {
  if (!isDateOnly(from) || !isDateOnly(to) || to < from) return false;
  const dayDifference = (
    new Date(`${to}T00:00:00.000Z`).getTime()
    - new Date(`${from}T00:00:00.000Z`).getTime()
  ) / 86_400_000;
  return dayDifference <= 366;
}

export function buildSalesChartData(
  rows: readonly SalesChartDatum[],
  from: string,
  to: string,
): SalesChartDatum[] {
  if (!isValidAnalyticsDateRange(from, to)) return [];
  const rowsByDay = new Map(rows.map((row) => [row.day, row]));
  const result: SalesChartDatum[] = [];
  for (let day = from; day <= to; day = shiftDate(day, 1)) {
    const row = rowsByDay.get(day);
    result.push({
      day,
      orderCount: row && Number.isFinite(row.orderCount) ? row.orderCount : 0,
      revenueNgn: row && Number.isFinite(row.revenueNgn) ? row.revenueNgn : 0,
    });
  }
  return result;
}

export function normalizeWhatsAppNumber(input: string): string {
  const normalized = input
    .trim()
    .replace(/[\s.\-()[\]{}]/g, '')
    .replace(/^\+/, '')
    .replace(/^00/, '');
  return /^0\d{10}$/.test(normalized) ? `234${normalized.slice(1)}` : normalized;
}

export function validateWhatsAppNumber(input: string): string | null {
  const normalized = normalizeWhatsAppNumber(input);
  if (!normalized) return 'Enter a WhatsApp number.';
  if (!/^\d+$/.test(normalized)) {
    return 'Enter 8 to 15 digits, starting with 1 to 9.';
  }
  if (normalized.startsWith('2340')) {
    return 'Remove the 0 after 234 (for example 2348160309308).';
  }
  if (normalized.length < 8 || normalized.length > 15 || !/^[1-9]/.test(normalized)) {
    return 'Enter 8 to 15 digits, starting with 1 to 9.';
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

export function formatLagosDateTime(value: string | null): string {
  if (!value) return 'No date set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatReadableLagosDateTime(value: string | null, label: 'Starts' | 'Ends'): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  const dayPeriod = part('dayPeriod').toUpperCase();
  return `${label} ${part('weekday')} ${part('day')} ${part('month')} ${part('year')}, ${part('hour')}:${part('minute')} ${dayPeriod}`;
}

export function validatePromoLinkUrl(value: string): string | null {
  const url = value.trim();
  if (!url || url === '/' || /^\/[^/]/.test(url) || /^https:\/\//.test(url)) return null;
  return 'Use /, a path beginning with one /, or a full https:// URL.';
}

export function validatePromoBannerForm(
  values: PromoBannerFormValues,
  hasFlyerImage: boolean,
): PromoBannerFieldErrors {
  const errors: PromoBannerFieldErrors = {};
  if (values.mode === 'flyer') {
    if (!hasFlyerImage) errors.image = 'Choose a flyer image.';
    if (Array.from(values.image_alt).length > 160) errors.image_alt = 'Keep image alt text to 160 characters or fewer.';
  } else {
    if (!values.title.trim()) errors.title = 'Enter a banner title.';
    if (Array.from(values.title).length > 80) errors.title = 'Keep the title to 80 characters or fewer.';
    if (Array.from(values.message).length > 200) errors.message = 'Keep the message to 200 characters or fewer.';
  }
  const linkError = validatePromoLinkUrl(values.link_url);
  if (linkError) errors.link_url = linkError;

  const startsAt = toLagosIso(values.starts_at);
  const endsAt = toLagosIso(values.ends_at);
  if (values.starts_at && !startsAt) errors.starts_at = 'Enter a valid start date and time.';
  if (values.ends_at && !endsAt) errors.ends_at = 'Enter a valid end date and time.';
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    errors.ends_at = 'End date and time must be after the start.';
  }
  return errors;
}

export function getPromoBannerStatus(
  isActive: boolean,
  startsAt: string | null,
  endsAt: string | null,
  now: Date = new Date(),
): 'Live now' | 'Scheduled' | 'Expired' | 'Inactive' {
  if (!isActive) return 'Inactive';
  if (startsAt && new Date(startsAt).getTime() > now.getTime()) return 'Scheduled';
  if (endsAt && new Date(endsAt).getTime() <= now.getTime()) return 'Expired';
  return 'Live now';
}

export function getQualifyingPromoBanners<
  Banner extends {
    created_at: string;
    coupon_id: string | null;
    ends_at: string | null;
    is_active: boolean;
    starts_at: string | null;
  },
  CouponRecord extends {
    expires_at: string | null;
    id: string;
    is_active: boolean;
    max_redemptions: number | null;
    redemption_count: number;
    starts_at: string | null;
  },
>(
  banners: readonly Banner[],
  coupons: readonly CouponRecord[],
  now: Date = new Date(),
): Banner[] {
  const couponsById = new Map(coupons.map((coupon) => [coupon.id, coupon]));
  return banners
    .filter((banner) => {
      if (getPromoBannerStatus(banner.is_active, banner.starts_at, banner.ends_at, now) !== 'Live now') {
        return false;
      }
      if (!banner.coupon_id) return true;
      const coupon = couponsById.get(banner.coupon_id);
      if (!coupon?.is_active) return false;
      if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now.getTime()) return false;
      if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now.getTime()) return false;
      return coupon.max_redemptions === null || coupon.redemption_count < coupon.max_redemptions;
    })
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());
}

export function renumberFeaturedPositions<T extends { id: string }>(
  products: readonly T[],
): (T & { featured_position: number })[] {
  return products.map((product, index) => ({ ...product, featured_position: index + 1 }));
}

export function buildPromoFlyerStoragePath(filename: string, identifier = String(Date.now())): string {
  const safeIdentifier = identifier.replace(/[^a-zA-Z0-9_-]/g, '') || String(Date.now());
  return `promotions/${safeIdentifier}-${safeProductImageFilename(filename)}`;
}

function isOptionalInteger(value: string, minimum: number, asNaira = false): boolean {
  if (!value.trim()) return true;
  const parsed = asNaira ? parseNaira(value) : parseWholeNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= minimum;
}

export function validateCouponForm(values: CouponFormValues): CouponFieldErrors {
  const errors: CouponFieldErrors = {};
  const code = values.code.trim();
  const parsedValue = parseWholeNumber(values.value);

  if (!code) errors.code = 'Enter a coupon code.';
  if (parsedValue === null || parsedValue < 1) {
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
