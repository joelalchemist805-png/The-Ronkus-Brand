import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Database } from '@/lib/db-types';
import { AdminButton, AdminCard, AdminInput, AdminSelect, EmptyState } from './admin-components';
import { adminSupabase } from './admin-supabase';
import {
  buildSalesChartData,
  formatNaira,
  getAnalyticsDateRange,
  isValidAnalyticsDateRange,
  type AnalyticsDatePreset,
  type SalesChartDatum,
} from './helpers';
import { friendlyAdminError } from './admin-api';

type OverviewRow = Database['public']['Functions']['admin_overview']['Returns'][number];
type BestSellerRow = Database['public']['Functions']['admin_best_sellers']['Returns'][number];
type CategoryRow = Database['public']['Functions']['admin_category_performance']['Returns'][number];

type AnalyticsState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

class AnalyticsLoadError extends Error {}

const genericAnalyticsError = 'Analytics could not be loaded. Check your connection and try again.';
const invalidRangeMessage = 'Choose valid dates no more than 366 days apart.';

function useAnalyticsResource<T>(load: () => Promise<T>): {
  state: AnalyticsState<T>;
  retry: () => void;
} {
  const [state, setState] = useState<AnalyticsState<T>>({
    data: null,
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ data: null, error: null, loading: true });
    void load().then((data) => {
      if (active) setState({ data, error: null, loading: false });
    }).catch((error: unknown) => {
      if (!active) return;
      setState({
        data: null,
        error: error instanceof AnalyticsLoadError ? error.message : genericAnalyticsError,
        loading: false,
      });
    });

    return () => {
      active = false;
    };
  }, [attempt, load]);

  return {
    state,
    retry: useCallback(() => setAttempt((current) => current + 1), []),
  };
}

function analyticsFailure(error: { code?: string | null; message: string }): AnalyticsLoadError {
  return new AnalyticsLoadError(friendlyAdminError(error));
}

function useDateRange() {
  const [preset, setPreset] = useState<AnalyticsDatePreset>('last7Days');
  const today = useMemo(() => getAnalyticsDateRange('today'), []);
  const [customFrom, setCustomFrom] = useState(today.from);
  const [customTo, setCustomTo] = useState(today.to);
  const range = useMemo(
    () => getAnalyticsDateRange(preset, new Date(), customFrom, customTo),
    [customFrom, customTo, preset],
  );
  const valid = isValidAnalyticsDateRange(range.from, range.to);

  const controls = (
    <div className="admin-analytics-controls">
      <AdminSelect
        id="admin-analytics-preset"
        label="Show"
        value={preset}
        onChange={(value) => setPreset(value as AnalyticsDatePreset)}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'last7Days', label: 'Last 7 days' },
          { value: 'last30Days', label: 'Last 30 days' },
          { value: 'thisMonth', label: 'This month' },
          { value: 'custom', label: 'Custom dates' },
        ]}
      />
      {preset === 'custom' && (
        <div className="admin-analytics-custom-dates">
          <AdminInput
            id="admin-analytics-from"
            label="From"
            type="date"
            value={customFrom}
            onChange={setCustomFrom}
          />
          <AdminInput
            id="admin-analytics-to"
            label="To"
            type="date"
            value={customTo}
            onChange={setCustomTo}
          />
        </div>
      )}
      {!valid && <p className="admin-field-error" role="alert">{invalidRangeMessage}</p>}
    </div>
  );

  return { range, controls };
}

function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="admin-analytics-skeleton" role="status" aria-label="Loading analytics">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function AnalyticsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="admin-analytics-error" role="alert">
      <p>{message}</p>
      <AdminButton type="button" variant="secondary" onClick={onRetry}>Try again</AdminButton>
    </div>
  );
}

