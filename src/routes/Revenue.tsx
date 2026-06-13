// landr-sbhz.8 — /revenue: owner platform-commission overview (STAFF-ONLY).
//
// Shows the Landr owner (ok@landr.de) how much platform commission he earns
// from each operator: a percentage of NET booking revenue per the operator
// contract (Para42: 5% in 2026, 4% from 2027 — data-driven from the seeded
// platform commission scheme, surfaced as the per-year `effective_rate`).
//
// Each operator gets a per-year breakdown of REALIZED (finalised bookings'
// persisted commissions, net of reversals) vs PROJECTED (confirmed/pending
// bookings not yet finalised, computed via the same commission engine), plus
// the total payable. Top-of-page cards roll up across all operators.
//
// STAFF GATING (mirrors TierSettings, landr-sbhz.5): this is Landr tooling,
// NOT a tenant-entitlement-gated module — it is deliberately left OUT of the
// feature registry (landr-sbhz.6). Access is gated to is_landr_staff in two
// places: the route self-redirects non-staff to home, and the FastAPI
// endpoint returns 403 for any non-staff bearer (the real enforcement). It is
// NOT placed behind the tenant entitlement gate.
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useEntitlements } from '@/lib/entitlements'
import { PageTitle } from '@/lib/page-title'
import {
  fetchRevenueOverview,
  formatMoney,
  formatRate,
  type OperatorRevenue,
  type RevenueOverview,
} from '@/lib/revenue'
import { t } from '@/lib/strings'

export function Revenue() {
  const { effectiveIsStaff, isLoading: entLoading } = useEntitlements()

  // Staff route guard. While the staff flag is still resolving, render a
  // placeholder rather than flashing the page or a wrong redirect (matches
  // TierSettings).
  // landr-2soj — gate on EFFECTIVE staff so a deep link to /revenue while
  // viewing-as redirects home (the surface is hidden in view-as).
  if (entLoading) {
    return <p className="text-muted-foreground p-6 text-sm">{t.revenue.loading}</p>
  }
  if (!effectiveIsStaff) return <Navigate to="/" replace />

  return <RevenueInner />
}

function RevenueInner() {
  const query = useQuery<RevenueOverview, Error>({
    queryKey: ['revenue-overview'],
    queryFn: () => fetchRevenueOverview(),
    staleTime: 1000 * 60,
  })

  const data = query.data

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.revenue.title} subtitle={t.revenue.subtitle} />

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.revenue.errorTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending ? (
        <p className="text-muted-foreground text-sm">{t.revenue.loading}</p>
      ) : !data || data.operators.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">{t.revenue.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Roll-up cards across all operators */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TotalCard
              label={t.revenue.realizedLabel}
              hint={t.revenue.realizedHint}
              value={formatMoney(data.realized_total, data.currency)}
            />
            <TotalCard
              label={t.revenue.projectedLabel}
              hint={t.revenue.projectedHint}
              value={formatMoney(data.projected_total, data.currency)}
            />
            <TotalCard
              label={t.revenue.totalLabel}
              hint={t.revenue.totalHint}
              value={formatMoney(data.grand_total, data.currency)}
              emphasis
            />
          </div>

          {data.operators.map((op) => (
            <OperatorCard key={op.operator_id} op={op} />
          ))}

          <p className="text-muted-foreground text-xs">
            {t.revenue.generatedAt(data.generated_at)}
          </p>
        </>
      )}
    </div>
  )
}

function TotalCard({
  label,
  hint,
  value,
  emphasis = false,
}: {
  label: string
  hint: string
  value: string
  emphasis?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            emphasis
              ? 'text-2xl font-semibold tabular-nums'
              : 'text-2xl font-semibold tabular-nums'
          }
        >
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  )
}

function OperatorCard({ op }: { op: OperatorRevenue }) {
  return (
    <Card data-testid="revenue-operator">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {op.operator_name ?? op.operator_slug ?? op.operator_id}
        </CardTitle>
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatMoney(op.total, op.currency)}
        </span>
      </CardHeader>
      <CardContent>
        {!op.has_platform_scheme && op.years.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.revenue.noPlatformScheme}
          </p>
        ) : op.years.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.revenue.empty}</p>
        ) : (
          // landr-3qkr.6 — overflow-x-auto so the multi-column revenue table
          // scrolls inside its box on a 360px phone instead of being clipped.
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.revenue.columnYear}</TableHead>
                  <TableHead className="text-right">
                    {t.revenue.columnRate}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.revenue.columnNetBase}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.revenue.columnRealized}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.revenue.columnProjected}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.revenue.columnTotal}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.revenue.columnBookings}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {op.years.map((y) => (
                  <TableRow key={y.year} data-testid="revenue-year-row">
                    <TableCell className="font-medium">{y.year}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(y.effective_rate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {formatMoney(
                        y.realized_net_base + y.projected_net_base,
                        op.currency,
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(y.realized, op.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(y.projected, op.currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(y.total, op.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {y.booking_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-medium">
                    {t.revenue.operatorTotalRow}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(op.realized_total, op.currency)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(op.projected_total, op.currency)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(op.total, op.currency)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Default export so the route can be lazy-loaded via
// React.lazy(() => import('@/routes/Revenue')) in App.tsx (staff-rare surface,
// keeps it off the initial bundle). Named export stays for direct test imports.
export default Revenue
