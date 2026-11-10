import { useCallback, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type MouseEvent as ReactMouseEvent, type FormEvent, type SetStateAction } from 'react';
import { toast } from 'sonner';
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProductImageUrl,
  getProductConfiguration,
  listFeaturedProducts,
  listProductCategories,
  listProductImages,
  listProducts,
  listProductSubcategories,
  productHasOrders,
  publishProductWithFeaturedPosition,
  removeProductImage,
  saveProductImageMeta,
  saveProductImagePosition,
  setProductActive,
  swapProductImages,
  updateProduct,
  uploadProductImage,
  validateCustomFieldsWithDatabase,
  validateOptionsWithDatabase,
  type ProductImage,
  type ProductListFilters,
  type ProductWrite,
} from './admin-api';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminNairaInput,
  AdminNumberInput,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from './admin-components';
import {
  formatNaira,
  parseNaira,
  parseWholeNumber,
  slugify,
  validateProductImageFile,
  type ProductFieldErrors,
  type ProductFormValues,
} from './helpers';
import { resizeProductPhoto } from './image-helpers';
import {
  ProductConfigEditor,
  customFieldsToDraft,
  productOptionsToDraft,
} from './product-config-editor';
import {
  photoFailureNotice,
  planProductSave,
  validateWizardStep,
  type ProductWizardStep,
} from './product-workflow';
import {
  productConfigurationFromDraft,
  type CustomOrderDraft,
  type OptionGroupDraft,
} from './product-config';

type NavigateHandler = (event: ReactMouseEvent<HTMLAnchorElement>) => void;
type NavigateTo = (path: string) => void;
type DirtyChangeHandler = (dirty: boolean) => void;
type PendingPhoto = { file: File; altText?: string };

const pageSize = 25;
const emptyProductValues: ProductFormValues = {
  name: '',
  slug: '',
  description: '',
  price_ngn: '',
  price_suffix: '',
  category_id: '',
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
};
const emptyCustomOrder: CustomOrderDraft = {
  enabled: false,
  button_label: 'Request custom order',
  flow: 'whatsapp_quote',
  fee_ngn: '0',
  notice: '',
  needed_by_mode: 'off',
  fields: [],
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function productValues(product: ProductWrite): ProductFormValues {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    price_ngn: String(product.price_ngn),
    price_suffix: product.price_suffix ?? '',
    category_id: product.category_id,
    subcategory_id: product.subcategory_id ?? '',
    audience: product.audience,
    availability: product.availability,
    is_active: product.is_active,
    min_order_qty: String(product.min_order_qty),
    max_order_qty: product.max_order_qty === null ? '' : String(product.max_order_qty),
    lead_time_days_min: product.lead_time_days_min === null ? '' : String(product.lead_time_days_min),
    lead_time_days_max: product.lead_time_days_max === null ? '' : String(product.lead_time_days_max),
    lead_time_note: product.lead_time_note ?? '',
    size_guide_note: product.size_guide_note ?? '',
  };
}

function productWrite(values: ProductFormValues): ProductWrite {
  const optionalInteger = (value: string) => value.trim() ? parseWholeNumber(value) : null;
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description,
    price_ngn: parseNaira(values.price_ngn) ?? 0,
    price_suffix: values.price_suffix.trim() || null,
    category_id: values.category_id,
    subcategory_id: values.subcategory_id || null,
    audience: values.audience,
    availability: values.availability,
    is_active: values.is_active,
    min_order_qty: parseWholeNumber(values.min_order_qty) ?? 1,
    max_order_qty: optionalInteger(values.max_order_qty),
    lead_time_days_min: optionalInteger(values.lead_time_days_min),
    lead_time_days_max: optionalInteger(values.lead_time_days_max),
    lead_time_note: values.lead_time_note.trim() || null,
    size_guide_note: values.size_guide_note.trim() || null,
  };
}

const availabilityLabels = {
  ready_to_order: 'Ready to order',
  made_to_order: 'Made to order',
  out_of_stock: 'Out of stock',
} as const;

