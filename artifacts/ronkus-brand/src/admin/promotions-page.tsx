import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  deactivatePromoBanner,
  deletePromoBanner,
  getActivePromoBannerNow,
  getPromoFlyerUrl,
  listCoupons,
  listPromoBanners,
  removePromoFlyer,
  savePromoBanner,
  uploadPromoFlyer,
  type Coupon,
  type PromoBanner,
  type PromoBannerWrite,
} from './admin-api';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
  AdminToggle,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from './admin-components';
import {
  formatLagosDateTime,
  getPromoBannerStatus,
  getQualifyingPromoBanners,
  toLagosDateTimeInput,
  toLagosIso,
  validateProductImageFile,
  validatePromoBannerForm,
  type PromoBannerFieldErrors,
  type PromoBannerFormValues,
} from './helpers';
import { resizeProductPhoto } from './image-helpers';

type CurrentPromoBanner = NonNullable<Awaited<ReturnType<typeof getActivePromoBannerNow>>>;

const emptyValues: PromoBannerFormValues = {
  mode: 'message',
  title: '',
  message: '',
  image_alt: '',
  coupon_id: '',
  link_url: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function bannerValues(banner: PromoBanner | null): PromoBannerFormValues {
  return {
    mode: banner?.mode ?? 'message',
    title: banner?.title ?? '',
    message: banner?.message ?? '',
    image_alt: banner?.image_alt ?? '',
    coupon_id: banner?.coupon_id ?? '',
    link_url: banner?.link_url ?? '',
    starts_at: toLagosDateTimeInput(banner?.starts_at ?? null),
    ends_at: toLagosDateTimeInput(banner?.ends_at ?? null),
    is_active: banner?.is_active ?? true,
  };
}

function ActiveBannerContents({ banner }: { banner: CurrentPromoBanner }) {
  return (
    <div className="admin-promo-current-content">
      {banner.mode === 'flyer' && banner.image_path ? (
        <img src={getPromoFlyerUrl(banner.image_path)} alt={banner.image_alt ?? ''} />
      ) : (
        <div>
          <strong>{banner.title ?? 'Promotion'}</strong>
          {banner.message && <p>{banner.message}</p>}
        </div>
      )}
      {banner.coupon_code && (
        <p>Coupon: <strong>{banner.coupon_code}</strong>{banner.coupon_description ? ` — ${banner.coupon_description}` : ''}</p>
      )}
      {banner.link_url && <p>Link: <span>{banner.link_url}</span></p>}
      <p>Window: {formatLagosDateTime(banner.starts_at)} – {formatLagosDateTime(banner.ends_at)}</p>
    </div>
  );
}

function PromoBannerForm({
  initial,
  coupons,
  onSave,
  onCancel,
  onSaved,
}: {
  initial: PromoBanner | null;
  coupons: Coupon[];
  onSave: (values: PromoBannerWrite, id: string | undefined, flyer: File | null) => Promise<void>;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState(() => bannerValues(initial));
  const [errors, setErrors] = useState<PromoBannerFieldErrors>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const originalImagePath = initial?.image_path ?? null;

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const change = <Key extends keyof PromoBannerFormValues>(
    key: Key,
    value: PromoBannerFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) {
      setFile(null);
      setFileError(null);
      setErrors((current) => ({ ...current, image: undefined }));
      return;
    }
    const validationError = validateProductImageFile(nextFile);
    if (validationError) {
      setFile(null);
      setFileError(validationError);
      setErrors((current) => ({ ...current, image: validationError }));
      event.target.value = '';
      return;
    }
    setFile(nextFile);
    setFileError(null);
    setErrors((current) => ({ ...current, image: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validatePromoBannerForm(
      values,
      Boolean(file || (values.mode === 'flyer' && originalImagePath)),
    );
    if (values.mode === 'flyer' && fileError) nextErrors.image = fileError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const write: PromoBannerWrite = {
      mode: values.mode,
      title: values.mode === 'message' ? values.title.trim() : null,
      message: values.mode === 'message' && values.message.trim() ? values.message.trim() : null,
      coupon_id: values.coupon_id || null,
      image_path: values.mode === 'flyer' ? originalImagePath : null,
      image_alt: values.mode === 'flyer' && values.image_alt.trim() ? values.image_alt.trim() : null,
      link_url: values.link_url.trim() || null,
      starts_at: toLagosIso(values.starts_at),
      ends_at: toLagosIso(values.ends_at),
      is_active: values.is_active,
    };
    setSaving(true);
    try {
      await onSave(write, initial?.id, file);
      setFile(null);
      setFileError(null);
      if (!initial) setValues(emptyValues);
      onSaved();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const couponOptions = useMemo(() => {
    const activeCoupons = coupons.filter((coupon) => coupon.is_active);
    const oldInactiveCoupon = initial?.coupon_id
      ? coupons.find((coupon) => coupon.id === initial.coupon_id && !coupon.is_active)
      : undefined;
    const options = [
      { value: '', label: 'No coupon' },
      ...activeCoupons.map((coupon) => ({
        value: coupon.id,
        label: `${coupon.code} — ${coupon.description || 'No description'}`,
      })),
    ];
    if (oldInactiveCoupon) {
      options.push({
        value: oldInactiveCoupon.id,
        label: `${oldInactiveCoupon.code} — ${oldInactiveCoupon.description || 'No description'} (inactive)`,
      });
    }
    return options;
  }, [coupons, initial]);

  const imagePath = values.mode === 'flyer' ? originalImagePath : null;
  const previewImage = previewUrl ?? (imagePath ? getPromoFlyerUrl(imagePath) : null);

  return (
    <form className="admin-form" onSubmit={(event) => void submit(event)} noValidate>
      <div className="admin-form-grid">
        <AdminSelect
          id={`promo-mode-${initial?.id ?? 'new'}`}
          label="Banner mode"
          value={values.mode}
          onChange={(value) => {
            if (value === 'flyer' || value === 'message') change('mode', value);
          }}
          options={[
            { value: 'message', label: 'Message' },
            { value: 'flyer', label: 'Flyer' },
          ]}
        />
        <AdminSelect
          id={`promo-coupon-${initial?.id ?? 'new'}`}
          label="Coupon link (optional)"
          value={values.coupon_id}
          onChange={(value) => change('coupon_id', value)}
          options={couponOptions}
        />
      </div>

      {values.mode === 'message' ? (
        <>
          <AdminInput
            id={`promo-title-${initial?.id ?? 'new'}`}
            label="Title"
            value={values.title}
            onChange={(value) => change('title', value)}
            maxLength={160}
            error={errors.title}
          />
          <AdminTextarea
            id={`promo-message-${initial?.id ?? 'new'}`}
            label="Message (optional)"
            value={values.message}
            onChange={(value) => change('message', value)}
            maxLength={400}
            error={errors.message}
          />
        </>
      ) : (
        <>
          <div className="admin-field">
            <label htmlFor={`promo-image-${initial?.id ?? 'new'}`}>Flyer image</label>
            <input
              id={`promo-image-${initial?.id ?? 'new'}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-invalid={Boolean(errors.image)}
              aria-describedby={errors.image ? `promo-image-error-${initial?.id ?? 'new'}` : undefined}
              onChange={handleFile}
              disabled={saving}
            />
            {errors.image && (
              <span id={`promo-image-error-${initial?.id ?? 'new'}`} className="admin-field-error">
                {errors.image}
              </span>
            )}
            {originalImagePath && !file && <span className="admin-field-hint">Choose a new file to replace the current flyer.</span>}
          </div>
          <AdminInput
            id={`promo-image-alt-${initial?.id ?? 'new'}`}
            label="Flyer image alt text (optional)"
            value={values.image_alt}
            onChange={(value) => change('image_alt', value)}
            maxLength={320}
            error={errors.image_alt}
          />
        </>
      )}

      <AdminInput
        id={`promo-link-${initial?.id ?? 'new'}`}
        label="Link URL (optional)"
        value={values.link_url}
        onChange={(value) => change('link_url', value)}
        error={errors.link_url}
        hint="Use /, a path beginning with one /, or a full https:// URL."
      />
      <div className="admin-form-grid">
        <AdminInput
          id={`promo-start-${initial?.id ?? 'new'}`}
          label="Starts at (Africa/Lagos, optional)"
          type="datetime-local"
          value={values.starts_at}
          onChange={(value) => change('starts_at', value)}
          error={errors.starts_at}
        />
        <AdminInput
          id={`promo-end-${initial?.id ?? 'new'}`}
          label="Ends at (Africa/Lagos, optional)"
          type="datetime-local"
          value={values.ends_at}
          onChange={(value) => change('ends_at', value)}
          error={errors.ends_at}
        />
      </div>
      <AdminToggle
        id={`promo-active-${initial?.id ?? 'new'}`}
        label="Active"
        checked={values.is_active}
        onChange={(checked) => change('is_active', checked)}
      />

      <div className="admin-promo-preview-wrap">
        <span className="admin-field-label">Live preview</span>
        <div className={`admin-promo-preview ${values.mode === 'flyer' ? 'is-flyer' : 'is-message'}`}>
          {values.mode === 'flyer' ? (
            previewImage ? (
              <img src={previewImage} alt={values.image_alt} />
            ) : (
              <p>Your flyer preview will appear here.</p>
            )
          ) : (
            <div>
              <strong>{values.title || 'Promotion title'}</strong>
              <p>{values.message || 'Your optional promotion message.'}</p>
              {values.coupon_id && (
                <span>{coupons.find((coupon) => coupon.id === values.coupon_id)?.code ?? 'Coupon'}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="admin-form-actions">
        <AdminButton type="submit" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save banner' : 'Create banner'}</AdminButton>
        {onCancel && <AdminButton type="button" variant="secondary" disabled={saving} onClick={onCancel}>Cancel</AdminButton>}
      </div>
    </form>
  );
}

export function PromotionsPage() {
  const [banners, setBanners] = useState<PromoBanner[] | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [currentBanner, setCurrentBanner] = useState<CurrentPromoBanner | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextBanners, nextCoupons, nextCurrent] = await Promise.all([
        listPromoBanners(),
        listCoupons(),
        getActivePromoBannerNow(),
      ]);
      setBanners(nextBanners);
      setCoupons(nextCoupons);
      setCurrentBanner(nextCurrent);
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (values: PromoBannerWrite, id: string | undefined, flyer: File | null) => {
    const oldPath = banners?.find((banner) => banner.id === id)?.image_path ?? null;
    let uploadedPath: string | null = null;
    try {
      if (flyer && values.mode === 'flyer') {
        uploadedPath = await uploadPromoFlyer(await resizeProductPhoto(flyer));
      }
      const write = {
        ...values,
        image_path: values.mode === 'flyer' ? uploadedPath ?? values.image_path : null,
      };
      await savePromoBanner(write, id);
      if (oldPath && oldPath !== write.image_path) await removePromoFlyer(oldPath);
      toast.success(id ? 'Promotional banner saved.' : 'Promotional banner created.');
    } catch (error) {
      if (uploadedPath) await removePromoFlyer(uploadedPath);
      throw error;
    } finally {
      await refresh();
    }
  };

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const qualifyingBanners = useMemo(
    () => getQualifyingPromoBanners(banners ?? [], coupons),
    [banners, coupons],
  );

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Promotions"
        description="Manage message banners and flyers shown by the storefront."
      />

      <AdminCard>
        <h2>Showing on the storefront right now</h2>
        {currentBanner ? (
          <ActiveBannerContents banner={currentBanner} />
        ) : (
          <EmptyState>Nothing is being shown right now.</EmptyState>
        )}
        {qualifyingBanners.length > 1 && (
          <p className="admin-note" role="status">
            {qualifyingBanners.length} banners qualify, but only one is shown at a time. The database
            function chooses the newest qualifying banner by created date (created_at DESC).
            {currentBanner && ` The current winner is ${currentBanner.title || currentBanner.mode} (${currentBanner.id}).`}
          </p>
        )}
      </AdminCard>

      <AdminCard>
        <h2>Create a banner</h2>
        <PromoBannerForm
          key="new-banner"
          initial={null}
          coupons={coupons}
          onSave={save}
          onSaved={() => undefined}
        />
      </AdminCard>

      {loadError && <div className="admin-alert" role="alert">{loadError}</div>}
      {loading && !banners ? <LoadingState label="Loading promotional banners…" /> : null}
      {banners?.length === 0 && <EmptyState>No promotional banners yet.</EmptyState>}
      {banners?.map((banner) => {
        const status = getPromoBannerStatus(banner.is_active, banner.starts_at, banner.ends_at);
        const coupon = coupons.find(({ id }) => id === banner.coupon_id);
        const isEditing = editingId === banner.id;
        return (
          <AdminCard key={banner.id} className="admin-promo-card">
            <div className="admin-card-heading">
              <div className="admin-promo-heading">
                {banner.mode === 'flyer' && banner.image_path && (
                  <img src={getPromoFlyerUrl(banner.image_path)} alt={banner.image_alt ?? ''} />
                )}
                <div>
                  <h2>{banner.title || (banner.mode === 'flyer' ? 'Flyer banner' : 'Untitled message')}</h2>
                  <p>{banner.mode === 'flyer' ? 'Flyer' : 'Message'}{coupon ? ` · ${coupon.code}` : ''}</p>
                </div>
              </div>
              <span className={`admin-status ${status === 'Live now' ? 'is-active' : ''}`}>{status}</span>
            </div>
            <dl className="admin-detail-grid">
              <div><dt>Starts</dt><dd>{formatLagosDateTime(banner.starts_at)}</dd></div>
              <div><dt>Ends</dt><dd>{formatLagosDateTime(banner.ends_at)}</dd></div>
            </dl>
            {banner.mode === 'message' && banner.message && <p>{banner.message}</p>}
            {isEditing ? (
              <PromoBannerForm
                key={banner.id}
                initial={banner}
                coupons={coupons}
                onSave={save}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
              />
            ) : (
              <div className="admin-form-actions">
                <AdminButton type="button" variant="secondary" disabled={busy} onClick={() => setEditingId(banner.id)}>
                  Edit
                </AdminButton>
                {banner.is_active && (
                  <AdminButton
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void runAction(
                      () => deactivatePromoBanner(banner.id),
                      'Promotional banner deactivated.',
                    )}
                  >
                    Deactivate
                  </AdminButton>
                )}
                <ConfirmDialog
                  label="Delete this promotional banner?"
                  message="This permanently deletes the banner. Its flyer file will be removed afterward when possible."
                  confirmLabel="Delete banner"
                  onConfirm={() => runAction(async () => {
                    await deletePromoBanner(banner.id);
                    if (banner.image_path) await removePromoFlyer(banner.image_path);
                  }, 'Promotional banner deleted.')}
                >
                  <AdminButton type="button" variant="danger" disabled={busy}>Delete</AdminButton>
                </ConfirmDialog>
              </div>
            )}
          </AdminCard>
        );
      })}
    </div>
  );
}
