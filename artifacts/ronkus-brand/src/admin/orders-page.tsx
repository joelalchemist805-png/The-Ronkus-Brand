import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Clipboard,
  Clock3,
  Package,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/lib/db-types';
import { friendlyAdminError } from './admin-api';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminPageHeader,
  AdminSelect,
  AdminTextarea,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from './admin-components';
import { adminSupabase } from './admin-supabase';
import {
  buildOrderSearchFilter,
  buildOrderSummaryText,
  buildWhatsAppUrl,
  getAwaitingPaymentLabel,
  getLagosDateRange,
  getOrderTransitions,
  renderOrderItemDetails,
  type OrderDatePreset,
  type OrderFulfilmentMethod,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderTab,
  type OrderTransition,
} from './order-helpers';
import { formatLagosDateTime, formatNaira } from './helpers';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'];
type OrderPayment = Pick<
  Database['public']['Tables']['payments']['Row'],
  'id' | 'provider' | 'reference' | 'amount_ngn' | 'status' | 'verified_at'
>;
type OrderHistory = Pick<
  Database['public']['Tables']['order_status_history']['Row'],
  'id' | 'from_status' | 'to_status' | 'changed_at'
>;

type Filters = {
  search: string;
  status: '' | OrderStatus;
  payment: '' | OrderPaymentStatus;
  fulfilment: '' | OrderFulfilmentMethod;
  datePreset: OrderDatePreset;
  startDate: string;
  endDate: string;
};

const initialFilters: Filters = {
  search: '',
  status: '',
  payment: '',
  fulfilment: '',
  datePreset: '',
  startDate: '',
  endDate: '',
};

const tabs: { value: OrderTab; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'all', label: 'All' },
];

const statuses: OrderStatus[] = [
  'pending',
  'paid',
  'preparing',
  'delivering',
  'delivered',
  'canceled',
];

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  preparing: 'Preparing',
  delivering: 'Delivering',
  delivered: 'Delivered',
  canceled: 'Canceled',
};

const paymentLabels: Record<OrderPaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function mapOrderError(error: { code?: string | null; message: string }): string {
  const message = error.message.toLowerCase();
  if (error.code === '22P02') return 'Order not found.';
  if (message.includes('cannot enter paid status') || message.includes('before payment_status is paid')) {
    return 'Paid status is set by the payment system and cannot be changed from this dashboard.';
  }
  if (error.code === '23514' || error.code === 'P0001') {
    return 'That order update is not allowed. Refresh the order and try again.';
  }
  return friendlyAdminError(error);
}

async function countOrders(filters: Filters, tab: OrderTab, status?: OrderStatus): Promise<number> {
  let query = adminSupabase.from('orders').select('id', { count: 'exact', head: true });
  const dateRange = getLagosDateRange(filters.datePreset, filters.startDate, filters.endDate);
  if (dateRange.from) query = query.gte('created_at', dateRange.from);
  if (dateRange.to) query = query.lt('created_at', dateRange.to);
  const searchFilter = buildOrderSearchFilter(filters.search);
  if (searchFilter) {
    query = query.or(searchFilter);
  }
  if (status === undefined && filters.status) query = query.eq('order_status', filters.status);
  if (filters.payment) query = query.eq('payment_status', filters.payment);
  if (filters.fulfilment) query = query.eq('fulfilment_method', filters.fulfilment);
  if (tab === 'todo') {
    query = query.in('order_status', ['paid', 'preparing', 'delivering']);
  } else if (tab === 'awaiting_payment') {
    query = query.eq('order_status', 'pending').eq('payment_status', 'unpaid');
  }
  if (status) query = query.eq('order_status', status);
  const { count, error } = await query;
  if (error) throw new Error(mapOrderError(error));
  return count ?? 0;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`orders-badge orders-status-${status}`}>{statusLabels[status]}</span>;
}

function PaymentBadge({ status }: { status: OrderPaymentStatus }) {
  return <span className={`orders-badge orders-payment-${status}`}>{paymentLabels[status]}</span>;
}