export function ProductsPage({ onNavigate }: { onNavigate: NavigateHandler }) {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<ProductListFilters>({
    search: '',
    categoryId: '',
    availability: '',
    active: null,
  });
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Awaited<ReturnType<typeof listProducts>>['items']>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRequest = useRef(0);

  useEffect(() => {
    let active = true;
    void listProductCategories()
      .then((result) => {
        if (active) setCategories(result);
      })
      .catch((error: unknown) => toast.error(errorText(error)));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const request = ++listRequest.current;
    setLoading(true);
    setLoadingMore(false);
    setItems([]);
    setTotalCount(0);
    void listProducts(filters, 0, pageSize)
      .then((result) => {
        if (!active || request !== listRequest.current) return;
        setItems(result.items);
        setTotalCount(result.totalCount);
      })
      .catch((error: unknown) => {
        if (active && request === listRequest.current) toast.error(errorText(error));
      })
      .finally(() => {
        if (active && request === listRequest.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters]);

  const loadMore = async () => {
    const request = listRequest.current;
    const from = items.length;
    setLoadingMore(true);
    try {
      const result = await listProducts(filters, from, pageSize);
      if (request !== listRequest.current) return;
      setItems((current) => [...current, ...result.items]);
      setTotalCount(result.totalCount);
    } catch (error) {
      if (request === listRequest.current) toast.error(errorText(error));
    } finally {
      if (request === listRequest.current) setLoadingMore(false);
    }
  };

  const updateFilter = <K extends keyof ProductListFilters>(key: K, value: ProductListFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="admin-page admin-products-page">
      <AdminPageHeader title="Products" description="Manage the products on your website.">
        <a className="admin-button admin-button-primary" href="/admin/products/new" onClick={onNavigate}>
          Add product
        </a>
      </AdminPageHeader>

      <AdminCard className="admin-product-filters">
        <form
          className="admin-product-filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            updateFilter('search', search.trim());
          }}
        >
          <AdminInput
            id="product-search"
            label="Search by name"
            type="search"
            value={search}
            onChange={setSearch}
          />
          <AdminSelect
            id="product-category-filter"
            label="Category"
            value={filters.categoryId ?? ''}
            onChange={(value) => updateFilter('categoryId', value)}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
          <AdminSelect
            id="product-availability-filter"
            label="Availability"
            value={filters.availability ?? ''}
            onChange={(value) => updateFilter('availability', value as ProductListFilters['availability'])}
            options={[
              { value: '', label: 'All availability' },
              { value: 'ready_to_order', label: availabilityLabels.ready_to_order },
              { value: 'made_to_order', label: availabilityLabels.made_to_order },
              { value: 'out_of_stock', label: availabilityLabels.out_of_stock },
            ]}
          />
          <AdminSelect
            id="product-visibility-filter"
            label="Visibility"
            value={filters.active === null ? '' : filters.active ? 'active' : 'hidden'}
            onChange={(value) => updateFilter('active', value === '' ? null : value === 'active')}
            options={[
              { value: '', label: 'Visible and hidden' },
              { value: 'active', label: 'Visible' },
              { value: 'hidden', label: 'Hidden' },
            ]}
          />
          <AdminButton type="submit" variant="secondary">Search</AdminButton>
        </form>
      </AdminCard>

      <p className="admin-product-summary" role="status">
        {loading
          ? 'Loading products…'
          : `Showing ${items.length} of ${totalCount} ${totalCount === 1 ? 'product' : 'products'}.`}
      </p>

      {loading ? <LoadingState label="Loading products…" /> : items.length === 0 ? (
        <AdminCard><EmptyState>No products match these filters.</EmptyState></AdminCard>
      ) : (
        <div className="admin-product-list">
          {items.map((product) => (
            <a
              key={product.id}
              className="admin-product-row"
              href={`/admin/products/${product.id}`}
              onClick={onNavigate}
            >
              {product.photoUrl
                ? <img className="admin-product-thumbnail" src={product.photoUrl} alt="" />
                : <span className="admin-product-thumbnail admin-product-thumbnail-empty" aria-label="No photo">No photo</span>}
              <span className="admin-product-row-main">
                <strong>{product.name}</strong>
                <span className="admin-product-row-price">
                  {formatNaira(product.price_ngn)}{product.price_suffix ? ` ${product.price_suffix}` : ''}
                </span>
                <span className="admin-product-row-category">{product.categoryName}</span>
                <span className="admin-product-badges">
                  <span className={`admin-status ${product.availability === 'ready_to_order' ? 'is-active' : ''}`}>
                    {availabilityLabels[product.availability]}
                  </span>
                  {!product.is_active && <span className="admin-status">Hidden</span>}
                  {product.is_featured && <span className="admin-status admin-product-featured">Featured</span>}
                </span>
              </span>
              <span className="admin-product-row-chevron" aria-hidden="true">›</span>
            </a>
          ))}
        </div>
      )}

      {!loading && items.length < totalCount && (
        <AdminButton type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </AdminButton>
      )}
    </div>
  );
}

export function ProductFormPage({
  id,
  onNavigate,
  onNavigateTo,
  onDirtyChange,
}: {
  id?: string;
  onNavigate: NavigateHandler;
  onNavigateTo: NavigateTo;
  onDirtyChange: DirtyChangeHandler;
}) {
  const [values, setValues] = useState<ProductFormValues>(emptyProductValues);
  const [initialValues, setInitialValues] = useState<ProductFormValues>(emptyProductValues);
  const [options, setOptions] = useState<OptionGroupDraft[]>([]);
  const [initialOptions, setInitialOptions] = useState<OptionGroupDraft[]>([]);
  const [customOrder, setCustomOrder] = useState<CustomOrderDraft>(emptyCustomOrder);
  const [initialCustomOrder, setInitialCustomOrder] = useState<CustomOrderDraft>(emptyCustomOrder);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [subcategories, setSubcategories] = useState<{ id: string; category_id: string; name: string }[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasOrders, setHasOrders] = useState<boolean | null>(id ? null : false);
  const [orderCheckFailed, setOrderCheckFailed] = useState(false);
  const [slugEdited, setSlugEdited] = useState(Boolean(id));
  const [step, setStep] = useState<ProductWizardStep>(1);
  const [showOnStorefront, setShowOnStorefront] = useState(true);
  const [featureProduct, setFeatureProduct] = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [savedHiddenMessage, setSavedHiddenMessage] = useState('');
  const [photosDirty, setPhotosDirty] = useState(false);

  const isDirty = !loading && (
    JSON.stringify(values) !== JSON.stringify(initialValues)
    || JSON.stringify(options) !== JSON.stringify(initialOptions)
    || JSON.stringify(customOrder) !== JSON.stringify(initialCustomOrder)
    || pendingPhotos.length > 0
    || photosDirty
  );

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    let active = true;
    const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    setNotFound(false);
    setLoadError(null);
    setHasOrders(id ? null : false);
    setOrderCheckFailed(false);
    const photoFailure = new URLSearchParams(window.location.search).get('photoFailure');
    const savedHidden = new URLSearchParams(window.location.search).get('savedHidden');
    setSavedHiddenMessage(photoFailure && /^\d+$/.test(photoFailure)
      ? photoFailureNotice(Number(photoFailure))
      : savedHidden === '1' ? 'Your product was saved as a hidden draft. You can show it from this page when you are ready.' : '');
    if (id && !uuidPattern.test(id)) {
      setNotFound(true);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    const loadProductData = async () => {
      try {
        const [categoryRows, product, configuration] = await Promise.all([
          listProductCategories(),
          id ? getProduct(id) : Promise.resolve(null),
          id ? getProductConfiguration(id) : Promise.resolve(null),
        ]);
        if (!active) return;
        setCategories(categoryRows);
        if (id && !product) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const nextValues = product ? productValues(product) : emptyProductValues;
        setValues(nextValues);
        setInitialValues(nextValues);
        setSlugEdited(Boolean(id));
        if (configuration) {
          const nextOptions = productOptionsToDraft(configuration.options);
          const nextCustomOrder: CustomOrderDraft = {
            enabled: configuration.custom_request_enabled,
            button_label: configuration.custom_request_button_label,
            flow: configuration.custom_request_flow,
            fee_ngn: String(configuration.custom_request_fee_ngn),
            notice: configuration.custom_request_notice ?? '',
            needed_by_mode: configuration.needed_by_mode,
            fields: customFieldsToDraft(configuration.custom_request_fields),
          };
          setOptions(nextOptions);
          setInitialOptions(nextOptions);
          setCustomOrder(nextCustomOrder);
          setInitialCustomOrder(nextCustomOrder);
        }
        if (id) {
          void productHasOrders(id)
            .then((result) => {
              if (active) setHasOrders(result);
            })
            .catch((error: unknown) => {
              if (active) {
                setHasOrders(null);
                setOrderCheckFailed(true);
                toast.error(errorText(error));
              }
            });
        }
      } catch (error) {
        if (active) setLoadError(errorText(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProductData();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    const urls = pendingPhotos.map(({ file }) => URL.createObjectURL(file));
    setPhotoPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [pendingPhotos]);

  useEffect(() => {
    let active = true;
    if (!values.category_id) {
      setSubcategories([]);
      return () => {
        active = false;
      };
    }
    setSubcategories([]);
    void listProductSubcategories(values.category_id)
      .then((result) => {
        if (active) setSubcategories(result);
      })
      .catch((error: unknown) => {
        if (active) toast.error(errorText(error));
      });
    return () => {
      active = false;
    };
  }, [values.category_id]);

  const setField = <K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === 'slug') setSlugEdited(true);
  };

  const changeName = (name: string) => {
    setValues((current) => ({
      ...current,
      name,
      slug: id || slugEdited ? current.slug : slugify(name) || 'product',
    }));
    setErrors((current) => ({ ...current, name: undefined }));
  };

  const validateStep = (requestedStep: ProductWizardStep) => {
    const result = validateWizardStep(requestedStep, values, options, customOrder);
    const nextErrors = result.productErrors;
    const messages = [...result.configErrors];
    if (
      requestedStep === 1
      && values.subcategory_id
      && !subcategories.some((subcategory) => subcategory.id === values.subcategory_id)
    ) {
      nextErrors.subcategory_id = 'Choose a type from the selected category.';
    }
    if (requestedStep === 1) setErrors(nextErrors);
    setStepErrors(messages);
    return Object.keys(nextErrors).length === 0 && messages.length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || savingRef.current) return;
    const errorsByStep = ([1, 3, 4] as const).map((currentStep) => ({
      step: currentStep,
      result: validateWizardStep(currentStep, values, options, customOrder),
    }));
    const nextErrors = errorsByStep[0].result.productErrors;
    if (
      values.subcategory_id
      && !subcategories.some((subcategory) => subcategory.id === values.subcategory_id)
    ) {
      nextErrors.subcategory_id = 'Choose a type from the selected category.';
    }
    setErrors(nextErrors);
    const configErrors = errorsByStep.flatMap(({ result }) => result.configErrors);
    setStepErrors(configErrors);
    if (Object.keys(nextErrors).length || configErrors.length) {
      const invalid = errorsByStep.find(({ result }) => Object.keys(result.productErrors).length || result.configErrors.length);
      setStep(invalid?.step ?? 1);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    let createdProductId: string | null = null;
    let published = false;
    try {
      if (id) {
        const configuration = productConfigurationFromDraft(options, customOrder);
        await validateOptionsWithDatabase(configuration.options);
        await validateCustomFieldsWithDatabase(configuration.custom_request_fields);
        const { slug: existingSlug, ...productChanges } = productWrite(values);
        void existingSlug;
        await updateProduct(id, { ...productChanges, ...configuration });
        setInitialValues(values);
        setInitialOptions(options);
        setInitialCustomOrder(customOrder);
        toast.success('Product changes saved.');
      } else {
        const configuration = productConfigurationFromDraft(options, customOrder);
        await validateOptionsWithDatabase(configuration.options);
        await validateCustomFieldsWithDatabase(configuration.custom_request_fields);
        const plan = planProductSave(pendingPhotos.length, showOnStorefront, featureProduct);
        const uploadedPositions: number[] = [];
        for (const action of plan.actions) {
          if (action.type === 'insert-hidden') {
            createdProductId = await createProduct({
              ...productWrite({ ...values, is_active: false }),
              ...configuration,
              is_active: false,
              is_featured: false,
              featured_position: null,
            });
          } else if (action.type === 'upload-photo' && createdProductId) {
            const photo = pendingPhotos[action.position - 1];
            if (!photo) continue;
            try {
              const resized = await resizeProductPhoto(photo.file);
              await uploadProductImage(
                createdProductId,
                action.position,
                resized,
                photo.altText?.trim() ?? values.name.trim(),
              );
              uploadedPositions.push(action.position);
            } catch {
              let cleanupFailed = false;
              for (const position of uploadedPositions.reverse()) {
                try {
                  const imageRows = await listProductImages(createdProductId);
                  const image = imageRows.find((row) => row.position === position);
                  if (image) await removeProductImage(image.id);
                } catch {
                  cleanupFailed = true;
                }
              }
              onDirtyChange(false);
              onNavigateTo(`/admin/products/${createdProductId}?photoFailure=${action.position}${cleanupFailed ? '&cleanupFailed=1' : ''}`);
              return;
            }
          } else if (action.type === 'publish' && createdProductId) {
            let featuredPosition: number | null = null;
            if (action.featured) {
              const featuredProducts = await listFeaturedProducts();
              featuredPosition = featuredProducts.reduce(
                (position, product) => Math.max(position, product.featured_position ?? 0),
                0,
              ) + 1;
            }
            await publishProductWithFeaturedPosition(createdProductId, featuredPosition);
            published = true;
          }
        }
        if (!createdProductId) throw new Error('The product could not be created.');
        onDirtyChange(false);
        toast.success(showOnStorefront ? 'Product added to your website.' : 'Product saved as a hidden draft.');
        onNavigateTo(`/admin/products/${createdProductId}${published ? '' : '?savedHidden=1'}`);
      }
    } catch (error) {
      const message = errorText(error);
      if (!id && createdProductId && !published) {
        onDirtyChange(false);
        toast.error(message);
        onNavigateTo(`/admin/products/${createdProductId}?savedHidden=1`);
      } else {
        toast.error(message);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleProductVisibility = async () => {
    if (!id || saving) return;
    setSaving(true);
    try {
      const isActive = !values.is_active;
      await setProductActive(id, isActive);
      setValues((current) => ({ ...current, is_active: isActive }));
      setInitialValues((current) => ({ ...current, is_active: isActive }));
      toast.success(isActive ? 'Product shown on your website.' : 'Product hidden from your website.');
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!id) return;
    await deleteProduct(id);
    toast.success('Product and its photos deleted.');
    onNavigateTo('/admin/products');
  };

  if (loading) return <LoadingState label="Loading product…" />;
  if (notFound) {
    return (
      <div className="admin-page">
        <AdminPageHeader title="Product not found" description="This product may have been deleted or the address may be incorrect." />
        <a className="admin-button admin-button-secondary" href="/admin/products" onClick={onNavigate}>Back to products</a>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="admin-page">
        <AdminPageHeader title={id ? 'Product could not be loaded' : 'Product could not be created'} />
        <p className="admin-alert" role="alert">{loadError}</p>
        <a className="admin-button admin-button-secondary" href="/admin/products" onClick={onNavigate}>Back to products</a>
      </div>
    );
  }

  return (
    <div className="admin-page admin-product-form-page">
      <AdminPageHeader
        title={id ? 'Edit product' : 'Add product'}
        description={id ? 'Update this product’s details, choices, and customisation.' : 'Set up your product one step at a time.'}
      >
        <a className="admin-button admin-button-secondary" href="/admin/products" onClick={onNavigate}>Back to products</a>
      </AdminPageHeader>
      {savedHiddenMessage && (
        <p className="admin-alert" role="status">
          {new URLSearchParams(window.location.search).has('photoFailure') && id
            ? <>
              Your product was saved as hidden but photo {new URLSearchParams(window.location.search).get('photoFailure')} did not upload.{' '}
              <a href={`#product-photo-slot-${new URLSearchParams(window.location.search).get('photoFailure')}`}>Add it here.</a>
            </>
            : savedHiddenMessage}
          {new URLSearchParams(window.location.search).get('cleanupFailed') === '1' && (
            <> Some earlier photos could not be removed; review the Photos section.</>
          )}
        </p>
      )}
      {id && (
        <div className="admin-product-visibility">
          <strong>{values.is_active ? 'Showing on your website' : 'Hidden'}</strong>
          <AdminButton type="button" variant="secondary" disabled={saving} onClick={() => void toggleProductVisibility()}>
            {values.is_active ? 'Hide' : 'Show'}
          </AdminButton>
        </div>
      )}

      <form className="admin-form admin-product-form" onSubmit={(event) => void submit(event)} noValidate>
        {!id ? (
          <>
            <div className="admin-product-progress" aria-label={`Step ${step} of 5`}>
              <progress value={step} max={5} aria-label={`Step ${step} of 5`} />
              <strong>Step {step} of 5</strong>
            </div>
            {step === 1 && <AdminCard className="admin-product-section">
              <h2>About the product</h2>
              {aboutFields(values, errors, categories, subcategories, setField, changeName, setValues, false)}
            </AdminCard>}
            {step === 2 && <AdminCard className="admin-product-section">
              <div>
                <h2>Photos</h2>
                <p>Add up to three photos. Choose an image file or open your camera.</p>
              </div>
              <div className="admin-product-photo-slots">
                {[0, 1, 2].map((position) => {
                  const photo = pendingPhotos[position];
                  const label = position === 0 ? 'Main photo' : `Photo ${position + 1}`;
                  return (
                    <section className="admin-product-photo-slot" key={position} aria-label={label}>
                      <h3>{label}</h3>
                      {photo
                        ? <img className="admin-product-photo-preview" src={photoPreviews[position]} alt={photo.altText || values.name} />
                        : <div className="admin-product-photo-preview admin-product-thumbnail-empty">No photo selected</div>}
                      <div className="admin-form-actions">
                        <label className="admin-button admin-button-secondary">
                          Choose from gallery or files
                          <input
                            className="admin-visually-hidden"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={!photo && position > pendingPhotos.length}
                            aria-label={`Choose ${label} from gallery or files`}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = '';
                              if (!file) return;
                              const validationError = validateProductImageFile(file);
                              if (validationError) return void toast.error(validationError);
                              setPendingPhotos((current) => {
                                const next = [...current];
                                next[position] = { file, altText: next[position]?.altText };
                                return next;
                              });
                            }}
                          />
                        </label>
                        <label className="admin-button admin-button-secondary">
                          Take a photo
                          <input
                            className="admin-visually-hidden"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            disabled={!photo && position > pendingPhotos.length}
                            aria-label={`Take ${label}`}
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = '';
                              if (!file) return;
                              const validationError = validateProductImageFile(file);
                              if (validationError) return void toast.error(validationError);
                              setPendingPhotos((current) => {
                                const next = [...current];
                                next[position] = { file, altText: next[position]?.altText };
                                return next;
                              });
                            }}
                          />
                        </label>
                      </div>
                      {photo && <>
                        <AdminInput
                          id={`pending-photo-alt-${position}`}
                          label="Describe this photo (optional)"
                          value={photo.altText ?? values.name}
                          onChange={(altText) => setPendingPhotos((current) => current.map((item, index) => index === position ? { ...item, altText } : item))}
                        />
                        <div className="admin-form-actions">
                          <AdminButton type="button" variant="secondary" disabled={position === 0} onClick={() => setPendingPhotos((current) => {
                            const next = [...current];
                            [next[position - 1], next[position]] = [next[position], next[position - 1]];
                            return next;
                          })}>Move left</AdminButton>
                          <AdminButton type="button" variant="secondary" disabled={position >= pendingPhotos.length - 1} onClick={() => setPendingPhotos((current) => {
                            const next = [...current];
                            [next[position], next[position + 1]] = [next[position + 1], next[position]];
                            return next;
                          })}>Move right</AdminButton>
                          <AdminButton type="button" variant="danger" onClick={() => setPendingPhotos((current) => current.filter((_, index) => index !== position))}>Remove photo</AdminButton>
                        </div>
                      </>}
                    </section>
                  );
                })}
              </div>
            </AdminCard>}
            {step === 3 && <ProductConfigEditor section="options" options={options} customOrder={customOrder} onOptionsChange={setOptions} onCustomOrderChange={setCustomOrder} />}
            {step === 4 && <ProductConfigEditor section="custom" options={options} customOrder={customOrder} onOptionsChange={setOptions} onCustomOrderChange={setCustomOrder} />}
            {step === 5 && <AdminCard className="admin-product-section">
              <h2>Review and add</h2>
              <dl className="admin-product-review">
                <div><dt>Name</dt><dd>{values.name || 'Not set'}</dd></div>
                <div><dt>Price</dt><dd>{values.price_ngn ? formatNaira(parseNaira(values.price_ngn) ?? 0) : 'Not set'}{values.price_suffix ? ` ${values.price_suffix}` : ''}</dd></div>
                <div><dt>Category and type</dt><dd>{categories.find(({ id: categoryId }) => categoryId === values.category_id)?.name ?? 'Not set'}{values.subcategory_id ? ` · ${subcategories.find(({ id: subcategoryId }) => subcategoryId === values.subcategory_id)?.name ?? ''}` : ''}</dd></div>
                <div><dt>Who it is for</dt><dd>{{ male: 'Men', female: 'Women', unisex: 'Unisex' }[values.audience]}</dd></div>
                <div><dt>Availability</dt><dd>{availabilityLabels[values.availability]}</dd></div>
                <div><dt>Description</dt><dd>{values.description}</dd></div>
                <div><dt>Web address</dt><dd>/product/{values.slug}</dd></div>
                <div><dt>More ordering options</dt><dd>
                  Minimum {values.min_order_qty || '1'} · Maximum {values.max_order_qty || 'No limit'}
                  {values.lead_time_days_min || values.lead_time_days_max
                    ? ` · Lead time ${values.lead_time_days_min || '0'}–${values.lead_time_days_max || 'unspecified'} days`
                    : ''}
                  {values.lead_time_note ? ` · ${values.lead_time_note}` : ''}
                  {values.size_guide_note ? ` · Size guide: ${values.size_guide_note}` : ''}
                </dd></div>
                <div><dt>Photos</dt><dd>{pendingPhotos.length ? pendingPhotos.map(({ file }) => file.name).join(', ') : 'None'} ({pendingPhotos.length} of 3)</dd></div>
                <div><dt>Choices</dt><dd>{options.length ? options.map((group) => group.type === 'choice'
                  ? `${group.label}: ${group.values.map(({ label }) => label).join(', ')}`
                  : `${group.label}: ${group.min}–${group.max} ${group.unit}`).join(' · ') : 'None'}</dd></div>
                <div><dt>Customising</dt><dd>{customOrder.enabled
                  ? `${customOrder.button_label}; ${customOrder.flow === 'checkout' ? 'Pay at checkout' : 'WhatsApp quote'}; extra charge ${formatNaira(parseNaira(customOrder.fee_ngn) ?? 0)}; needed-by date ${customOrder.needed_by_mode}; questions: ${customOrder.fields.map(({ label }) => label).join(', ')}${customOrder.notice ? `; message: ${customOrder.notice}` : ''}`
                  : 'Off'}</dd></div>
              </dl>
              <fieldset className="admin-product-publish-choice">
                <legend>Where should this product appear?</legend>
                <label><input type="radio" name="publish-choice" checked={showOnStorefront} onChange={() => { setShowOnStorefront(true); }} /> Show on your website now</label>
                <label><input type="radio" name="publish-choice" checked={!showOnStorefront} onChange={() => { setShowOnStorefront(false); setFeatureProduct(false); }} /> Save as hidden draft</label>
                <label className="admin-toggle">
                  <input type="checkbox" checked={featureProduct} disabled={!showOnStorefront} onChange={(event) => setFeatureProduct(event.target.checked)} />
                  <span className="admin-toggle-track" aria-hidden="true" />
                  <span>Also show in the homepage Featured section</span>
                </label>
              </fieldset>
            </AdminCard>}
            {stepErrors.length > 0 && <div className="admin-config-errors" role="alert">{stepErrors.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div>}
            <div className="admin-form-actions admin-product-wizard-actions">
              {step > 1 && <AdminButton type="button" variant="secondary" disabled={saving} onClick={() => { setStepErrors([]); setStep((current) => (current - 1) as ProductWizardStep); }}>Back</AdminButton>}
              {step < 5
                ? <AdminButton type="button" disabled={saving} onClick={() => {
                  if (!validateStep(step)) return;
                  setStepErrors([]);
                  setStep((current) => (current + 1) as ProductWizardStep);
                }}>Next</AdminButton>
                : <AdminButton type="submit" disabled={saving}>{saving ? 'Adding product…' : 'Add product'}</AdminButton>}
            </div>
          </>
        ) : (
          <>
            <details className="admin-product-collapse" open>
              <summary>About the product</summary>
              {aboutFields(values, errors, categories, subcategories, setField, changeName, setValues, true)}
            </details>
            <details className="admin-product-collapse" open={new URLSearchParams(window.location.search).has('photoFailure')}>
              <summary>Photos</summary>
              <ProductPhotos productId={id} productName={values.name} onDirtyChange={setPhotosDirty} />
            </details>
            <details className="admin-product-collapse">
              <summary>Choices customers make</summary>
              <ProductConfigEditor section="options" options={options} customOrder={customOrder} onOptionsChange={setOptions} onCustomOrderChange={setCustomOrder} />
            </details>
            <details className="admin-product-collapse">
              <summary>Customising</summary>
              <ProductConfigEditor section="custom" options={options} customOrder={customOrder} onOptionsChange={setOptions} onCustomOrderChange={setCustomOrder} />
            </details>
            <AdminCard className="admin-product-danger-zone">
              <h2>Delete product</h2>
              {hasOrders === null
                ? <p className="admin-inline-note">{orderCheckFailed ? 'Order history could not be verified. Deletion is unavailable; reload this product to retry.' : 'Checking order history. Deletion is unavailable until the check finishes.'}</p>
                : hasOrders
                  ? <p className="admin-inline-note">This product has orders and cannot be deleted. Hide it from your website instead.</p>
                  : <>
                    <p className="admin-inline-note">Deleting removes this product and its photo records and uploaded files.</p>
                    <ConfirmDialog label="Delete this product?" message="This permanently deletes the product and its photos. Products that appear in order history cannot be deleted." confirmLabel="Delete product" onConfirm={confirmDelete}>
                      <AdminButton type="button" variant="danger" disabled={isDirty}>Delete product</AdminButton>
                    </ConfirmDialog>
                  </>}
            </AdminCard>
            <div className="admin-product-sticky-save">
              <AdminButton type="submit" disabled={saving || !isDirty}>{saving ? 'Saving…' : 'Save changes'}</AdminButton>
              {isDirty && <span className="admin-inline-note">Unsaved changes</span>}
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function aboutFields(
  values: ProductFormValues,
  errors: ProductFieldErrors,
  categories: { id: string; name: string }[],
  subcategories: { id: string; category_id: string; name: string }[],
  setField: <K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) => void,
  changeName: (name: string) => void,
  setValues: Dispatch<SetStateAction<ProductFormValues>>,
  editing: boolean,
) {
  return (
    <AdminCard className="admin-product-section">
      <div className="admin-form-grid">
        <AdminInput id="product-name" label="Name" value={values.name} onChange={changeName} error={errors.name} required autoComplete="off" />
        <AdminNairaInput id="product-price" label="Price (naira)" value={values.price_ngn} onChange={(value) => setField('price_ngn', value)} error={errors.price_ngn} required inputMode="numeric" hint="Enter the price in whole naira." />
        <AdminInput id="product-price-suffix" label="Price unit (optional)" value={values.price_suffix} onChange={(value) => setField('price_suffix', value)} error={errors.price_suffix} hint="for example per yard" maxLength={40} />
        <AdminSelect id="product-category" label="Category" value={values.category_id} onChange={(value) => { setField('category_id', value); setValues((current) => ({ ...current, subcategory_id: '' })); }} error={errors.category_id} options={[{ value: '', label: 'Choose a category' }, ...categories.map(({ id: categoryId, name }) => ({ value: categoryId, label: name }))]} />
        <AdminSelect id="product-subcategory" label="Type of product" value={values.subcategory_id} onChange={(value) => setField('subcategory_id', value)} error={errors.subcategory_id} disabled={!values.category_id} hint="Choose a more specific type, if it applies." options={[{ value: '', label: 'Choose a type (optional)' }, ...subcategories.map(({ id: subcategoryId, name }) => ({ value: subcategoryId, label: name }))]} />
        <AdminSelect id="product-audience" label="Who is it for?" value={values.audience} onChange={(value) => setField('audience', value as ProductFormValues['audience'])} hint="Choose who this product is made for." options={[{ value: 'male', label: 'Men' }, { value: 'female', label: 'Women' }, { value: 'unisex', label: 'Unisex' }]} />
        <AdminSelect id="product-availability" label="Availability" value={values.availability} onChange={(value) => setField('availability', value as ProductFormValues['availability'])} hint="Let customers know whether it can be ordered now." options={[{ value: 'ready_to_order', label: availabilityLabels.ready_to_order }, { value: 'made_to_order', label: availabilityLabels.made_to_order }, { value: 'out_of_stock', label: availabilityLabels.out_of_stock }]} />
        <AdminTextarea id="product-description" label="Description" value={values.description} onChange={(value) => setField('description', value)} error={errors.description} rows={4} required hint="Tell customers what makes this product special." />
      </div>
      <details className="admin-product-subsection">
        <summary>More ordering options (optional)</summary>
        <div className="admin-form-grid">
          <AdminNumberInput id="product-min-order" label="Minimum quantity" value={values.min_order_qty} onChange={(value) => setField('min_order_qty', value)} error={errors.min_order_qty} min={1} required inputMode="numeric" />
          <AdminNumberInput id="product-max-order" label="Maximum quantity" value={values.max_order_qty} onChange={(value) => setField('max_order_qty', value)} error={errors.max_order_qty} min={1} inputMode="numeric" />
          <AdminNumberInput id="product-lead-min" label="Minimum lead time in days" value={values.lead_time_days_min} onChange={(value) => setField('lead_time_days_min', value)} error={errors.lead_time_days_min} min={0} inputMode="numeric" />
          <AdminNumberInput id="product-lead-max" label="Maximum lead time in days" value={values.lead_time_days_max} onChange={(value) => setField('lead_time_days_max', value)} error={errors.lead_time_days_max} min={0} inputMode="numeric" />
          <AdminTextarea id="product-lead-note" label="Lead-time note" value={values.lead_time_note} onChange={(value) => setField('lead_time_note', value)} hint="Optional details about how long an order takes." />
          <AdminTextarea id="product-size-note" label="Size-guide note" value={values.size_guide_note} onChange={(value) => setField('size_guide_note', value)} hint="Optional sizing advice for customers." />
        </div>
      </details>
    </AdminCard>
  );
}

function ProductPhotos({
  productId,
  productName,
  onDirtyChange,
}: {
  productId: string;
  productName: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [images, setImages] = useState<ProductImage[] | null>(null);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingPosition, setUploadingPosition] = useState<number | null>(null);
  const photoDraftsDirty = Boolean(images && images.some(
    (image) => (altDrafts[image.id] ?? image.alt_text) !== image.alt_text,
  ));

  useEffect(() => {
    onDirtyChange(photoDraftsDirty || busy);
    return () => onDirtyChange(false);
  }, [busy, onDirtyChange, photoDraftsDirty]);

  const refresh = useCallback(async () => {
    try {
      const result = await listProductImages(productId);
      setImages(result);
      setAltDrafts(Object.fromEntries(result.map((image) => [image.id, image.alt_text])));
    } catch (error) {
      setImages(null);
      throw error;
    }
  }, [productId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listProductImages(productId)
      .then((result) => {
        if (!active) return;
        setImages(result);
        setAltDrafts(Object.fromEntries(result.map((image) => [image.id, image.alt_text])));
      })
      .catch((error: unknown) => {
        if (active) {
          setImages(null);
          toast.error(errorText(error));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      toast.success(successMessage);
    } catch (error) {
      try {
        await refresh();
      } catch {
        setImages(null);
      }
      toast.error(errorText(error));
    } finally {
      setBusy(false);
      setUploadingPosition(null);
    }
  };

  const upload = async (position: number, image: ProductImage | undefined, file: File) => {
    const validationError = validateProductImageFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploadingPosition(position);
    await runAction(async () => {
      const resized = await resizeProductPhoto(file);
      await uploadProductImage(
        productId,
        position,
        resized,
        image ? altDrafts[image.id] ?? image.alt_text : productName,
        image?.id,
      );
    }, image ? 'Photo replaced.' : 'Photo uploaded.');
  };

  const remove = async (image: ProductImage) => {
    setBusy(true);
    try {
      await removeProductImage(image.id);
      await refresh();
      toast.success('Photo removed.');
    } finally {
      setBusy(false);
    }
  };

  const reorder = async (image: ProductImage, position: number) => {
    if (position === image.position) return;
    const other = images?.find((entry) => entry.position === position);
    if (other) {
      await runAction(
        () => swapProductImages(productId, image.id, other.id),
        position === 1 ? 'Main photo updated.' : 'Photo order updated.',
      );
      return;
    }
    await runAction(
      () => saveProductImagePosition(image.id, position),
      position === 1 ? 'Main photo updated.' : 'Photo order updated.',
    );
  };

  return (
    <AdminCard className="admin-product-section admin-product-photos">
      <div className="admin-card-heading">
        <div>
          <h2>Photos</h2>
          <p>Upload up to three photos. The first photo appears in product lists.</p>
        </div>
        {images && <span className="admin-status">{images.length} of 3</span>}
      </div>
      {loading ? <LoadingState label="Loading photos…" /> : images === null ? (
        <p className="admin-alert" role="alert">Photos could not be loaded. Refresh the page to try again.</p>
      ) : (
        <div className="admin-product-photo-slots">
          {[1, 2, 3].map((position) => {
            const image = images.find((entry) => entry.position === position);
            const label = position === 1 ? 'Main photo' : `Photo ${position}`;
            const altText = image ? altDrafts[image.id] ?? image.alt_text : '';
            return (
              <section key={position} id={`product-photo-slot-${position}`} className="admin-product-photo-slot" aria-label={`${label} slot`}>
                <div className="admin-product-photo-heading">
                  <h3>{label}</h3>
                  {image && <span className="admin-status">{position} of 3</span>}
                </div>
                {image
                  ? <img className="admin-product-photo-preview" src={getProductImageUrl(image.storage_path)} alt={image.alt_text} />
                  : <div className="admin-product-photo-preview admin-product-thumbnail-empty">Empty photo slot</div>}

                <div className="admin-form-actions">
                  <label className="admin-button admin-button-secondary">
                    Choose from gallery or files
                    <input
                      className="admin-visually-hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy || (!image && images.length >= 3)}
                      aria-label={`Choose ${label} from gallery or files`}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = '';
                        if (file) void upload(position, image, file);
                      }}
                    />
                  </label>
                  <label className="admin-button admin-button-secondary">
                    Take a photo
                    <input
                      className="admin-visually-hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      disabled={busy || (!image && images.length >= 3)}
                      aria-label={`Take ${label}`}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = '';
                        if (file) void upload(position, image, file);
                      }}
                    />
                  </label>
                </div>
                {uploadingPosition === position && <p className="admin-inline-note" role="status">Optimizing and uploading photo…</p>}
                {image && (
                  <>
                    <AdminInput
                      id={`product-photo-alt-${image.id}`}
                      label="Describe this photo (optional)"
                      value={altText}
                      onChange={(value) => setAltDrafts((current) => ({ ...current, [image.id]: value }))}
                    />
                    <div className="admin-form-actions admin-product-photo-actions">
                      <AdminButton
                        type="button"
                        variant="secondary"
                        disabled={busy || altText === image.alt_text}
                        onClick={() => void runAction(
                          () => saveProductImageMeta(image.id, altText),
                          'Photo description saved.',
                        )}
                      >
                        Save description
                      </AdminButton>
                      <AdminButton
                        type="button"
                        variant="secondary"
                        disabled={busy || position === 1}
                        onClick={() => void reorder(image, position - 1)}
                      >
                        Move left
                      </AdminButton>
                      <AdminButton
                        type="button"
                        variant="secondary"
                        disabled={busy || position === 3}
                        onClick={() => void reorder(image, position + 1)}
                      >
                        Move right
                      </AdminButton>
                      {position !== 1 && (
                        <AdminButton
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void reorder(image, 1)}
                        >
                          Set as main
                        </AdminButton>
                      )}
                      <ConfirmDialog
                        label="Remove this photo?"
                        message="The photo will be removed from this product. Its stored file will be deleted afterward."
                        confirmLabel="Remove photo"
                        onConfirm={() => remove(image)}
                      >
                        <AdminButton type="button" variant="danger" disabled={busy}>Remove</AdminButton>
                      </ConfirmDialog>
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </AdminCard>
  );
}
