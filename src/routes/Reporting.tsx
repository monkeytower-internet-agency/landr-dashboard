// Reporting / revenue screen — landr-m05.9.
//
// KPI cards (count, revenue, avg ticket) + two shadcn/charts panels
// (revenue area, bookings/week bar) + client-side CSV export.
//
// All data is read straight from Supabase via the existing fetchBookings
// helper (RLS scopes by operator). No FastAPI hop required for these
// numbers, which keeps the bundle and the deploy surface small.
//
// Holded "sync now" trigger is intentionally NOT wired here: the
// FastAPI surface (app/routers/holded_pending_decisions.py) only exposes
// resolve-decision endpoints. Para42 contract requires the cancellation
// window to elapse before Holded sync fires anyway, so a manual button
// is a future-only feature.

import { useMemo, useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import {
  BookingsBarChart,
  RevenueAreaChart,
} from '@/components/ReportingCharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchBookings, type BookingRow } from '@/lib/bookings'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import {
  buildBookingsCsv,
  computeKpis,
  downloadCsv,
  filterByDateRange,
  formatCount,
  formatCurrency,
  shapeBookingsPerWeek,
  shapeRevenueOverTime,
  type DateRange,
} from '@/lib/reporting'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

// ---- preset ranges --------------------------------------------------------

function todayUtcIso(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgoUtcIso(days: number): string {
  const ms = Date.now() - days * 86_400_000
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfYearUtcIso(): string {
  const y = new Date().getUTCFullYear()
  return `${y}-01-01`
}

type PresetKey = 'all' | 'last30' | 'last90' | 'thisYear'

function presetRange(key: PresetKey): DateRange {
  switch (key) {
    case 'all':
      return { from: null, to: null }
    case 'last30':
      return { from: daysAgoUtcIso(29), to: todayUtcIso() }
    case 'last90':
      return { from: daysAgoUtcIso(89), to: todayUtcIso() }
    case 'thisYear':
      return { from: startOfYearUtcIso(), to: todayUtcIso() }
  }
}

// ---- route ----------------------------------------------------------------

export function Reporting() {
  const { currentOperatorId } = useOperator()
  const [range, setRange] = useState<DateRange>({ from: null, to: null })
  const [activePreset, setActivePreset] = useState<PresetKey | null>('all')

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

  // Stabilise the rows reference so downstream useMemo deps stay stable.
  // `query.data ?? []` would allocate a fresh `[]` on every render when the
  // query is still pending, invalidating every memo below.
  const rows = useMemo(() => query.data ?? [], [query.data])

  const filtered = useMemo(() => filterByDateRange(rows, range), [rows, range])
  const kpis = useMemo(() => computeKpis(filtered), [filtered])
  const revenuePoints = useMemo(
    () => shapeRevenueOverTime(filtered),
    [filtered],
  )
  const bookingsPoints = useMemo(
    () => shapeBookingsPerWeek(filtered),
    [filtered],
  )

  function applyPreset(key: PresetKey) {
    setActivePreset(key)
    setRange(presetRange(key))
  }

  function onFromChange(value: string) {
    setActivePreset(null)
    setRange((r) => ({ ...r, from: value || null }))
  }

  function onToChange(value: string) {
    setActivePreset(null)
    setRange((r) => ({ ...r, to: value || null }))
  }

  function onExport() {
    const csv = buildBookingsCsv(filtered)
    const stamp = todayUtcIso()
    downloadCsv(`bookings-${stamp}.csv`, csv)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.reporting.title} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">
            {t.reporting.exportRowsLabel(filtered.length)}
            {kpis.cancelledExcluded > 0
              ? ` · ${t.reporting.cancelledNote(kpis.cancelledExcluded)}`
              : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={filtered.length === 0}
          aria-label={t.reporting.exportCsv}
        >
          <DownloadIcon className="size-4" />
          {t.reporting.exportCsv}
        </Button>
      </header>

      {/* Range picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t.reporting.rangeLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            <PresetButton
              active={activePreset === 'all'}
              onClick={() => applyPreset('all')}
            >
              {t.reporting.rangeAllTime}
            </PresetButton>
            <PresetButton
              active={activePreset === 'last30'}
              onClick={() => applyPreset('last30')}
            >
              {t.reporting.rangeLast30}
            </PresetButton>
            <PresetButton
              active={activePreset === 'last90'}
              onClick={() => applyPreset('last90')}
            >
              {t.reporting.rangeLast90}
            </PresetButton>
            <PresetButton
              active={activePreset === 'thisYear'}
              onClick={() => applyPreset('thisYear')}
            >
              {t.reporting.rangeThisYear}
            </PresetButton>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                {t.reporting.rangeFromLabel}
              </span>
              <Input
                type="date"
                aria-label={t.reporting.rangeFromLabel}
                value={range.from ?? ''}
                onChange={(e) => onFromChange(e.target.value)}
                className="h-8 w-[10rem]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                {t.reporting.rangeToLabel}
              </span>
              <Input
                type="date"
                aria-label={t.reporting.rangeToLabel}
                value={range.to ?? ''}
                onChange={(e) => onToChange(e.target.value)}
                className="h-8 w-[10rem]"
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.reporting.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.reporting.loading}</p>
      ) : (
        <>
          {kpis.mixedCurrency ? (
            <p
              role="status"
              className="text-muted-foreground border-border bg-muted/40 rounded-md border px-3 py-2 text-sm"
            >
              {t.reporting.mixedCurrencyWarning}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label={t.reporting.kpiBookingsLabel}
              value={formatCount(kpis.bookingCount)}
              hint={t.reporting.kpiBookingsHint}
              testId="kpi-bookings"
            />
            <KpiCard
              label={t.reporting.kpiRevenueLabel}
              value={formatCurrency(kpis.revenueTotal, kpis.currency)}
              hint={t.reporting.kpiRevenueHint}
              testId="kpi-revenue"
            />
            <KpiCard
              label={t.reporting.kpiAvgTicketLabel}
              value={formatCurrency(kpis.averageTicket, kpis.currency)}
              hint={t.reporting.kpiAvgTicketHint}
              testId="kpi-avg-ticket"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t.reporting.chartRevenueTitle}</CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.reporting.chartRevenueDescription}
              </p>
            </CardHeader>
            <CardContent>
              <RevenueAreaChart
                data={revenuePoints}
                currency={kpis.currency}
                emptyLabel={t.reporting.empty}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.reporting.chartBookingsTitle}</CardTitle>
              <p className="text-muted-foreground text-xs">
                {t.reporting.chartBookingsDescription}
              </p>
            </CardHeader>
            <CardContent>
              <BookingsBarChart
                data={bookingsPoints}
                emptyLabel={t.reporting.empty}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t.reporting.holdedSyncTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t.reporting.holdedSyncBody}
              </p>
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

function PresetButton({
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
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
