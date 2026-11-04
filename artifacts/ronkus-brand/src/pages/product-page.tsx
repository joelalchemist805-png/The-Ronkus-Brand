import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShop } from '@/components/shop-provider';
import { useCategories, useProductBySlug, useStoreSettings } from '@/lib/store-api';
import type {
  CustomRequestField,
  ProductWithImages,
} from '@/lib/db-types';
import { computeUnitPrice, fromPrice, type ProductSelections } from '@/lib/pricing';
import { buildWhatsAppUrl, formatNaira } from '@/lib/shop';
import NotFound from '@/pages/not-found';

type CustomAnswers = Record<string, string | number>;
type CustomErrors = Record<string, string>;

function getLagosDateAfter(days: number): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find(({ type }) => type === 'year')?.value);
  const month = Number(parts.find(({ type }) => type === 'month')?.value);
  const day = Number(parts.find(({ type }) => type === 'day')?.value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validateAnswer(field: CustomRequestField, value: string | number | undefined): string | undefined {
  const empty = value === undefined || value === '' || (typeof value === 'string' && !value.trim());
  if (empty) return field.required ? 'This field is required.' : undefined;

  switch (field.type) {
    case 'text':
    case 'textarea':
      if (typeof value !== 'string' || value.trim().length > field.max_length) {
        return `Enter no more than ${field.max_length} characters.`;
      }
      break;
    case 'choice':
      if (typeof value !== 'string' || !field.values.includes(value)) {
        return 'Choose one of the listed options.';
      }
      break;
    case 'number':
    case 'measurement':
      if (
        typeof value !== 'number'
        || !Number.isFinite(value)
        || value < field.min
        || value > field.max
      ) {
        return `Enter a value between ${field.min} and ${field.max}.`;
      }
      if (field.type === 'number') {
        const steps = (value - field.min) / field.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-8) {
          return `Use increments of ${field.step}.`;
        }
      }
      break;
    default: {
      const exhaustive: never = field;
      return exhaustive;
    }
  }
  return undefined;
}

function hasValidSelections(product: ProductWithImages, selections: ProductSelections): boolean {
  return product.options.every((group) => {
    const selected = selections[group.id];
    if (selected === undefined) return !group.required;
    if (group.type === 'choice') {
      const values = Array.isArray(selected) ? selected : selected === undefined ? [] : [selected];
      return values.length > 0 && values.every((value) => (
        typeof value === 'string' && group.values.some((option) => option.value === value && option.available)
      ));
    }
    return typeof selected === 'number'
      && Number.isFinite(selected)
      && selected >= group.min
      && selected <= group.max
      && Math.abs((selected - group.min) / group.step - Math.round((selected - group.min) / group.step)) < 1e-8;
  });
}

