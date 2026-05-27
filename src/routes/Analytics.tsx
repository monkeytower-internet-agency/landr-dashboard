// Analytics route — landr-af6c.
//
// Operational-insight dashboard for the operator. Data is the same bookings
// fetch used by /bookings and /reporting, aggregated client-side. No new
// FastAPI surface required — the existing supabase RLS scopes the rows by
// operator so the page Just Works under the standard ProtectedRoute.
//
// Widgets:
//   - Range toggle (30 / 90 / 365 days).
//   - KPI cards (bookings, revenue, average ticket).
//   - Revenue-over-time line chart (bucket size auto-picked per range).
//   - Bookings-per-product horizontal bar chart (top 10 + "(others)" bucket).
//   - Conversion funnel (initiated → confirmed → completed).
//   - Top customers table (revenue desc, top 10).
//   - Occupancy heatmap (weekday × hour-of-day).
//
// Operator filter: the dashboard already scopes to ONE operator via the
// OperatorSwitcher in the topbar, so a route-local operator filter would
// duplicate that control. We rely on the topbar switcher instead.

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchBookings, type BookingRow } from '@/lib/bookings'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'
import { formatCount, formatCurrency } from '@/lib/reporting'
import {
  bucketForRange,
  computeAnalyticsKpis,
  daysAgoUtcIso,
  filterByCreatedAt,
  rangeWindowDays,
  shapeBookingsPerProduct,
  shapeConversionFunnel,
  shapeOccupancyHeatmap,
  shapePerStaffRevenue,
  shapeRevenueOverTime,
  shapeTopCustomers,
  shapeVoucherPerformance,
  todayUtcIso,
  type ProductBreakdownPoint,
  type RangePresetKey,
} from '@/lib/analytics'
import {
  fetchAssignments,
  fetchProviders,
  type BookingDayProviderAssignmentRow,
  type ProviderRow,
} from '@/lib/assignments'
import {
  fetchVoucherRedemptions,
  fetchVouchers,
  type VoucherRedemptionRow,
  type VoucherRow,
} from '@/lib/vouchers-analytics'
import { RevenueLineChart } from '@/components/analytics/RevenueLineChart'
import { ProductBarChart } from '@/components/analytics/ProductBarChart'
import { ConversionFunnel } from '@/components/analytics/ConversionFunnel'
import { TopCustomersTable } from '@/components/analytics/TopCustomersTable'
import { OccupancyHeatmap } from '@/components/analytics/OccupancyHeatmap'
import { RevenuePerStaff } from '@/components/analytics/RevenuePerStaff'
import { VoucherPerformance } from '@/components/analytics/VoucherPerformance'

const PRODUCT_TOP_N = 10

/** Bucket the long tail of products into a single "(others)" row so the
 *  bar chart stays scannable on busy operators. */
function withProductTail(
  products: ProductBreakdownPoint[],
  topN: number,
): ProductBreakdownPoint[] {
  if (products.length <= topN) return products
  const head = products.slice(0, topN)
  const tail = products.slice(topN)
  const merged: ProductBreakdownPoint = {
    productId: null,
    productName: '(others)',
    bookings: tail.reduce((a, p) => a + p.bookings, 0),
    revenue: Math.round(tail.reduce((a, p) => a + p.revenue, 0) * 100) / 100,
  }
  return [...head, merged]
}

function bucketCopy(bucket: 'day' | 'week' | 'month'): string {
  switch (bucket) {
    case 'day':
      return t.analytics.bucketDay
    case 'week':
      return t.analytics.bucketWeek
    case 'month':
      return t.analytics.bucketMonth
  }
}

