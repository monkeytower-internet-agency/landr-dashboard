// landr-lp9t — alternative view to AvailabilityCalendar. Renders the same
// availability data as a compacted list: consecutive identical-capacity
// days collapse into one "Mon Jun 1 → Mon Jun 30: 6 seats/day" row.
//
// Click handling mirrors the calendar: clicking a row calls onRangeSelect
// with the range's from/to ISO dates, which Schedule.tsx wires to open the
// AvailabilityFormSheet pre-filled for that range (the same edit path the
// calendar uses for drag-select).

import { useMemo } from 'react'

import type { AvailabilityRow } from '@/lib/availability'
import { compactRanges, formatRangeDate } from '@/lib/schedule'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  rows: AvailabilityRow[]
  /** Click handler — same contract as AvailabilityCalendar's onRangeSelect. */
  onRangeSelect?: (fromDate: string, toDate: string) => void
}

export function AvailabilityListView({ rows, onRangeSelect }: Props) {
  const ranges = useMemo(() => compactRanges(rows), [rows])

  if (ranges.length === 0) {
    return (
      <div
        data-testid="list-view-empty"
        className="text-muted-foreground rounded-md border p-6 text-sm"
      >
        {t.schedule.listEmpty}
      </div>
    )
  }

  return (
    <ul
      data-testid="availability-list"
      className="divide-border bg-card divide-y rounded-md border"
    >
      {ranges.map((range) => {
        const isSingleDay = range.startDate === range.endDate
        const dateLabel = isSingleDay
          ? formatRangeDate(range.startDate)
          : `${formatRangeDate(range.startDate)} → ${formatRangeDate(range.endDate)}`
        const closed = range.capacity === 0
        const reservedTotal = range.reserved
        const dailyCapacity = range.capacity

        return (
          <li key={`${range.startDate}-${range.endDate}`} className="contents">
            <button
              type="button"
              data-testid="list-row"
              data-closed={closed ? 'true' : 'false'}
              onClick={() =>
                onRangeSelect?.(range.startDate, range.endDate)
              }
              className={cn(
                'flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left',
                'hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none',
              )}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{dateLabel}</span>
                <span className="text-muted-foreground text-xs">
                  {isSingleDay
                    ? t.schedule.listOneDay
                    : t.schedule.listDayCount(range.days)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {closed ? (
                  <span
                    data-testid="list-row-chip"
                    data-state="closed"
                    className="border-destructive/30 bg-destructive/10 text-destructive inline-flex items-center rounded-md border px-2 py-0.5 text-xs line-through"
                  >
                    {t.schedule.dayClosed}
                  </span>
                ) : (
                  <span
                    data-testid="list-row-chip"
                    data-state="open"
                    className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    {t.schedule.listSeatsPerDay(dailyCapacity)}
                  </span>
                )}
                {!closed && reservedTotal > 0 ? (
                  <span className="text-muted-foreground text-xs">
                    {t.schedule.listReservedHint(
                      reservedTotal,
                      dailyCapacity * range.days,
                    )}
                  </span>
                ) : null}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