function FulfilmentIcon({ method }: { method: OrderFulfilmentMethod }) {
  return method === 'delivery'
    ? <span className="orders-fulfilment"><Truck size={16} aria-hidden="true" /> Delivery</span>
    : <span className="orders-fulfilment"><Package size={16} aria-hidden="true" /> Pickup</span>;
}

function orderPath(orderId: string): string {
  return `/admin/orders/${encodeURIComponent(orderId)}`;
}

function OrderListRow({
  order,
  tab,
  onNavigate,
}: {
  order: Order;
  tab: OrderTab;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  const awaitingLabel = tab === 'awaiting_payment'
    ? getAwaitingPaymentLabel(order.created_at)
    : null;
  const isNew = order.order_status === 'paid';
  return (
    <a
      href={orderPath(order.id)}
      onClick={onNavigate}
      className={`orders-row ${isNew ? 'is-new' : ''}`}
      aria-label={`Order ${order.order_number}, ${order.customer_name}, ${statusLabels[order.order_status]}`}
    >
      <div className="orders-row-main">
        <div className="orders-row-title">
          <strong>{order.order_number}</strong>
          {isNew && <span className="orders-new-tag">NEW</span>}
          {awaitingLabel && (
            <span className={awaitingLabel === 'Abandoned' ? 'orders-abandoned-tag' : 'orders-awaiting-tag'}>
              {awaitingLabel}
            </span>
          )}
        </div>
        <strong className="orders-customer-name">{order.customer_name}</strong>
        <span className="orders-date">{formatLagosDateTime(order.created_at)}</span>
      </div>
      <div className="orders-row-side">
        <strong className="orders-total">{formatNaira(order.total_ngn)}</strong>
        <div className="orders-badges">
          <StatusBadge status={order.order_status} />
          <PaymentBadge status={order.payment_status} />
        </div>
        <FulfilmentIcon method={order.fulfilment_method} />
      </div>
    </a>
  );
}

function OrdersListPage({
  onNavigate,
}: {
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  const [tab, setTab] = useState<OrderTab>('todo');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [rows, setRows] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tabCounts, setTabCounts] = useState<Record<OrderTab, number>>({
    todo: 0,
    awaiting_payment: 0,
    all: 0,
  });
  const [statusCounts, setStatusCounts] = useState<Partial<Record<OrderStatus, number>>>({});
  const [visibleLimit, setVisibleLimit] = useState(25);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateRange = getLagosDateRange(filters.datePreset, filters.startDate, filters.endDate);

  useEffect(() => {
    let interval: number | undefined;
    const startTimer = () => {
      if (interval === undefined) {
        interval = window.setInterval(() => setRefreshVersion((version) => version + 1), 60_000);
      }
    };
    const stopTimer = () => {
      if (interval !== undefined) window.clearInterval(interval);
      interval = undefined;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startTimer();
        setRefreshVersion((version) => version + 1);
      } else {
        stopTimer();
      }
    };
    if (document.visibilityState === 'visible') startTimer();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (dateRange.error) {
      setLoading(false);
      setRows([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          let listQuery = adminSupabase
            .from('orders')
            .select('*', { count: 'exact' });
          const dateBounds = getLagosDateRange(filters.datePreset, filters.startDate, filters.endDate);
          if (dateBounds.from) listQuery = listQuery.gte('created_at', dateBounds.from);
          if (dateBounds.to) listQuery = listQuery.lt('created_at', dateBounds.to);
          const searchFilter = buildOrderSearchFilter(filters.search);
          if (searchFilter) listQuery = listQuery.or(searchFilter);
          if (filters.status) listQuery = listQuery.eq('order_status', filters.status);
          if (filters.payment) listQuery = listQuery.eq('payment_status', filters.payment);
          if (filters.fulfilment) listQuery = listQuery.eq('fulfilment_method', filters.fulfilment);
          if (tab === 'todo') {
            listQuery = listQuery.in('order_status', ['paid', 'preparing', 'delivering']);
          } else if (tab === 'awaiting_payment') {
            listQuery = listQuery.eq('order_status', 'pending').eq('payment_status', 'unpaid');
          }
          if (tab === 'todo') {
            listQuery = listQuery
              .order('order_status', { ascending: true })
              .order('created_at', { ascending: false });
          } else {
            listQuery = listQuery.order('created_at', { ascending: false });
          }
          const [listResult, todoCount, awaitingCount, allCount, ...perStatus] = await Promise.all([
            listQuery.range(0, visibleLimit - 1),
            countOrders(filters, 'todo'),
            countOrders(filters, 'awaiting_payment'),
            countOrders(filters, 'all'),
            ...statuses.map((status) => countOrders(filters, tab, status)),
          ]);
          if (listResult.error) throw new Error(mapOrderError(listResult.error));
          if (!active) return;
          setRows(listResult.data ?? []);
          setTotalCount(listResult.count ?? 0);
          setTabCounts({ todo: todoCount, awaiting_payment: awaitingCount, all: allCount });
          setStatusCounts(Object.fromEntries(statuses.map((status, index) => [status, perStatus[index]])));
        } catch (loadError) {
          if (!active) return;
          setError(errorText(loadError));
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [tab, filters, visibleLimit, refreshVersion, dateRange.error]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleLimit(25);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setVisibleLimit(25);
  };

  const selectStatus = (status: OrderStatus | '') => {
    updateFilter('status', status);
  };

  const emptyMessage = tab === 'todo'
    ? 'No orders to prepare yet. Paid orders will appear here once customers check out.'
    : tab === 'awaiting_payment'
      ? 'No unpaid checkouts are waiting for payment.'
      : 'No orders found.';

  return (
    <div className="admin-page orders-page">
      <AdminPageHeader
        title="Orders"
        description="Review customer orders and update fulfilment status."
      >
        <AdminButton
          type="button"
          variant="secondary"
          className="orders-refresh"
          disabled={loading}
          onClick={() => setRefreshVersion((version) => version + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </AdminButton>
      </AdminPageHeader>

      <div className="orders-tabs" role="tablist" aria-label="Order views">
        {tabs.map(({ value, label }) => (
          <button
            key={value}
            id={`orders-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls="orders-list-panel"
            className={tab === value ? 'is-current' : ''}
            onClick={() => {
              setTab(value);
              setVisibleLimit(25);
            }}
          >
            {label}<span>{tabCounts[value]}</span>
          </button>
        ))}
      </div>

      <AdminCard className="orders-filters">
        <div className="orders-filter-grid">
          <AdminInput
            id="orders-search"
            label="Search orders"
            type="search"
            placeholder="Order number, customer, or phone"
            value={filters.search}
            onChange={(value) => updateFilter('search', value)}
          />
          <AdminSelect
            id="orders-status-filter"
            label="Order status"
            value={filters.status}
            onChange={(value) => updateFilter('status', value as Filters['status'])}
            options={[
              { value: '', label: 'All statuses' },
              ...statuses.map((status) => ({ value: status, label: statusLabels[status] })),
            ]}
          />
          <AdminSelect
            id="orders-payment-filter"
            label="Payment status"
            value={filters.payment}
            onChange={(value) => updateFilter('payment', value as Filters['payment'])}
            options={[
              { value: '', label: 'All payment statuses' },
              ...(['unpaid', 'paid', 'failed', 'refunded'] as const)
                .map((status) => ({ value: status, label: paymentLabels[status] })),
            ]}
          />
          <AdminSelect
            id="orders-fulfilment-filter"
            label="Fulfilment"
            value={filters.fulfilment}
            onChange={(value) => updateFilter('fulfilment', value as Filters['fulfilment'])}
            options={[
              { value: '', label: 'Pickup and delivery' },
              { value: 'pickup', label: 'Pickup' },
              { value: 'delivery', label: 'Delivery' },
            ]}
          />
          <AdminSelect
            id="orders-date-preset"
            label="Date range (Lagos)"
            value={filters.datePreset}
            onChange={(value) => {
              updateFilter('datePreset', value as OrderDatePreset);
            }}
            options={[
              { value: '', label: 'Any date' },
              { value: 'today', label: 'Today' },
              { value: 'last7', label: 'Last 7 days' },
              { value: 'last30', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom dates' },
            ]}
          />
          {filters.datePreset === 'custom' && (
            <div className="orders-custom-dates">
              <AdminInput
                id="orders-start-date"
                label="From date"
                type="date"
                value={filters.startDate}
                onChange={(value) => updateFilter('startDate', value)}
                error={dateRange.error}
              />
              <AdminInput
                id="orders-end-date"
                label="To date"
                type="date"
                value={filters.endDate}
                onChange={(value) => updateFilter('endDate', value)}
                error={dateRange.error}
              />
            </div>
          )}
        </div>
        <div className="orders-filter-actions">
          <AdminButton type="button" variant="quiet" onClick={resetFilters}>Clear filters</AdminButton>
        </div>
      </AdminCard>

      <div className="orders-status-chips" aria-label="Order status counts">
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            className={filters.status === status ? 'is-current' : ''}
            aria-pressed={filters.status === status}
            onClick={() => selectStatus(filters.status === status ? '' : status)}
          >
            <StatusBadge status={status} />
            <span>{statusCounts[status] ?? 0}</span>
          </button>
        ))}
      </div>

      <section id="orders-list-panel" role="tabpanel" aria-labelledby={`orders-tab-${tab}`}>
        {error && (
          <div className="admin-alert" role="alert">
            {error}
            <AdminButton type="button" variant="secondary" onClick={() => setRefreshVersion((version) => version + 1)}>
              Try again
            </AdminButton>
          </div>
        )}
        {loading && rows.length === 0 && <LoadingState label="Loading orders…" />}
        {!loading && !error && rows.length === 0 && <AdminCard><EmptyState>{emptyMessage}</EmptyState></AdminCard>}
        {rows.length > 0 && (
          <>
            <div className="orders-list" aria-live="polite">
              {rows.map((order) => (
                <OrderListRow key={order.id} order={order} tab={tab} onNavigate={onNavigate} />
              ))}
            </div>
            <div className="orders-list-footer">
              <span>Showing {rows.length} of {totalCount}</span>
              {rows.length < totalCount && (
                <AdminButton
                  type="button"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => setVisibleLimit((limit) => limit + 25)}
                >
                  {loading ? 'Loading…' : 'Load more'}
                </AdminButton>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function OrderDetailPage({
  id,
  onNavigate,
}: {
  id: string;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [history, setHistory] = useState<OrderHistory[]>([]);
  const [adminNote, setAdminNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [workingStatus, setWorkingStatus] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: orderData, error: orderError } = await adminSupabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (orderError) throw new Error(mapOrderError(orderError));
      if (!orderData) {
        setOrder(null);
        setError('Order not found.');
        return;
      }

      const [itemsResult, paymentsResult, historyResult] = await Promise.all([
        adminSupabase
          .from('order_items')
          .select('id, order_id, product_id, product_name, unit_price_ngn, quantity, selected_options, customization, customization_fee_ngn, needed_by, line_total_ngn, created_at')
          .eq('order_id', id)
          .order('created_at', { ascending: true }),
        adminSupabase
          .from('payments')
          .select('id, provider, reference, amount_ngn, status, verified_at')
          .eq('order_id', id)
          .order('created_at', { ascending: false }),
        adminSupabase
          .from('order_status_history')
          .select('id, from_status, to_status, changed_at')
          .eq('order_id', id)
          .order('changed_at', { ascending: true }),
      ]);
      if (itemsResult.error) throw new Error(mapOrderError(itemsResult.error));
      if (paymentsResult.error) throw new Error(mapOrderError(paymentsResult.error));
      if (historyResult.error) throw new Error(mapOrderError(historyResult.error));

      setOrder(orderData);
      setAdminNote(orderData.admin_note ?? '');
      setItems(itemsResult.data ?? []);
      setPayments(paymentsResult.data ?? []);
      setHistory(historyResult.data ?? []);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder, refreshVersion]);

  const transitions = order ? getOrderTransitions(order) : [];
  const cancel = transitions.find(({ status }) => status === 'canceled');
  const advancement = transitions.filter(({ status }) => status !== 'canceled');
  const paymentMismatch = order?.order_status === 'paid' && order.payment_status !== 'paid';
  const canEditNote = Boolean(order && adminNote !== (order.admin_note ?? ''));
  const whatsappUrl = order ? buildWhatsAppUrl(order.customer_phone) : null;

  const updateStatus = async (transition: OrderTransition) => {
    if (!order) return;
    setWorkingStatus(true);
    try {
      const { data, error: updateError } = await adminSupabase
        .from('orders')
        .update({ order_status: transition.status })
        .eq('id', order.id)
        .eq('order_status', order.order_status)
        .select('*')
        .maybeSingle();
      if (updateError) throw new Error(mapOrderError(updateError));
      if (!data) {
        await loadOrder();
        throw new Error('This order changed in another admin session. It has been reloaded.');
      }
      setOrder(data);
      const { data: updatedHistory, error: historyError } = await adminSupabase
        .from('order_status_history')
        .select('id, from_status, to_status, changed_at')
        .eq('order_id', order.id)
        .order('changed_at', { ascending: true });
      if (historyError) {
        toast.error(`The order was updated, but its history could not be refreshed: ${mapOrderError(historyError)}`);
      } else {
        setHistory(updatedHistory ?? []);
      }
      toast.success(`Order marked ${statusLabels[transition.status].toLowerCase()}.`);
    } finally {
      setWorkingStatus(false);
    }
  };

  const saveAdminNote = async () => {
    if (!order) return;
    if (adminNote.length > 1000) {
      setNoteError('Admin notes must be 1000 characters or fewer.');
      return;
    }
    setNoteError(undefined);
    setSavingNote(true);
    try {
      const { data, error: updateError } = await adminSupabase
        .from('orders')
        .update({ admin_note: adminNote.trim() || null })
        .eq('id', order.id)
        .eq('order_status', order.order_status)
        .select('*')
        .maybeSingle();
      if (updateError) throw new Error(mapOrderError(updateError));
      if (!data) {
        toast.error('This order changed in another admin session. It has been reloaded.');
        await loadOrder();
        return;
      }
      setOrder(data);
      setAdminNote(data.admin_note ?? '');
      toast.success('Admin note saved.');
    } catch (saveError) {
      toast.error(errorText(saveError));
    } finally {
      setSavingNote(false);
    }
  };

  const copySummary = async () => {
    if (!order) return;
    const summary = buildOrderSummaryText(order, items);
    try {
      await navigator.clipboard.writeText(summary);
      toast.success('Order summary copied.');
    } catch {
      toast.error('Could not copy the order summary. Check clipboard permissions and try again.');
    }
  };

  const cancelMessage = order?.payment_status === 'paid'
    ? `Cancel this paid order? The dashboard will not refund the customer; process any refund in the Paystack dashboard. A paid order's coupon use is not released by this cancellation flow.`
    : 'Cancel this unpaid checkout? If a coupon was applied, its reserved use will be released.';

  if (loading && !order) return <LoadingState label="Loading order…" />;
  if (error && !order) {
    return (
      <div className="admin-page orders-page">
        <AdminPageHeader title="Order not found" description={error} />
        <AdminButton type="button" variant="secondary" onClick={() => setRefreshVersion((version) => version + 1)}>
          Reload order
        </AdminButton>
      </div>
    );
  }
  if (!order) return <div className="admin-page orders-page"><EmptyState>Order not found.</EmptyState></div>;

  return (
    <div className="admin-page orders-page orders-detail-page">
      <div className="orders-back-row">
        <a href="/admin/orders" onClick={onNavigate} className="orders-back-link">
          <ArrowLeft size={17} aria-hidden="true" /> All orders
        </a>
        <AdminButton
          type="button"
          variant="secondary"
          className="orders-refresh"
          disabled={loading}
          onClick={() => setRefreshVersion((version) => version + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </AdminButton>
      </div>

      <AdminPageHeader
        title={order.order_number}
        description={`Created ${formatLagosDateTime(order.created_at)} · Updated ${formatLagosDateTime(order.updated_at)}`}
      >
        <div className="orders-header-badges">
          <StatusBadge status={order.order_status} />
          <PaymentBadge status={order.payment_status} />
        </div>
      </AdminPageHeader>
      {error && <div className="admin-alert" role="alert">{error}</div>}

      <AdminCard className="orders-status-card">
        <div className="admin-card-heading">
          <div>
            <h2>Order status</h2>
            <p>Payment status is read-only and is updated by the payment system.</p>
          </div>
        </div>
        {paymentMismatch && (
          <div className="admin-alert orders-warning" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            This order is marked paid, but its payment status is not paid. All status actions except cancellation are disabled.
          </div>
        )}
        {order.order_status === 'pending' && (
          <p className="admin-note orders-awaiting-note">
            Awaiting payment. Do not prepare or deliver this order until payment is confirmed.
          </p>
        )}
        {(order.order_status === 'delivered' || order.order_status === 'canceled') && (
          <p className="admin-note">
            {order.order_status === 'delivered'
              ? 'This order is delivered and final; no further status actions are available.'
              : 'This order is canceled and final; no further status actions are available.'}
          </p>
        )}
        {order.order_status !== 'delivered' && order.order_status !== 'canceled' && (
          <div className="orders-action-buttons">
            {advancement.map((transition) => (
              <AdminButton
                key={transition.status}
                type="button"
                disabled={workingStatus}
                onClick={() => void updateStatus(transition).catch((failure: unknown) => toast.error(errorText(failure)))}
              >
                {transition.label}
              </AdminButton>
            ))}
            {cancel && (
              <ConfirmDialog
                label="Cancel this order?"
                message={cancelMessage}
                confirmLabel="Cancel order"
                onConfirm={() => updateStatus(cancel)}
              >
                <AdminButton type="button" variant="danger" disabled={workingStatus}>
                  Cancel order
                </AdminButton>
              </ConfirmDialog>
            )}
          </div>
        )}
      </AdminCard>

      <div className="orders-detail-grid">
        <AdminCard>
          <h2>Customer</h2>
          <dl className="admin-detail-grid orders-detail-fields">
            <div><dt>Name</dt><dd>{order.customer_name}</dd></div>
            <div>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${order.customer_phone.replace(/[^\d+]/g, '')}`}>{order.customer_phone}</a>
                {whatsappUrl && <a className="orders-whatsapp-link" href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>}
              </dd>
            </div>
            {order.customer_email && <div><dt>Email</dt><dd><a href={`mailto:${order.customer_email}`}>{order.customer_email}</a></dd></div>}
          </dl>
        </AdminCard>

        <AdminCard>
          <h2>Fulfilment</h2>
          <div className="orders-fulfilment-detail">
            <FulfilmentIcon method={order.fulfilment_method} />
            {order.fulfilment_method === 'delivery' ? (
              <>
                <p><strong>Area</strong><span>{order.delivery_area_name || 'Not recorded'}</span></p>
                <p><strong>Address</strong><span>{order.delivery_address || 'Not recorded'}</span></p>
                <p><strong>Delivery fee</strong><span>{formatNaira(order.delivery_fee_ngn)}</span></p>
              </>
            ) : (
              <p>Customer will collect the order.</p>
            )}
          </div>
        </AdminCard>
      </div>

      <AdminCard>
        <h2>Items</h2>
        {items.length === 0 ? <EmptyState>No items were recorded for this order.</EmptyState> : (
          <div className="orders-items-list">
            {items.map((item) => {
              const details = renderOrderItemDetails(item.selected_options, item.customization);
              return (
                <article key={item.id} className="orders-item">
                  <div className="orders-item-heading">
                    <strong>{item.product_name}</strong>
                    <span>{item.quantity} × {formatNaira(item.unit_price_ngn)} = {formatNaira(item.line_total_ngn)}</span>
                  </div>
                  {details.length > 0 && (
                    <ul>{details.map((line, index) => <li key={`${item.id}-detail-${index}`}>{line}</li>)}</ul>
                  )}
                  {item.customization_fee_ngn > 0 && <p>Customization fee: {formatNaira(item.customization_fee_ngn)}</p>}
                  {item.needed_by && <p>Needed by: {item.needed_by}</p>}
                </article>
              );
            })}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <h2>Totals</h2>
        <dl className="orders-totals">
          <div><dt>Subtotal</dt><dd>{formatNaira(order.subtotal_ngn)}</dd></div>
          <div><dt>Delivery fee</dt><dd>{formatNaira(order.delivery_fee_ngn)}</dd></div>
          <div>
            <dt>Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</dt>
            <dd>−{formatNaira(order.discount_ngn)}</dd>
          </div>
          <div className="orders-grand-total"><dt>Total</dt><dd>{formatNaira(order.total_ngn)}</dd></div>
        </dl>
      </AdminCard>

      <AdminCard className="orders-notes-card">
        <h2>Customer note</h2>
        <p className="orders-customer-note">{order.customer_note || 'No customer note.'}</p>
        <div className="orders-admin-note">
          <AdminTextarea
            id="orders-admin-note"
            label="Admin note"
            value={adminNote}
            onChange={(value) => {
              setAdminNote(value);
              setNoteError(undefined);
            }}
            error={noteError}
            maxLength={1000}
            rows={4}
            hint={`${adminNote.length}/1000 characters`}
          />
          <AdminButton
            type="button"
            disabled={!canEditNote || savingNote || adminNote.length > 1000}
            onClick={() => void saveAdminNote()}
          >
            {savingNote ? 'Saving…' : 'Save note'}
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard>
        <div className="admin-card-heading">
          <h2>Payments</h2>
          <span className="orders-read-only">Read only</span>
        </div>
        {payments.length === 0 ? <EmptyState>No payment recorded</EmptyState> : (
          <div className="orders-payments-list">
            {payments.map((payment) => (
              <div key={payment.id} className="orders-payment-row">
                <div><strong>{payment.provider}</strong><span>Reference: {payment.reference}</span></div>
                <div><strong>{formatNaira(payment.amount_ngn)}</strong><span>{payment.status}</span></div>
                <div><strong>Verified</strong><span>{formatLagosDateTime(payment.verified_at)}</span></div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <h2>Status history</h2>
        <p className="admin-inline-note">The initial status at order creation is not recorded in this timeline.</p>
        {history.length === 0 ? <EmptyState>No status changes recorded.</EmptyState> : (
          <ol className="orders-timeline">
            {history.map((entry) => (
              <li key={entry.id}>
                <span className="orders-timeline-icon"><Clock3 size={15} aria-hidden="true" /></span>
                <div><strong>{statusLabels[entry.from_status]} → {statusLabels[entry.to_status]}</strong><span>{formatLagosDateTime(entry.changed_at)}</span></div>
              </li>
            ))}
          </ol>
        )}
      </AdminCard>

      <div className="orders-detail-actions">
        <AdminButton type="button" variant="secondary" onClick={() => void copySummary()}>
          <Clipboard size={16} aria-hidden="true" /> Copy order summary
        </AdminButton>
      </div>
    </div>
  );
}

export function OrdersPage({
  orderId,
  onNavigate,
}: {
  orderId?: string;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  return orderId
    ? <OrderDetailPage key={orderId} id={orderId} onNavigate={onNavigate} />
    : <OrdersListPage onNavigate={onNavigate} />;
}
