import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, MessageCircle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShop } from '@/components/shop-provider';
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  formatNaira,
  getCartSubtotal,
  type CheckoutCustomer,
} from '@/lib/shop';
import { useStoreSettings } from '@/lib/store-api';
import { Link } from 'wouter';

const emptyCustomer: CheckoutCustomer = { name: '', phone: '', address: '' };

export function ShoppingCartDialog() {
  const {
    items,
    itemCount,
    subtotal,
    cartOpen,
    setCartOpen,
    setQuantity,
    removeItem,
  } = useShop();
  const settings = useStoreSettings();
  const [checkout, setCheckout] = useState(false);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    if (!cartOpen) {
      setCheckout(false);
      setCustomer(emptyCustomer);
      setValidationMessage('');
    }
  }, [cartOpen]);

  const beginCheckout = () => {
    if (items.length) {
      setCheckout(true);
      setValidationMessage('');
    }
  };

  const handleCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customer.name.trim() || !customer.address.trim()) {
      setValidationMessage('Please enter your name and delivery address.');
      return;
    }
    if (customer.phone.replace(/\D/g, '').length < 7) {
      setValidationMessage('Please enter a valid phone number with at least 7 digits.');
      return;
    }

    const orderTotal = getCartSubtotal(items);
    const message = buildWhatsAppMessage(customer, items, orderTotal);
    const whatsappNumber = settings.data?.whatsapp_number;
    if (!whatsappNumber) {
      setValidationMessage('The store WhatsApp number is unavailable. Please try again later.');
      return;
    }
    const url = buildWhatsAppUrl(message, whatsappNumber);
    const whatsappLink = document.createElement('a');
    whatsappLink.href = url;
    whatsappLink.target = '_blank';
    whatsappLink.rel = 'noopener noreferrer';
    whatsappLink.click();
  };

  const updateCustomer = (field: keyof CheckoutCustomer, value: string) => {
    setCustomer((current) => ({ ...current, [field]: value }));
    setValidationMessage('');
  };

  return (
    <Dialog
      open={cartOpen}
      onOpenChange={(open) => {
        if (!open) setCartOpen(false);
      }}
    >
      <DialogContent className="commerce-dialog cart-dialog">
        <DialogHeader className="commerce-dialog-heading cart-dialog-heading">
          {checkout ? (
            <button className="commerce-back-button" type="button" onClick={() => setCheckout(false)}>
              <ArrowLeft size={16} /> Back to bag
            </button>
          ) : (
            <p className="eyebrow">A few things for your look</p>
          )}
          <DialogTitle>{checkout ? 'Delivery details' : 'Your Shopping Bag'}</DialogTitle>
          <DialogDescription>
            {checkout
              ? 'Add your details, then send your order to us on WhatsApp.'
              : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} in your bag`}
          </DialogDescription>
        </DialogHeader>

        {!checkout && items.length === 0 && (
          <div className="empty-cart-state">
            <span className="empty-cart-icon"><ShoppingBag size={25} /></span>
            <h3>Your bag is waiting</h3>
            <p>Explore the shop and add a piece that feels like you.</p>
            <button
              className="commerce-primary-button"
              type="button"
              onClick={() => setCartOpen(false)}
            >
              Continue shopping
            </button>
          </div>
        )}

        {!checkout && items.length > 0 && (
          <div className="cart-content">
            <div className="cart-item-list" aria-label="Items in your cart">
              {items.map((item) => (
                <article className="cart-item" key={item.key}>
                  {item.image ? (
                    <img src={item.image} alt="" width="104" height="124" loading="lazy" decoding="async" />
                  ) : (
                    <div className="cart-item-placeholder" aria-hidden="true" />
                  )}
                  <div className="cart-item-main">
                    <div className="cart-item-heading">
                      <div>
                        <span className="cart-item-category">The Ronkus Brand</span>
                        <h3><Link href={`/product/${item.slug}`}>{item.name}</Link></h3>
                      </div>
                      <button
                        className="cart-remove-button"
                        type="button"
                        aria-label={`Remove ${item.name} from cart`}
                        onClick={() => removeItem(item.key)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="cart-item-options">
                      {Object.entries(item.selected_options).map(([label, selection]) => (
                        <span key={label}>
                          {label}: {Array.isArray(selection) ? selection.join(', ') : selection}
                        </span>
                      ))}
                      {item.custom_request && (
                        <>
                          {item.custom_request.answers.map((answer) => (
                            <span key={answer.id}>
                              {answer.label}: {answer.value}{answer.unit ? ` ${answer.unit}` : ''}
                            </span>
                          ))}
                          {item.custom_request.fee_ngn > 0 && (
                            <span>Custom request fee: {formatNaira(item.custom_request.fee_ngn)} per unit</span>
                          )}
                        </>
                      )}
                      {item.needed_by && <span>Needed by: {item.needed_by}</span>}
                    </div>
                    <div className="cart-item-bottom">
                      <div className="quantity-control" aria-label={`Quantity for ${item.name}`}>
                        <button
                          type="button"
                          aria-label={`Decrease ${item.name} quantity`}
                          disabled={item.quantity <= item.min_order_qty}
                          onClick={() => setQuantity(item.key, item.quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span aria-live="polite">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Increase ${item.name} quantity`}
                          disabled={item.max_order_qty !== null && item.quantity >= item.max_order_qty}
                          onClick={() => setQuantity(item.key, item.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="cart-item-pricing">
                        <span>{formatNaira(item.display_unit_price)} each</span>
                        <strong>{formatNaira(item.display_unit_price * item.quantity)}</strong>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="cart-summary">
              <div><span>Subtotal</span><strong>{formatNaira(subtotal)}</strong></div>
              <div className="cart-order-total"><span>Order total</span><strong>{formatNaira(subtotal)}</strong></div>
              <p>Delivery fee, if applicable, will be confirmed separately.</p>
              <button className="commerce-primary-button" type="button" onClick={beginCheckout}>
                Continue to Checkout
              </button>
              <button className="commerce-secondary-button" type="button" onClick={() => setCartOpen(false)}>
                Continue shopping
              </button>
            </div>
          </div>
        )}

        {checkout && (
          <div className="checkout-content">
            <div className="checkout-order-summary">
              <p className="cart-summary-label">Order summary</p>
              {items.map((item) => (
                <div className="checkout-summary-line" key={item.key}>
                  <span>{item.name} × {item.quantity}</span>
                  <strong>{formatNaira(item.display_unit_price * item.quantity)}</strong>
                </div>
              ))}
              <div className="checkout-summary-total">
                <span>Order total</span><strong>{formatNaira(subtotal)}</strong>
              </div>
            </div>
            <form className="checkout-form" onSubmit={handleCheckout}>
              <label className="commerce-field">
                <span>Customer name</span>
                <input
                  autoComplete="name"
                  value={customer.name}
                  onChange={(event) => updateCustomer('name', event.target.value)}
                  required
                />
              </label>
              <label className="commerce-field">
                <span>Phone number</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  minLength={7}
                  value={customer.phone}
                  onChange={(event) => updateCustomer('phone', event.target.value)}
                  placeholder="+234 ..."
                  required
                />
              </label>
              <label className="commerce-field">
                <span>Delivery address</span>
                <textarea
                  autoComplete="street-address"
                  value={customer.address}
                  onChange={(event) => updateCustomer('address', event.target.value)}
                  rows={3}
                  required
                />
              </label>
              {validationMessage && (
                <p className="field-error" role="alert">{validationMessage}</p>
              )}
              <button className="commerce-primary-button whatsapp-checkout-button" type="submit">
                <MessageCircle size={18} /> Checkout via WhatsApp
              </button>
              {settings.isError && (
                <button className="commerce-secondary-button" type="button" onClick={() => void settings.refetch()}>
                  Retry loading store contact
                </button>
              )}
              <p className="checkout-note">
                Your cart will stay saved while you confirm your order with us.
              </p>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
