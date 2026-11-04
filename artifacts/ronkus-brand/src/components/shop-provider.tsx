import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getCartSubtotal,
  getCartItemKey,
  mergeCartItem,
  type CartItem,
  type CartItemDraft,
} from '@/lib/shop';

const CART_STORAGE_KEY = 'ronkus-brand-cart-v2';

type ShopContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addItem: (item: CartItemDraft) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const ShopContext = createContext<ShopContextValue | undefined>(undefined);

function isStoredCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CartItem>;
  const validSelectedOptions = Boolean(
    item.selected_options
    && typeof item.selected_options === 'object'
    && !Array.isArray(item.selected_options)
    && Object.values(item.selected_options).every((selection) => (
      typeof selection === 'string'
      || (typeof selection === 'number' && Number.isFinite(selection))
      || (Array.isArray(selection) && selection.every((option) => typeof option === 'string'))
    )),
  );
  const validCustomRequest = item.custom_request === null || (
    Boolean(item.custom_request)
    && typeof item.custom_request === 'object'
    && (item.custom_request.flow === 'checkout' || item.custom_request.flow === 'whatsapp_quote')
    && Array.isArray(item.custom_request.answers)
    && item.custom_request.answers.every((answer) => (
      Boolean(answer)
      && typeof answer.id === 'string'
      && typeof answer.label === 'string'
      && (typeof answer.value === 'string'
        || (typeof answer.value === 'number' && Number.isFinite(answer.value)))
      && (typeof answer.unit === 'string' || answer.unit === null)
    ))
    && typeof item.custom_request.fee_ngn === 'number'
    && Number.isFinite(item.custom_request.fee_ngn)
    && item.custom_request.fee_ngn >= 0
    && (typeof item.custom_request.notice === 'string' || item.custom_request.notice === null)
  );
  const validQuantityRange = Number.isInteger(item.quantity)
    && Number.isInteger(item.min_order_qty)
    && typeof item.quantity === 'number'
    && typeof item.min_order_qty === 'number'
    && item.min_order_qty >= 1
    && item.quantity >= item.min_order_qty
    && (item.max_order_qty === null || (
      typeof item.max_order_qty === 'number'
      && Number.isInteger(item.max_order_qty)
      && item.max_order_qty >= item.min_order_qty
      && item.quantity <= item.max_order_qty
    ));

  return Boolean(
    typeof item.key === 'string'
    && typeof item.product_id === 'string'
    && typeof item.slug === 'string'
    && typeof item.name === 'string'
    && typeof item.image === 'string'
    && typeof item.display_unit_price === 'number'
    && Number.isFinite(item.display_unit_price)
    && validQuantityRange
    && validSelectedOptions
    && validCustomRequest
    && (item.needed_by === null || typeof item.needed_by === 'string'),
  );
}

function getInitialCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) {
      console.warn('Stored shopping bag has an invalid format and was ignored.');
      return [];
    }
    const items = parsed.filter(isStoredCartItem);
    if (items.length !== parsed.length) {
      console.warn('Invalid shopping bag entries were ignored.');
    }
    return items;
  } catch (error) {
    console.warn('Stored shopping bag could not be read.', error);
    return [];
  }
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(getInitialCart);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn('Shopping bag could not be saved to browser storage.', error);
    }
  }, [items]);

  const addItem = useCallback((item: CartItemDraft) => {
    setItems((current) => mergeCartItem(current, item));
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) => current
      .map((item) => item.key === key ? {
        ...item,
        quantity: Math.min(
          item.max_order_qty ?? Number.MAX_SAFE_INTEGER,
          Math.max(item.min_order_qty, Math.floor(quantity)),
        ),
      } : item));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo<ShopContextValue>(() => ({
    items,
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    subtotal: getCartSubtotal(items),
    cartOpen,
    setCartOpen,
    addItem,
    setQuantity,
    removeItem,
    clearCart,
  }), [items, cartOpen, addItem, setQuantity, removeItem, clearCart]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used inside ShopProvider.');
  }
  return context;
}

export { CART_STORAGE_KEY, getCartItemKey };