function OverviewCard({ range }: { range: { from: string; to: string } }) {
  const load = useCallback(async () => {
    if (!isValidAnalyticsDateRange(range.from, range.to)) {
      throw new AnalyticsLoadError(invalidRangeMessage);
    }
    const { data, error } = await adminSupabase.rpc('admin_overview', {
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw analyticsFailure(error);
    return data?.[0] ?? null;
  }, [range.from, range.to]);
  const { state, retry } = useAnalyticsResource(load);

  return (
    <AdminCard className="admin-analytics-card">
      <div className="admin-card-heading">
        <div>
          <h2>Orders and money</h2>
        </div>
      </div>
      {state.loading ? <LoadingSkeleton rows={6} /> : state.error
        ? <AnalyticsError message={state.error} onRetry={retry} />
        : state.data ? (
          <>
            <dl className="admin-analytics-metrics">
              <div><dt>Total orders</dt><dd>{state.data.total_orders.toLocaleString('en-NG')}</dd></div>
              <div><dt>Paid orders</dt><dd>{state.data.paid_orders.toLocaleString('en-NG')}</dd></div>
              <div><dt>Sales</dt><dd>{formatNaira(state.data.total_revenue_ngn)}</dd></div>
              <div><dt>Delivery fees collected</dt><dd>{formatNaira(state.data.delivery_fees_ngn)}</dd></div>
              <div><dt>Discounts given</dt><dd>{formatNaira(state.data.discounts_ngn)}</dd></div>
              <div><dt>Average order</dt><dd>{formatNaira(state.data.average_order_value_ngn ?? 0)}</dd></div>
            </dl>
            <div className="admin-analytics-statuses">
              <h3>Orders by status</h3>
              <StatusCounts counts={state.data.orders_by_status} />
            </div>
            {state.data.total_orders === 0 && (
              <EmptyState>No orders yet.</EmptyState>
            )}
          </>
        ) : <EmptyState>No orders yet.</EmptyState>}
    </AdminCard>
  );
}

function StatusCounts({ counts }: { counts: OverviewRow['orders_by_status'] }) {
  const statusLabels = [
    ['pending', 'Waiting for payment'],
    ['paid', 'Paid (new)'],
    ['preparing', 'Preparing'],
    ['delivering', 'On the way'],
    ['delivered', 'Delivered'],
    ['canceled', 'Cancelled'],
  ] as const;
  const statusRecord = typeof counts === 'object' && counts !== null && !Array.isArray(counts)
    ? counts
    : {};

  return (
    <ul className="admin-analytics-status-list">
      {statusLabels.map(([status, label]) => {
        const count = statusRecord[status];
        const value = typeof count === 'number' ? count : 0;
        return <li key={status}><span>{label}</span><strong>{value.toLocaleString('en-NG')}</strong></li>;
      })}
    </ul>
  );
}

function SalesByDayCard({ range }: { range: { from: string; to: string } }) {
  const load = useCallback(async () => {
    if (!isValidAnalyticsDateRange(range.from, range.to)) {
      throw new AnalyticsLoadError(invalidRangeMessage);
    }
    const { data, error } = await adminSupabase.rpc('admin_sales_by_day', {
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw analyticsFailure(error);
    return (data ?? []).map((row) => ({
      day: row.day,
      orderCount: row.order_count,
      revenueNgn: row.revenue_ngn,
    }));
  }, [range.from, range.to]);
  const { state, retry } = useAnalyticsResource(load);

  return (
    <AdminCard className="admin-analytics-card">
      <div className="admin-card-heading">
        <div>
          <h2>Sales each day</h2>
        </div>
      </div>
      {state.loading ? <LoadingSkeleton rows={4} /> : state.error
        ? <AnalyticsError message={state.error} onRetry={retry} />
        : state.data ? <SalesChart rows={state.data} from={range.from} to={range.to} />
          : <EmptyState>No sales yet.</EmptyState>}
    </AdminCard>
  );
}

function SalesChart({ rows, from, to }: {
  rows: SalesChartDatum[];
  from: string;
  to: string;
}) {
  const data = buildSalesChartData(rows, from, to);
  const maxRevenue = Math.max(...data.map((row) => row.revenueNgn), 0);
  if (maxRevenue === 0) return <EmptyState>No sales yet.</EmptyState>;

  return (
    <div className="admin-sales-chart-wrap">
      <div
        className="admin-sales-chart"
        role="img"
        aria-label={`Sales each day from ${from} to ${to}.`}
      >
        {data.map((row) => (
          <div className="admin-sales-chart-day" key={row.day}>
            <span
              className="admin-sales-chart-bar"
              title={`${row.day}: ${row.orderCount} paid orders, ${formatNaira(row.revenueNgn)}`}
              style={{ height: `${row.revenueNgn > 0 ? Math.max(4, row.revenueNgn / maxRevenue * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="admin-sales-chart-axis">
        <span>{from}</span><span>{to}</span>
      </div>
    </div>
  );
}

function BestSellersCard({ range }: { range: { from: string; to: string } }) {
  const load = useCallback(async () => {
    if (!isValidAnalyticsDateRange(range.from, range.to)) {
      throw new AnalyticsLoadError(invalidRangeMessage);
    }
    const { data, error } = await adminSupabase.rpc('admin_best_sellers', {
      p_from: range.from,
      p_to: range.to,
      p_limit: 10,
    });
    if (error) throw analyticsFailure(error);
    return data ?? [];
  }, [range.from, range.to]);
  const { state, retry } = useAnalyticsResource(load);

  return (
    <AnalyticsListCard
      title="Top products"
      rows={state.data}
      loading={state.loading}
      error={state.error}
      retry={retry}
      name={(row) => row.product_name}
      units={(row) => `${row.units_sold.toLocaleString('en-NG')} sold`}
      revenue={(row) => formatNaira(row.revenue_ngn)}
      empty="No sales yet."
    />
  );
}

function CategoryPerformanceCard({ range }: { range: { from: string; to: string } }) {
  const load = useCallback(async () => {
    if (!isValidAnalyticsDateRange(range.from, range.to)) {
      throw new AnalyticsLoadError(invalidRangeMessage);
    }
    const { data, error } = await adminSupabase.rpc('admin_category_performance', {
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw analyticsFailure(error);
    return data ?? [];
  }, [range.from, range.to]);
  const { state, retry } = useAnalyticsResource(load);

  return (
    <AnalyticsListCard
      title="Top categories"
      rows={state.data}
      loading={state.loading}
      error={state.error}
      retry={retry}
      name={(row) => row.category_name}
      units={(row) => `${row.units_sold.toLocaleString('en-NG')} sold`}
      revenue={(row) => formatNaira(row.revenue_ngn)}
      empty="No sales yet."
    />
  );
}

function AnalyticsListCard<Row extends BestSellerRow | CategoryRow>({
  title,
  rows,
  loading,
  error,
  retry,
  name,
  units,
  revenue,
  empty,
}: {
  title: string;
  rows: Row[] | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  name: (row: Row) => string;
  units: (row: Row) => string;
  revenue: (row: Row) => string;
  empty: string;
}) {
  return (
    <AdminCard className="admin-analytics-card">
      <div className="admin-card-heading">
        <div><h2>{title}</h2></div>
      </div>
      {loading ? <LoadingSkeleton /> : error
        ? <AnalyticsError message={error} onRetry={retry} />
        : rows?.length ? (
          <ol className="admin-analytics-ranking">
            {rows.map((row, index) => (
              <li key={`${name(row)}-${index}`}>
                <span className="admin-analytics-rank">{index + 1}</span>
                <div>
                  <strong>{name(row)}</strong>
                  <span>{units(row)}</span>
                </div>
                <strong>{revenue(row)}</strong>
              </li>
            ))}
          </ol>
        ) : <EmptyState>{empty}</EmptyState>}
    </AdminCard>
  );
}

export default function OverviewPage() {
  const { range, controls } = useDateRange();

  return (
    <section className="admin-overview" aria-labelledby="admin-overview-title">
      <header className="admin-overview-header">
        <div>
          <h2 id="admin-overview-title">Overview</h2>
        </div>
        {controls}
      </header>
      <div className="admin-analytics-grid">
        <OverviewCard range={range} />
        <SalesByDayCard range={range} />
        <BestSellersCard range={range} />
        <CategoryPerformanceCard range={range} />
      </div>
    </section>
  );
}