export function Analytics() {
  const { currentOperatorId } = useOperator()
  const [preset, setPreset] = useState<RangePresetKey>('last30')

  const query = useRealtimeQuery<BookingRow[]>({
    queryKey: ['bookings', currentOperatorId ?? 'none'],
    queryFn: () => fetchBookings(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'bookings',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  const rows = useMemo(() => query.data ?? [], [query.data])

  // Pin "today" / "from" to the render — useMemo so React doesn't re-compute
  // on every keystroke once we add filters later. Day boundary stability
  // within a session is fine; refreshing on date change is expected anyway.
  const window = useMemo(() => {
    const to = todayUtcIso()
    const from = daysAgoUtcIso(rangeWindowDays(preset) - 1)
    return { from, to, bucket: bucketForRange(preset) }
  }, [preset])

  // landr-ce45 — per-day provider assignments + provider roster for the
  // "Revenue per staff" card. Scoped to operator + the same window the
  // rest of the page uses so totals line up.
  const providersQuery = useQuery<ProviderRow[]>({
    queryKey: ['providers', currentOperatorId ?? 'none'],
    queryFn: () => fetchProviders(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })
  const assignmentsQuery = useQuery<BookingDayProviderAssignmentRow[]>({
    queryKey: [
      'assignments',
      currentOperatorId ?? 'none',
      window.from,
      window.to,
    ],
    queryFn: () =>
      fetchAssignments(currentOperatorId as string, window.from, window.to),
    enabled: !!currentOperatorId,
  })

  // landr-1jgr — voucher performance card. Two fetches: the operator's
  // voucher roster (rare reads, cached without window) + the redemption
  // bookings (windowed by created_at to align with the rest of the page).
  const vouchersQuery = useQuery<VoucherRow[]>({
    queryKey: ['vouchers', currentOperatorId ?? 'none'],
    queryFn: () => fetchVouchers(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })
  const voucherRedemptionsQuery = useQuery<VoucherRedemptionRow[]>({
    queryKey: [
      'voucher-redemptions',
      currentOperatorId ?? 'none',
      window.from,
      window.to,
    ],
    queryFn: () =>
      fetchVoucherRedemptions(
        currentOperatorId as string,
        window.from,
        window.to,
      ),
    enabled: !!currentOperatorId,
  })

  const filtered = useMemo(
    () => filterByCreatedAt(rows, window.from, window.to),
    [rows, window.from, window.to],
  )
  const kpis = useMemo(() => computeAnalyticsKpis(filtered), [filtered])
  const revenuePoints = useMemo(
    () => shapeRevenueOverTime(filtered, window),
    [filtered, window],
  )
  const productPoints = useMemo(
    () => withProductTail(shapeBookingsPerProduct(filtered), PRODUCT_TOP_N),
    [filtered],
  )
  const funnel = useMemo(() => shapeConversionFunnel(filtered), [filtered])
  const topCustomers = useMemo(() => shapeTopCustomers(filtered), [filtered])
  const heatmap = useMemo(() => shapeOccupancyHeatmap(filtered), [filtered])
  // Per-staff revenue: pass the FULL booking list (not the created_at
  // window — bookings can be assigned to dates outside their created_at
  // bucket). The shaper itself skips bookings it doesn't know about, so
  // we just give it everything we already have client-side.
  const perStaffRevenue = useMemo(
    () =>
      shapePerStaffRevenue({
        assignments: assignmentsQuery.data ?? [],
        providers: providersQuery.data ?? [],
        bookings: rows,
      }),
    [assignmentsQuery.data, providersQuery.data, rows],
  )
  const voucherPerformance = useMemo(
    () =>
      shapeVoucherPerformance({
        redemptions: voucherRedemptionsQuery.data ?? [],
        vouchers: vouchersQuery.data ?? [],
      }),
    [voucherRedemptionsQuery.data, vouchersQuery.data],
  )

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.analytics.title} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{t.analytics.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.analytics.rangeNote(window.from, window.to)}
            {' · '}
            {bucketCopy(window.bucket)}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label={t.analytics.rangeLabel}
          className="flex flex-wrap gap-2"
        >
          <RangeButton
            active={preset === 'last30'}
            onClick={() => setPreset('last30')}
          >
            {t.analytics.rangeLast30}
          </RangeButton>
          <RangeButton
            active={preset === 'last90'}
            onClick={() => setPreset('last90')}
          >
            {t.analytics.rangeLast90}
          </RangeButton>
          <RangeButton
            active={preset === 'last365'}
            onClick={() => setPreset('last365')}
          >
            {t.analytics.rangeLast365}
          </RangeButton>
        </div>
      </header>

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.analytics.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">
          {t.analytics.loading}
        </p>
      ) : (
        <>
          {kpis.mixedCurrency ? (
            <p
              role="status"
              className="text-muted-foreground border-border bg-muted/40 rounded-md border px-3 py-2 text-sm"
            >
              {t.analytics.mixedCurrencyWarning}
            </p>
          ) : null}
          {kpis.cancelledExcluded > 0 ? (
            <p className="text-muted-foreground text-xs">
              {t.analytics.cancelledNote(kpis.cancelledExcluded)}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label={t.analytics.kpiBookingsLabel}
              value={formatCount(kpis.bookingCount)}
              hint={t.analytics.kpiBookingsHint}
              testId="analytics-kpi-bookings"
            />
            <KpiCard
              label={t.analytics.kpiRevenueLabel}
              value={formatCurrency(kpis.revenueTotal, kpis.currency)}
              hint={t.analytics.kpiRevenueHint}
              testId="analytics-kpi-revenue"
            />
            <KpiCard
              label={t.analytics.kpiAvgTicketLabel}
              value={formatCurrency(kpis.averageTicket, kpis.currency)}
              hint={t.analytics.kpiAvgTicketHint}
              testId="analytics-kpi-avg-ticket"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.analytics.revenueOverTimeTitle}</CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.analytics.revenueOverTimeDescription}
              </p>
            </CardHeader>
            <CardContent>
              <RevenueLineChart
                data={revenuePoints}
                currency={kpis.currency}
                emptyLabel={t.analytics.empty}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t.analytics.productsTitle}</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {t.analytics.productsDescription}
                </p>
              </CardHeader>
              <CardContent>
                <ProductBarChart
                  data={productPoints}
                  emptyLabel={t.analytics.empty}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.analytics.funnelTitle}</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {t.analytics.funnelDescription}
                </p>
              </CardHeader>
              <CardContent>
                <ConversionFunnel
                  funnel={funnel}
                  labels={{
                    initiated: t.analytics.funnelInitiated,
                    confirmed: t.analytics.funnelConfirmed,
                    completed: t.analytics.funnelCompleted,
                    cancelledNote: t.analytics.funnelCancelledNote,
                    noShowNote: t.analytics.funnelNoShowNote,
                    fromTop: t.analytics.funnelFromTop,
                    fromPrev: t.analytics.funnelFromPrev,
                    empty: t.analytics.empty,
                  }}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.analytics.topCustomersTitle}</CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.analytics.topCustomersDescription}
              </p>
            </CardHeader>
            <CardContent>
              <TopCustomersTable
                rows={topCustomers}
                currency={kpis.currency}
                labels={{
                  columnName: t.analytics.topCustomersColumnName,
                  columnEmail: t.analytics.topCustomersColumnEmail,
                  columnBookings: t.analytics.topCustomersColumnBookings,
                  columnRevenue: t.analytics.topCustomersColumnRevenue,
                  empty: t.analytics.topCustomersEmpty,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.analytics.perStaffTitle}</CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.analytics.perStaffDescription}
              </p>
            </CardHeader>
            <CardContent>
              <RevenuePerStaff
                rows={perStaffRevenue}
                currency={kpis.currency}
                labels={{
                  columnName: t.analytics.perStaffColumnName,
                  columnBookings: t.analytics.perStaffColumnBookings,
                  columnRevenue: t.analytics.perStaffColumnRevenue,
                  columnAverage: t.analytics.perStaffColumnAverage,
                  empty: t.analytics.perStaffEmpty,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.analytics.voucherPerformanceTitle}</CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.analytics.voucherPerformanceDescription}
              </p>
            </CardHeader>
            <CardContent>
              <VoucherPerformance
                rows={voucherPerformance}
                labels={{
                  columnCode: t.analytics.voucherPerformanceColumnCode,
                  columnKind: t.analytics.voucherPerformanceColumnKind,
                  columnRedemptions:
                    t.analytics.voucherPerformanceColumnRedemptions,
                  columnDiscount:
                    t.analytics.voucherPerformanceColumnDiscount,
                  empty: t.analytics.voucherPerformanceEmpty,
                  kindPercent: t.analytics.voucherKindPercent,
                  kindFlat: t.analytics.voucherKindFlat,
                  kindUnknown: t.analytics.voucherKindUnknown,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.analytics.heatmapTitle}</CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.analytics.heatmapDescription}
              </p>
            </CardHeader>
            <CardContent>
              <OccupancyHeatmap
                cells={heatmap.cells}
                max={heatmap.max}
                labels={{
                  empty: t.analytics.heatmapEmpty,
                  cellAria: t.analytics.heatmapCellAria,
                  hourAxisLabel: t.analytics.heatmapHourAxis,
                }}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  testId,
}: {
  label: string
  value: string
  hint: string
  testId: string
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </CardContent>
    </Card>
  )
}

function RangeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      role="radio"
      aria-checked={active}
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

// landr-mhhq — default export so the route can be lazy-loaded via
// React.lazy() in App.tsx (recharts + 5 chart components ≈ ~150KB
// off the initial bundle). Named export stays for direct test imports.
export default Analytics
