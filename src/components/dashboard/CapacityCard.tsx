// landr-kav4 — Today's-capacity card on the Dashboard home. Renders one
// row per schedulable product with a per-unit capacity, showing
// participants booked / capacity_per_unit + a percent + a coloured
// progress bar. Colour bands: green <70%, amber 70–90%, red >90%.
//
// Data shape comes from todaysCapacity(bookings, products) in
// lib/dashboard-home.ts — keeping the pure derivation testable in
// isolation from the route wiring.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CapacityRow } from '@/lib/dashboard-home'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type CapacityCardProps = {
  rows: CapacityRow[]
  loading: boolean
}

export function CapacityCard({ rows, loading }: CapacityCardProps) {
  return (
    <Card data-testid="dashboard-capacity">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {t.dashboard.capacityHeading}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">{t.dashboard.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.dashboard.capacityEmpty}
          </p>
        ) : (
          <ul
            className="flex flex-col gap-3"
            data-testid="dashboard-capacity-list"
          >
            {rows.map((row) => (
              <CapacityRowItem key={row.productId} row={row} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CapacityRowItem({ row }: { row: CapacityRow }) {
  const band = capacityBand(row.percent)
  const fillPercent = Math.min(100, Math.max(0, row.percent))
  const ariaLabel = t.dashboard.capacityRowAria(
    row.name,
    row.booked,
    row.capacity,
  )
  return (
    <li
      className="flex flex-col gap-1"
      data-testid={`dashboard-capacity-row-${row.productId}`}
      data-band={band}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate font-medium">{row.name}</span>
        <span
          className={cn('font-medium tabular-nums', textColorForBand(band))}
        >
          {row.booked}/{row.capacity}
          <span className="text-muted-foreground ml-1 font-normal">
            ({row.percent}%)
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        // Cap at 100 for the WAI value (over-100% is still tracked in
        // the X/Y readout, but `aria-valuenow` must stay in range).
        aria-valuenow={fillPercent}
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            barColorForBand(band),
          )}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </li>
  )
}

type CapacityBand = 'low' | 'medium' | 'high'

function capacityBand(percent: number): CapacityBand {
  // landr-kav4 — visual alert thresholds. >90% turns red so operators
  // notice the day is nearly full at a glance; 70-90% amber gives a
  // soft heads-up; <70% stays green.
  if (percent > 90) return 'high'
  if (percent >= 70) return 'medium'
  return 'low'
}

function barColorForBand(band: CapacityBand): string {
  switch (band) {
    case 'high':
      return 'bg-red-500 dark:bg-red-600'
    case 'medium':
      return 'bg-amber-500 dark:bg-amber-600'
    case 'low':
      return 'bg-emerald-500 dark:bg-emerald-600'
  }
}

function textColorForBand(band: CapacityBand): string {
  switch (band) {
    case 'high':
      return 'text-red-700 dark:text-red-300'
    case 'medium':
      return 'text-amber-700 dark:text-amber-300'
    case 'low':
      return 'text-emerald-700 dark:text-emerald-400'
  }
}