function OptionControls({
  product,
  selections,
  setSelections,
}: {
  product: ProductWithImages;
  selections: ProductSelections;
  setSelections: (next: ProductSelections) => void;
}) {
  return (
    <div className="detail-option-groups">
      {product.options.map((group) => {
        const selected = selections[group.id];
        if (group.type === 'choice') {
          const selectedValues = (
            Array.isArray(selected) ? selected : selected === undefined ? [] : [selected]
          ).filter((value): value is string => typeof value === 'string');
          return (
            <fieldset className="detail-option-group" key={group.id}>
              <legend>{group.label}{group.required ? ' *' : ' (optional)'}</legend>
              <div className="detail-choice-options">
                {group.values.map((option) => {
                  const isSelected = selectedValues.includes(option.value);
                  return (
                    <button
                      className={`detail-choice${isSelected ? ' is-selected' : ''}`}
                      type="button"
                      key={option.value}
                      disabled={!option.available}
                      aria-pressed={isSelected}
                      onClick={() => {
                        const nextValues = group.multiple
                          ? isSelected
                            ? selectedValues.filter((value) => value !== option.value)
                            : [...selectedValues, option.value]
                          : !group.required && isSelected
                            ? []
                            : [option.value];
                        const next = { ...selections };
                        if (nextValues.length === 0) delete next[group.id];
                        else next[group.id] = group.multiple ? nextValues : nextValues[0];
                        setSelections(next);
                      }}
                    >
                      {option.swatch && (
                        <span className="detail-choice-swatch" style={{ backgroundColor: option.swatch }} aria-hidden="true" />
                      )}
                      {option.label}
                      {option.price_delta > 0 && <small>+{formatNaira(option.price_delta)}</small>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        }

        return (
          <label className="detail-option-group" key={group.id}>
            <span>{group.label}{group.required ? ' *' : ' (optional)'}</span>
            <div className="detail-range-control">
              <input
                type="number"
                min={group.min}
                max={group.max}
                step={group.step}
                value={typeof selected === 'number' ? selected : ''}
                aria-label={group.label}
                onChange={(event) => {
                  const next = { ...selections };
                  if (event.target.value === '') delete next[group.id];
                  else next[group.id] = Number(event.target.value);
                  setSelections(next);
                }}
              />
              <span>{group.unit}</span>
            </div>
          </label>
        );
      })}
    </div>
  );
}

function CustomRequestDialog({
  product,
  open,
  selections,
  unitPrice,
  onClose,
}: {
  product: ProductWithImages;
  open: boolean;
  selections: ProductSelections;
  unitPrice: number;
  onClose: () => void;
}) {
  const { addItem, setCartOpen } = useShop();
  const settings = useStoreSettings();
  const [answers, setAnswers] = useState<CustomAnswers>({});
  const [quantity, setQuantity] = useState(Math.max(product.min_order_qty, product.custom_request_min_qty));
  const [neededBy, setNeededBy] = useState('');
  const [errors, setErrors] = useState<CustomErrors>({});

  useEffect(() => {
    if (open) {
      setAnswers({});
      setQuantity(Math.max(product.min_order_qty, product.custom_request_min_qty));
      setNeededBy('');
      setErrors({});
    }
  }, [open, product.id, product.min_order_qty, product.custom_request_min_qty]);

  const minimumDate = getLagosDateAfter(product.lead_time_days_min ?? 0);
  const minimumQuantity = Math.max(product.min_order_qty, product.custom_request_min_qty);
  const quantityImpossible = product.max_order_qty !== null && minimumQuantity > product.max_order_qty;

  const updateAnswer = (id: string, value: string | number) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setErrors((current) => ({ ...current, [id]: '' }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: CustomErrors = {};
    for (const field of product.custom_request_fields) {
      const error = validateAnswer(field, answers[field.id]);
      if (error) nextErrors[field.id] = error;
    }
    if (!Number.isInteger(quantity) || quantity < minimumQuantity) {
      nextErrors.quantity = `Minimum custom order: ${minimumQuantity}.`;
    }
    if (product.max_order_qty !== null && quantity > product.max_order_qty) {
      nextErrors.quantity = `Maximum order: ${product.max_order_qty}.`;
    }
    if (product.needed_by_mode === 'required' && !neededBy) {
      nextErrors.needed_by = 'Choose a needed-by date.';
    } else if (neededBy && neededBy < minimumDate) {
      nextErrors.needed_by = `Choose a date on or after ${minimumDate}.`;
    }
    if (quantityImpossible) {
      nextErrors.quantity = 'The custom minimum exceeds this product’s maximum order quantity.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    if (product.custom_request_flow === 'whatsapp_quote') {
      const number = settings.data?.whatsapp_number;
      if (!number) {
        setErrors({ settings: 'The store WhatsApp number is unavailable. Please try again later.' });
        return;
      }
      const optionLines = product.options.flatMap((group) => {
        const value = selections[group.id];
        if (value === undefined) return [];
        const selected = Array.isArray(value) ? value : [value];
        const labels = selected.map((optionValue) => {
          if (group.type === 'choice' && typeof optionValue === 'string') {
            return group.values.find((choice) => choice.value === optionValue)?.label ?? optionValue;
          }
          return `${optionValue} ${group.type === 'range' ? group.unit : ''}`.trim();
        });
        return [`${group.label}: ${labels.join(', ')}`];
      });
      const answerLines = product.custom_request_fields.flatMap((field) => {
        const value = answers[field.id];
        if (value === undefined || value === '') return [];
        return [`${field.label}: ${value}${'unit' in field ? ` ${field.unit}` : ''}`];
      });
      const message = [
        `Hello The Ronkus Brand, I would like a quote for ${product.name}.`,
        `Product: ${window.location.origin}/product/${product.slug}`,
        ...optionLines,
        ...answerLines,
        `Quantity: ${quantity}`,
        ...(neededBy ? [`Needed by: ${neededBy}`] : []),
      ].join('\n');
      window.open(buildWhatsAppUrl(message, number), '_blank', 'noopener,noreferrer');
      onClose();
      return;
    }

    const customRequest = {
      flow: product.custom_request_flow,
      answers: product.custom_request_fields.flatMap((field) => {
        const value = answers[field.id];
        if (value === undefined || value === '') return [];
        return [{
          id: field.id,
          label: field.label,
          value,
          unit: 'unit' in field ? field.unit : null,
        }];
      }),
      fee_ngn: product.custom_request_fee_ngn,
      notice: product.custom_request_notice,
    };
    addItem({
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      image: product.product_images[0]?.url ?? '',
      quantity,
      min_order_qty: minimumQuantity,
      max_order_qty: product.max_order_qty,
      selected_options: selections,
      custom_request: customRequest,
      needed_by: neededBy || null,
      display_unit_price: unitPrice + product.custom_request_fee_ngn,
    });
    onClose();
    setCartOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="commerce-dialog customize-dialog custom-request-dialog">
        <DialogHeader className="commerce-dialog-heading">
          <p className="eyebrow">Make it yours</p>
          <DialogTitle>{product.custom_request_button_label}</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>
        {product.custom_request_notice && (
          <p className="custom-request-notice">{product.custom_request_notice}</p>
        )}
        {product.custom_request_flow === 'checkout' && (
          <div className="custom-request-fee">
            <span>Custom request fee per unit</span>
            <strong>{formatNaira(product.custom_request_fee_ngn)}</strong>
          </div>
        )}
        {settings.isError && product.custom_request_flow === 'whatsapp_quote' && (
          <div className="store-query-error" role="alert">
            <p>We could not load the store contact details.</p>
            <button type="button" className="commerce-secondary-button" onClick={() => void settings.refetch()}>
              Try again
            </button>
          </div>
        )}
        <form className="custom-request-form" onSubmit={handleSubmit}>
          {product.custom_request_fields.map((field) => (
            <CustomRequestInput
              field={field}
              key={field.id}
              value={answers[field.id]}
              error={errors[field.id]}
              onChange={(value) => updateAnswer(field.id, value)}
            />
          ))}
          <label className="commerce-field">
            <span>Quantity</span>
            <input
              type="number"
              min={minimumQuantity}
              max={product.max_order_qty ?? undefined}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
            {errors.quantity && <span className="field-error" role="alert">{errors.quantity}</span>}
          </label>
          {product.needed_by_mode !== 'off' && (
            <label className="commerce-field">
              <span>Needed by{product.needed_by_mode === 'required' ? ' *' : ' (optional)'}</span>
              <input
                type="date"
                min={minimumDate}
                value={neededBy}
                required={product.needed_by_mode === 'required'}
                onChange={(event) => {
                  setNeededBy(event.target.value);
                  setErrors((current) => ({ ...current, needed_by: '' }));
                }}
              />
              {errors.needed_by && <span className="field-error" role="alert">{errors.needed_by}</span>}
            </label>
          )}
          {errors.settings && <p className="field-error" role="alert">{errors.settings}</p>}
          {quantityImpossible && <p className="field-error" role="alert">{errors.quantity}</p>}
          <button
            className="commerce-primary-button"
            type="submit"
            disabled={quantityImpossible || (product.custom_request_flow === 'whatsapp_quote' && settings.isLoading)}
          >
            {product.custom_request_flow === 'whatsapp_quote' ? 'Get a Quote' : 'Add custom order to bag'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomRequestInput({
  field,
  value,
  error,
  onChange,
}: {
  field: CustomRequestField;
  value: string | number | undefined;
  error?: string;
  onChange: (value: string | number) => void;
}) {
  const id = `custom-${field.id}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [field.help_text ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <label className="commerce-field" htmlFor={id}>
      <span>{field.label}{field.required ? ' *' : ' (optional)'}</span>
      {field.type === 'textarea' ? (
        <textarea
          id={id}
          maxLength={field.max_length}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === 'text' ? (
        <input
          id={id}
          type="text"
          maxLength={field.max_length}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === 'choice' ? (
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose one</option>
          {field.values.map((choice) => <option value={choice} key={choice}>{choice}</option>)}
        </select>
      ) : field.type === 'number' || field.type === 'measurement' ? (
        <div className="detail-range-control">
          <input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            step={field.type === 'number' ? field.step : 'any'}
            value={typeof value === 'number' ? value : ''}
            aria-describedby={describedBy}
            onChange={(event) => {
              if (event.target.value !== '') onChange(Number(event.target.value));
              else onChange('');
            }}
          />
          <span>{field.unit}</span>
        </div>
      ) : null}
      {field.help_text && <span className="field-help" id={helpId}>{field.help_text}</span>}
      {error && <span className="field-error" id={errorId} role="alert">{error}</span>}
    </label>
  );
}

function ProductDetails({ product }: { product: ProductWithImages }) {
  const { addItem, setCartOpen } = useShop();
  const categories = useCategories();
  const [selectedImage, setSelectedImage] = useState(0);
  const [selections, setSelections] = useState<ProductSelections>({});
  const [quantity, setQuantity] = useState(product.min_order_qty);
  const [requestOpen, setRequestOpen] = useState(false);
  const selectedImageRecord = product.product_images[Math.min(selectedImage, 2)];
  const category = categories.data?.find(({ id }) => id === product.category_id);
  const subcategory = category?.subcategories.find(({ id }) => id === product.subcategory_id);
  const unitPrice = computeUnitPrice(product, selections);
  const requiredSelectionsMade = hasValidSelections(product, selections);
  const unavailable = product.availability === 'out_of_stock';
  const quantityValid = quantity >= product.min_order_qty
    && (product.max_order_qty === null || quantity <= product.max_order_qty);

  const addToBag = () => {
    if (!requiredSelectionsMade || unavailable || !quantityValid) return;
    addItem({
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      image: selectedImageRecord?.url ?? product.product_images[0]?.url ?? '',
      quantity,
      min_order_qty: product.min_order_qty,
      max_order_qty: product.max_order_qty,
      selected_options: selections,
      custom_request: null,
      needed_by: null,
      display_unit_price: unitPrice,
    });
    setCartOpen(true);
  };

  const earliestLeadTime = product.lead_time_days_min;
  const latestLeadTime = product.lead_time_days_max;
  const leadTime = [
    earliestLeadTime !== null ? `${earliestLeadTime}` : null,
    latestLeadTime !== null ? `${latestLeadTime}` : null,
  ].filter(Boolean);

  return (
    <section className="product-detail-page page-shell">
      <Link className="product-back-link" href={category ? `/shop/${category.slug}` : '/shop'}>
        <ArrowLeft size={16} /> Back to {category?.name ?? 'shop'}
      </Link>
      {categories.isError && (
        <div className="store-query-error" role="alert">
          <p>Category details could not be loaded.</p>
          <button className="commerce-secondary-button" type="button" onClick={() => void categories.refetch()}>
            Try again
          </button>
        </div>
      )}
      {category && (
        <nav className="product-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/shop">Shop</Link><span>/</span>
          <Link href={`/shop/${category.slug}`}>{category.name}</Link>
          {subcategory && <><span>/</span><Link href={`/shop/${category.slug}/${subcategory.slug}`}>{subcategory.name}</Link></>}
        </nav>
      )}
      <div className="product-detail-grid">
        <div className="product-gallery">
          <div className="product-gallery-main">
            {selectedImageRecord ? (
              <img src={selectedImageRecord.url} alt={selectedImageRecord.alt_text || product.name} />
            ) : (
              <div className="product-image-placeholder" aria-label="No product image available" />
            )}
          </div>
          {product.product_images.length > 1 && (
            <div className="product-gallery-thumbnails" aria-label="Product images">
              {product.product_images.slice(0, 3).map((image, index) => (
                <button
                  type="button"
                  className={index === selectedImage ? 'is-selected' : ''}
                  key={image.id}
                  aria-label={`View image ${index + 1}`}
                  aria-pressed={index === selectedImage}
                  onClick={() => setSelectedImage(index)}
                >
                  <img src={image.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-detail-copy">
          <div className="product-detail-badges">
            <span className="product-audience">{product.audience === 'male' ? 'Male' : product.audience === 'female' ? 'Female' : 'Unisex'}</span>
            <span className={`product-availability product-availability-${product.availability}`}>
              {product.availability === 'ready_to_order'
                ? 'Ready to Order'
                : product.availability === 'made_to_order'
                  ? 'Made to Order'
                  : 'Out of stock'}
            </span>
          </div>
          <p className="eyebrow">{category?.name ?? 'The Ronkus Brand'}</p>
          <h1>{product.name}</h1>
          <p className="product-detail-price">
            {formatNaira(requiredSelectionsMade ? unitPrice : fromPrice(product))}
            {product.price_suffix ? ` ${product.price_suffix}` : ''}
          </p>
          {product.description && <p className="product-detail-description">{product.description}</p>}
          <OptionControls product={product} selections={selections} setSelections={setSelections} />
          {!requiredSelectionsMade && (
            <p className="field-error" role="status">Choose all required options and check the selected range values.</p>
          )}
          {product.size_guide_note && <p className="product-size-note">{product.size_guide_note}</p>}
          {(leadTime.length > 0 || product.lead_time_note) && (
            <p className="product-lead-time">
              <strong>Lead time:</strong>{' '}
              {leadTime.length > 0
                ? `${leadTime.length === 1 ? leadTime[0] : `${leadTime[0]}–${leadTime[1]}`} days${product.lead_time_note ? ' · ' : ''}`
                : ''}
              {product.lead_time_note}
            </p>
          )}
          <div className="product-detail-quantity">
            <div>
              <span>Quantity</span>
              <small>Minimum order: {product.min_order_qty}</small>
            </div>
            <div className="quantity-control">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= product.min_order_qty}
                onClick={() => setQuantity((current) => Math.max(product.min_order_qty, current - 1))}
              >
                <Minus size={14} />
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={product.max_order_qty !== null && quantity >= product.max_order_qty}
                onClick={() => setQuantity((current) => current + 1)}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          {unavailable && <p className="field-error" role="status">This product is currently out of stock.</p>}
          <button
            className="commerce-primary-button product-detail-cta"
            type="button"
            disabled={!requiredSelectionsMade || unavailable || !quantityValid}
            onClick={addToBag}
          >
            Add to bag
          </button>
          {product.custom_request_enabled && (
            <button
              className="commerce-secondary-button product-detail-cta"
              type="button"
              disabled={!requiredSelectionsMade || unavailable}
              onClick={() => setRequestOpen(true)}
            >
              {product.custom_request_button_label}
            </button>
          )}
        </div>
      </div>
      {product.custom_request_enabled && (
        <CustomRequestDialog
          product={product}
          open={requestOpen}
          selections={selections}
          unitPrice={unitPrice}
          onClose={() => setRequestOpen(false)}
        />
      )}
    </section>
  );
}

function ProductPageSkeleton() {
  return (
    <div className="product-detail-grid product-detail-skeleton" aria-label="Loading product">
      <div className="product-gallery-main" />
      <div className="product-skeleton-copy">
        <span /><span /><span /><span /><span />
      </div>
    </div>
  );
}

export function ProductPage({ slug }: { slug: string }) {
  const query = useProductBySlug(slug);
  if (query.isPending) {
    return <section className="product-detail-page page-shell"><ProductPageSkeleton /></section>;
  }
  if (query.isError) {
    return (
      <section className="products-empty-state page-shell" role="alert">
        <p className="eyebrow">Store temporarily unavailable</p>
        <h1>We could not load this product.</h1>
        <button className="commerce-primary-button" type="button" onClick={() => void query.refetch()}>Try again</button>
      </section>
    );
  }
  if (!query.data) return <NotFound />;
  return <ProductDetails key={query.data.id} product={query.data} />;
}
