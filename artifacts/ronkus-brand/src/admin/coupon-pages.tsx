import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  deleteCouponIfUnused,
  getWhatsAppSetting,
  listCoupons,
  saveCoupon,
  saveWhatsAppNumber,
  type Coupon,
  type CouponWrite,
} from './admin-api';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminNairaInput,
  AdminNumberInput,
  AdminPageHeader,
  AdminSelect,
  AdminToggle,
  AdminTextarea,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from './admin-components';
import {
  formatNaira,
  formatLagosDateTime,
  formatReadableLagosDateTime,
  normalizeWhatsAppNumber,
  parseNaira,
  parseWholeNumber,
  toLagosDateTimeInput,
  toLagosIso,
  validateCouponForm,
  validateWhatsAppNumber,
  type CouponFieldErrors,
  type CouponFormValues,
} from './helpers';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function initialCouponValues(coupon: Coupon | null): CouponFormValues {
  return {
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    discount_type: coupon?.discount_type ?? 'percent',
    value: coupon ? String(coupon.value) : '',
    min_subtotal_ngn: coupon ? String(coupon.min_subtotal_ngn) : '0',
    max_discount_ngn: coupon?.max_discount_ngn == null ? '' : String(coupon.max_discount_ngn),
    starts_at: toLagosDateTimeInput(coupon?.starts_at ?? null),
    expires_at: toLagosDateTimeInput(coupon?.expires_at ?? null),
    max_redemptions: coupon?.max_redemptions == null ? '' : String(coupon.max_redemptions),
    is_active: coupon?.is_active ?? true,
  };
}

