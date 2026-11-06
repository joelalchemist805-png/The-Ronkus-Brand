import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  createProduct,
  deleteProduct,
  getProduct,
  getProductImageUrl,
  listProductCategories,
  listProductImages,
  listProducts,
  listProductSubcategories,
  productHasOrders,
  removeProductImage,
  saveProductImageMeta,
  saveProductImagePosition,
  setProductActive,
  swapProductImages,
  updateProduct,
  uploadProductImage,
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
  AdminToggle,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from './admin-components';
import {
  formatNaira,
  parseNaira,
  parseWholeNumber,
  slugify,
  validateProductForm,
  validateProductImageFile,
  type ProductFieldErrors,
  type ProductFormValues,
} from './helpers';
import { resizeProductPhoto } from './image-helpers';
import { ProductConfigEditor } from './product-config-editor';

type NavigateHandler = (event: ReactMouseEvent<HTMLAnchorElement>) => void;
type NavigateTo = (path: string) => void;
type DirtyChangeHandler = (dirty: boolean) => void;

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
      <AdminPageHeader title="Products" description="Manage the products shown in your storefront.">
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
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [subcategories, setSubcategories] = useState<{ id: string; category_id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasOrders, setHasOrders] = useState<boolean | null>(id ? null : false);
  const [orderCheckFailed, setOrderCheckFailed] = useState(false);
  const [slugEdited, setSlugEdited] = useState(Boolean(id));
  const [photosDirty, setPhotosDirty] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

  const isDirty = !loading && (
    JSON.stringify(values) !== JSON.stringify(initialValues)
    || photosDirty
    || configDirty
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
        const [categoryRows, product] = await Promise.all([
          listProductCategories(),
          id ? getProduct(id) : Promise.resolve(null),
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
      slug: slugEdited ? current.slug : slugify(name),
    }));
    setErrors((current) => ({ ...current, name: undefined, slug: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateProductForm(values);
    if (
      values.subcategory_id
      && !subcategories.some((subcategory) => subcategory.id === values.subcategory_id)
    ) {
      nextErrors.subcategory_id = 'Choose a subcategory from the selected category.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const changes = productWrite(values);
      if (id) {
        await updateProduct(id, changes);
        setInitialValues(values);
        toast.success('Product saved.');
      } else {
        const productId = await createProduct(changes);
        setInitialValues(values);
        onDirtyChange(false);
        toast.success('Product created. Add photos from the edit screen.');
        onNavigateTo(`/admin/products/${productId}`);
      }
    } catch (error) {
      const message = errorText(error);
      if (message === 'That web address is already used by another product.') {
        setErrors((current) => ({ ...current, slug: message }));
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const hideFromStorefront = async () => {
    if (!id) return;
    await setProductActive(id, false);
    const nextValues = { ...values, is_active: false };
    setValues(nextValues);
    setInitialValues(nextValues);
    toast.success('Product hidden from the storefront.');
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
        description={id ? 'Update this product’s storefront details.' : 'Create the product details first; photos can be added after saving.'}
      >
        <a className="admin-button admin-button-secondary" href="/admin/products" onClick={onNavigate}>Back to products</a>
      </AdminPageHeader>
      {!id && <p className="admin-note">Save this product to open its edit screen, where you can add up to three photos.</p>}

      <form className="admin-form admin-product-form" onSubmit={(event) => void submit(event)} noValidate>
        <AdminCard className="admin-product-section">
          <h2>Basics</h2>
          <div className="admin-form-grid">
            <AdminInput
              id="product-name"
              label="Name"
              value={values.name}
              onChange={changeName}
              error={errors.name}
              required
              autoComplete="off"
            />
            <AdminInput
              id="product-slug"
              label="Web address slug"
              value={values.slug}
              onChange={(value) => setField('slug', value.toLowerCase())}
              error={errors.slug}
              hint={`Storefront path: /product/${values.slug || 'your-product-name'}`}
              showHintWithError
              readOnly={Boolean(id)}
              required
              autoComplete="off"
            />
            <AdminNairaInput
              id="product-price"
              label="Price"
              value={values.price_ngn}
              onChange={(value) => setField('price_ngn', value)}
              error={errors.price_ngn}
              required
              inputMode="numeric"
            />
            <AdminInput
              id="product-price-suffix"
              label="Price suffix (optional)"
              value={values.price_suffix}
              onChange={(value) => setField('price_suffix', value)}
              error={errors.price_suffix}
              hint="For example, per yard."
              maxLength={40}
            />
            <AdminSelect
              id="product-category"
              label="Category"
              value={values.category_id}
              onChange={(value) => {
                setField('category_id', value);
                setValues((current) => ({ ...current, subcategory_id: '' }));
              }}
              error={errors.category_id}
              options={[
                { value: '', label: 'Choose a category' },
                ...categories.map((category) => ({ value: category.id, label: category.name })),
              ]}
            />
            <AdminSelect
              id="product-subcategory"
              label="Subcategory (optional)"
              value={values.subcategory_id}
              onChange={(value) => setField('subcategory_id', value)}
              error={errors.subcategory_id}
              disabled={!values.category_id}
              options={[
                { value: '', label: 'No subcategory' },
                ...subcategories.map((subcategory) => ({ value: subcategory.id, label: subcategory.name })),
              ]}
            />
            <AdminSelect
              id="product-audience"
              label="Audience"
              value={values.audience}
              onChange={(value) => setField('audience', value as ProductFormValues['audience'])}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'unisex', label: 'Unisex' },
              ]}
            />
            <AdminSelect
              id="product-availability"
              label="Availability"
              value={values.availability}
              onChange={(value) => setField('availability', value as ProductFormValues['availability'])}
              options={[
                { value: 'ready_to_order', label: availabilityLabels.ready_to_order },
                { value: 'made_to_order', label: availabilityLabels.made_to_order },
                { value: 'out_of_stock', label: availabilityLabels.out_of_stock },
              ]}
            />
            <AdminTextarea
              id="product-description"
              label="Description"
              value={values.description}
              onChange={(value) => setField('description', value)}
              rows={4}
            />
            <AdminToggle
              id="product-is-active"
              label="Visible on storefront"
              checked={values.is_active}
              onChange={(checked) => setField('is_active', checked)}
            />
          </div>
        </AdminCard>

        <AdminCard className="admin-product-section">
          <h2>Order rules</h2>
          <div className="admin-form-grid">
            <AdminNumberInput
              id="product-min-order"
              label="Minimum order quantity"
              value={values.min_order_qty}
              onChange={(value) => setField('min_order_qty', value)}
              error={errors.min_order_qty}
              min={1}
              required
              inputMode="numeric"
            />
            <AdminNumberInput
              id="product-max-order"
              label="Maximum order quantity (optional)"
              value={values.max_order_qty}
              onChange={(value) => setField('max_order_qty', value)}
              error={errors.max_order_qty}
              min={1}
              inputMode="numeric"
            />
            <AdminNumberInput
              id="product-lead-min"
              label="Minimum lead time in days (optional)"
              value={values.lead_time_days_min}
              onChange={(value) => setField('lead_time_days_min', value)}
              error={errors.lead_time_days_min}
              min={0}
              inputMode="numeric"
            />
            <AdminNumberInput
              id="product-lead-max"
              label="Maximum lead time in days (optional)"
              value={values.lead_time_days_max}
              onChange={(value) => setField('lead_time_days_max', value)}
              error={errors.lead_time_days_max}
              min={0}
              inputMode="numeric"
            />
            <AdminTextarea
              id="product-lead-note"
              label="Lead-time note (optional)"
              value={values.lead_time_note}
              onChange={(value) => setField('lead_time_note', value)}
            />
            <AdminTextarea
              id="product-size-note"
              label="Size-guide note (optional)"
              value={values.size_guide_note}
              onChange={(value) => setField('size_guide_note', value)}
            />
          </div>
        </AdminCard>

        <div className="admin-form-actions admin-product-save-actions">
          <AdminButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save product'}</AdminButton>
          {isDirty && <span className="admin-inline-note">Unsaved changes</span>}
        </div>
      </form>

      {id && (
        <>
          <ProductConfigEditor productId={id} onDirtyChange={setConfigDirty} />
          <ProductPhotos productId={id} productName={values.name} onDirtyChange={setPhotosDirty} />
          <AdminCard className="admin-product-danger-zone">
            <h2>Storefront and deletion</h2>
            {hasOrders === null
              ? <p className="admin-inline-note">
                {orderCheckFailed
                  ? 'Order history could not be verified. Deletion is unavailable; reload this product to retry.'
                  : 'Checking order history. Deletion is unavailable until the check finishes.'}
              </p>
              : hasOrders
                ? (
                  <>
                    <p className="admin-inline-note">This product appears in order history and cannot be deleted. Hide it from the storefront instead.</p>
                    {values.is_active && (
                      <ConfirmDialog
                        label="Hide this product?"
                        message="The product will no longer appear in the storefront. Its order history will remain unchanged."
                        confirmLabel="Hide product"
                        onConfirm={hideFromStorefront}
                      >
                        <AdminButton type="button" variant="secondary" disabled={isDirty}>Hide from storefront</AdminButton>
                      </ConfirmDialog>
                    )}
                  </>
                )
                : (
                  <>
                    <p className="admin-inline-note">Deleting removes this product and its photo records. Its uploaded photo files will also be deleted.</p>
                    <ConfirmDialog
                      label="Delete this product?"
                      message="This permanently deletes the product and its photos. Products that appear in order history cannot be deleted."
                      confirmLabel="Delete product"
                      onConfirm={confirmDelete}
                    >
                      <AdminButton type="button" variant="danger" disabled={isDirty}>Delete product</AdminButton>
                    </ConfirmDialog>
                  </>
                )}
          </AdminCard>
        </>
      )}
    </div>
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
    onDirtyChange(photoDraftsDirty);
    return () => onDirtyChange(false);
  }, [onDirtyChange, photoDraftsDirty]);

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
          <p>Upload up to three photos. The first photo is the storefront thumbnail.</p>
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
              <section key={position} className="admin-product-photo-slot" aria-label={`${label} slot`}>
                <div className="admin-product-photo-heading">
                  <h3>{label}</h3>
                  {image && <span className="admin-status">{position} of 3</span>}
                </div>
                {image
                  ? <img className="admin-product-photo-preview" src={getProductImageUrl(image.storage_path)} alt={image.alt_text} />
                  : <div className="admin-product-photo-preview admin-product-thumbnail-empty">Empty photo slot</div>}

                <div className="admin-field admin-product-file-field">
                  <label htmlFor={`product-photo-${position}`}>{image ? 'Replace photo' : 'Add photo'}</label>
                  <input
                    id={`product-photo-${position}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    disabled={busy || (!image && images.length >= 3)}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = '';
                      if (file) void upload(position, image, file);
                    }}
                  />
                </div>
                {uploadingPosition === position && <p className="admin-inline-note" role="status">Optimizing and uploading photo…</p>}
                {image && (
                  <>
                    <AdminInput
                      id={`product-photo-alt-${image.id}`}
                      label="Alternative text"
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
                        Save alt text
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