function CouponForm({ initial, onSave, onCancel }: {
  initial: Coupon | null;
  onSave: (values: CouponWrite, id?: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState(() => initialCouponValues(initial));
  const [errors, setErrors] = useState<CouponFieldErrors>({});
  const [saving, setSaving] = useState(false);

  const change = <Key extends keyof CouponFormValues>(key: Key, value: CouponFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const generateCode = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    change('code', `RONKUS-${suffix}`);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = validateCouponForm(values);
    if (
      initial
      && values.max_redemptions.trim()
      && (parseWholeNumber(values.max_redemptions) ?? 0) < initial.redemption_count
    ) {
      validationErrors.max_redemptions = 'The limit cannot be lower than times already used.';
    }
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    const minimum = values.min_subtotal_ngn.trim() ? parseNaira(values.min_subtotal_ngn) : 0;
    const maximumDiscount = values.max_discount_ngn.trim() ? parseNaira(values.max_discount_ngn) : null;
    const maxRedemptions = values.max_redemptions.trim() ? parseWholeNumber(values.max_redemptions) : null;
    const startsAt = toLagosIso(values.starts_at);
    const expiresAt = toLagosIso(values.expires_at);
    const parsedValue = parseWholeNumber(values.value);
    if (
      minimum === null
      || parsedValue === null
      || (values.max_redemptions.trim() && maxRedemptions === null)
      || (values.max_discount_ngn.trim() && maximumDiscount === null)
    ) {
      toast.error('Enter valid whole-naira amounts.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        code: values.code.trim().toUpperCase(),
        description: values.description.trim() || null,
        discount_type: values.discount_type,
        value: parsedValue,
        min_subtotal_ngn: minimum,
        max_discount_ngn: values.discount_type === 'percent' ? maximumDiscount : null,
        starts_at: startsAt,
        expires_at: expiresAt,
        max_redemptions: maxRedemptions,
        is_active: values.is_active,
      }, initial?.id);
      if (!initial) {
        setValues(initialCouponValues(null));
        setErrors({});
      }
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="admin-form-grid admin-form-grid-wide admin-coupon-form-grid">
        <div className="admin-code-field">
          <AdminInput
            id={`coupon-code-${initial?.id ?? 'new'}`}
            label="Coupon code"
            value={values.code}
            onChange={(value) => change('code', value.toUpperCase())}
            autoCapitalize="characters"
            required
            error={errors.code}
          />
          {!initial && (
            <AdminButton type="button" variant="secondary" onClick={generateCode}>Generate code</AdminButton>
          )}
        </div>
        <AdminSelect
          id={`coupon-type-${initial?.id ?? 'new'}`}
          label="Type of discount"
          value={values.discount_type}
          onChange={(value) => {
            const type = value === 'fixed' ? 'fixed' : 'percent';
            setValues((current) => ({
              ...current,
              discount_type: type,
              max_discount_ngn: type === 'fixed' ? '' : current.max_discount_ngn,
            }));
            setErrors((current) => ({ ...current, discount_type: undefined, max_discount_ngn: undefined }));
          }}
          options={[
            { value: 'percent', label: 'Percentage (%)' },
            { value: 'fixed', label: 'Fixed amount (₦)' },
          ]}
        />
        <AdminNumberInput
          id={`coupon-value-${initial?.id ?? 'new'}`}
          label="Discount amount"
          value={values.value}
          onChange={(value) => change('value', value)}
          min={1}
          max={values.discount_type === 'percent' ? 100 : undefined}
          error={errors.value}
          required
        />
        <AdminTextarea
          id={`coupon-description-${initial?.id ?? 'new'}`}
          label="Description (optional)"
          value={values.description}
          onChange={(value) => change('description', value)}
          rows={2}
        />
        <AdminNairaInput
          id={`coupon-minimum-${initial?.id ?? 'new'}`}
          label="Minimum order amount"
          value={values.min_subtotal_ngn}
          onChange={(value) => change('min_subtotal_ngn', value)}
          error={errors.min_subtotal_ngn}
          hint="Enter 0 for no minimum."
        />
        {values.discount_type === 'percent' && (
          <AdminNairaInput
            id={`coupon-maximum-${initial?.id ?? 'new'}`}
            label="Biggest discount (₦)"
            value={values.max_discount_ngn}
            onChange={(value) => change('max_discount_ngn', value)}
            error={errors.max_discount_ngn}
          />
        )}
        <AdminInput
          id={`coupon-starts-${initial?.id ?? 'new'}`}
          label="Starts at"
          type="datetime-local"
          value={values.starts_at}
          onChange={(value) => change('starts_at', value)}
          error={errors.starts_at}
          hint={formatReadableLagosDateTime(toLagosIso(values.starts_at), 'Starts')}
        />
        <AdminInput
          id={`coupon-expires-${initial?.id ?? 'new'}`}
          label="Ends at"
          type="datetime-local"
          value={values.expires_at}
          onChange={(value) => change('expires_at', value)}
          error={errors.expires_at}
          hint={formatReadableLagosDateTime(toLagosIso(values.expires_at), 'Ends')}
        />
        <AdminNumberInput
          id={`coupon-redemptions-${initial?.id ?? 'new'}`}
          label="Times it can be used"
          value={values.max_redemptions}
          onChange={(value) => change('max_redemptions', value)}
          min={0}
          error={errors.max_redemptions}
          hint="Leave blank for no limit."
        />
        {initial && (
          <div className="admin-field">
            <span className="admin-field-label">Times used</span>
            <p className="admin-readonly-value">{initial.redemption_count}</p>
          </div>
        )}
        <AdminToggle
          id={`coupon-active-${initial?.id ?? 'new'}`}
          label={values.is_active ? 'Active' : 'Inactive'}
          checked={values.is_active}
          onChange={(value) => change('is_active', value)}
        />
      </div>
      <div className="admin-form-actions">
        <AdminButton type="submit" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save coupon' : 'Create coupon'}</AdminButton>
        {onCancel && <AdminButton type="button" variant="secondary" onClick={onCancel}>Cancel</AdminButton>}
      </div>
    </form>
  );
}

export function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCoupons(await listCoupons());
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (values: CouponWrite, id?: string) => {
    await saveCoupon(values, id);
    toast.success(id ? 'Coupon saved.' : 'Coupon created.');
    setEditingId(null);
    await refresh();
  };

  return (
    <div className="admin-page">
      <AdminPageHeader title="Coupons" description="Create and manage discount codes." />
      <AdminCard>
        <h2>Create a coupon</h2>
        <CouponForm initial={null} onSave={save} />
      </AdminCard>
      {loading && !coupons ? <LoadingState label="Loading coupons…" /> : null}
      {coupons?.length === 0 && <EmptyState>No coupons yet.</EmptyState>}
      {coupons?.map((coupon) => (
        <AdminCard key={coupon.id}>
          <div className="admin-card-heading">
            <div>
              <h2>{coupon.code}</h2>
              <p>{coupon.discount_type === 'percent' ? `${coupon.value}% off` : `${formatNaira(coupon.value)} off`} · Used {coupon.redemption_count} times</p>
            </div>
            <span className={`admin-status ${coupon.is_active ? 'is-active' : ''}`}>{coupon.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <dl className="admin-detail-grid">
            <div><dt>Starts at</dt><dd>{formatLagosDateTime(coupon.starts_at)}</dd></div>
            <div><dt>Ends at</dt><dd>{formatLagosDateTime(coupon.expires_at)}</dd></div>
            <div><dt>Minimum order</dt><dd>{formatNaira(coupon.min_subtotal_ngn)}</dd></div>
            <div><dt>Use limit</dt><dd>{coupon.max_redemptions ?? 'No limit'}</dd></div>
          </dl>
          {editingId === coupon.id ? (
            <CouponForm initial={coupon} onSave={save} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="admin-form-actions">
              <AdminButton type="button" variant="secondary" onClick={() => setEditingId(coupon.id)}>Edit</AdminButton>
              {coupon.redemption_count > 0 ? (
                <span className="admin-inline-note">Used coupons can be deactivated, not deleted.</span>
              ) : (
                <ConfirmDialog
                  label={`Delete ${coupon.code}?`}
                  message="This permanently deletes a coupon that has not been used."
                  confirmLabel="Delete coupon"
                  onConfirm={async () => {
                    await deleteCouponIfUnused(coupon.id);
                    toast.success('Coupon deleted.');
                    await refresh();
                  }}
                >
                  <AdminButton type="button" variant="danger">Delete</AdminButton>
                </ConfirmDialog>
              )}
            </div>
          )}
        </AdminCard>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getWhatsAppSetting().then((setting) => {
      if (!active) return;
      const value = setting?.value;
      setNumber(typeof value === 'string' ? value : '');
    }).catch((loadFailure: unknown) => {
      if (active) setLoadError(errorText(loadFailure));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const normalizedNumber = normalizeWhatsAppNumber(number);
  const numberError = error ?? (number ? validateWhatsAppNumber(number) ?? undefined : undefined);
  const previewHref = numberError || !number ? undefined : `https://wa.me/${normalizedNumber}`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateWhatsAppNumber(number);
    setError(validationError ?? undefined);
    if (validationError) return;
    setSaving(true);
    try {
      await saveWhatsAppNumber(normalizedNumber);
      toast.success('WhatsApp number saved.');
    } catch (saveError) {
      toast.error(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <AdminPageHeader title="Settings" description="Update your WhatsApp number." />
      <AdminCard>
        <h2>WhatsApp number</h2>
        {loading ? <LoadingState label="Loading store settings…" /> : null}
        {loadError && <p className="admin-alert" role="alert">{loadError}</p>}
        {!loading && !loadError && (
          <form className="admin-form" onSubmit={(event) => void submit(event)} noValidate>
            <AdminInput
              id="whatsapp-number"
              label="WhatsApp number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={number}
              showHintWithError
              hint={number ? `Will be saved as ${normalizedNumber}` : undefined}
              onChange={(value) => {
                setNumber(value);
                setError(undefined);
              }}
              error={numberError}
              required
            />
            <div className="admin-form-actions">
              <AdminButton type="submit" disabled={saving || loading}>{saving ? 'Saving…' : 'Save number'}</AdminButton>
              {previewHref
                ? <a className="admin-button admin-button-secondary" href={previewHref} target="_blank" rel="noreferrer">Test WhatsApp link</a>
                : null}
            </div>
          </form>
        )}
      </AdminCard>
    </div>
  );
}
