// landr-7o2a — Customer 360 "Bookings" tab content for CustomerDetailSheet.
// Lists every booking (past + upcoming) the contact has placed, ordered
// most-recent-first. Click a row → opens that booking's detail sheet.
//
// Pure presentation: data comes from fetchBookingsForContact(contactId) and
// every cell reuses the existing booking display helpers (priceDisplay,
// productDisplay, formatServiceDateRange, StageBadge, …) so this stays in
// lock-step with BookingsTable without re-implementing the formatting.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { StageBadge } from '@/components/booking/StageBadge'
import {
  dateDisplay,
  earliestServiceDate,
  fetchBookingsForContact,
  formatServiceDateRange,
  matchingServiceEnd,
  priceDisplay,
  productDisplay,
  stageCode,
  type BookingRow,
} from '@/lib/bookings'
import { useOperatorCalendarPrefs } from '@/lib/operator'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  contactId: string
  onBookingClick: (row: BookingRow) => void
}

// Sum gross_total across all rows for the "12 bookings, €1,234 total"
// header. Skips rows where gross_total is not a finite number (legacy /
// in-progress drafts). Currency falls back to EUR if every row in the
// list shares no currency (we keep formatting consistent with priceDisplay).
function summarise(rows: BookingRow[]): { count: number; total: string } {
  let sum = 0
  let currency = 'EUR'
  for (const r of rows) {
    const n = typeof r.gross_total === 'number'
      ? r.gross_total
      : Number(r.gross_total)
    if (Number.isFinite(n)) sum += n
    if (r.currency) currency = r.currency
  }
  // Mirror priceDisplay's en-IE locale + style so the header matches the
  // per-row total cells visually.
  const totalLabel = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
  }).format(sum)
  return { count: rows.length, total: totalLabel }
}

export function CustomerBookings({ contactId, onBookingClick }: Props) {
  const query = useQuery<BookingRow[]>({
    // Distinct prefix from ['bookings'] (operator-scoped) so the per-contact
    // list invalidates independently. invalidateBookingCaches() in
    // lib/bookings.ts will NOT clear this key — that is intentional: a
    // contact-patch in CustomerDetailSheet doesn't change the booking list
    // for that contact, only the denormalised customer cells inside each
    // row (which we re-fetch on remount via the sheet's `key={contactId}`).
    queryKey: ['bookings-by-contact', contactId],
    queryFn: () => fetchBookingsForContact(contactId),
  })

  const { hour12 } = useOperatorCalendarPrefs()
  const rows = useMemo(() => query.data ?? [], [query.data])
  const summary = useMemo(() => summarise(rows), [rows])

  if (query.isPending) {
    return (
      <p className="text-muted-foreground px-4 py-3 text-sm">
        {t.customerDetail.bookings.loading}
      </p>
    )
  }

  if (query.isError) {
    return (
      <p
        className="text-destructive px-4 py-3 text-sm"
        role="alert"
        data-testid="customer-bookings-error"
      >
        {query.error?.message ?? t.customerDetail.bookings.error}
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <p
        className="text-muted-foreground px-4 py-3 text-sm italic"
        data-testid="customer-bookings-empty"
      >
        {t.customerDetail.bookings.empty}
      </p>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 pt-1">
      <p
        className="text-muted-foreground text-xs uppercase tracking-wide"
        data-testid="customer-bookings-summary"
      >
        {t.customerDetail.bookings.summary(summary.count, summary.total)}
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                {t.customerDetail.bookings.columnDate}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t.customerDetail.bookings.columnProduct}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t.customerDetail.bookings.columnStatus}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {t.customerDetail.bookings.columnTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const start = earliestServiceDate(row)
              const end = start ? matchingServiceEnd(row, start) : null
              // Prefer the service date for the operator's mental model
              // ("when has this customer flown with us?"); fall back to the
              // booked-on timestamp for rows with no scheduled item.
              const dateLabel = start
                ? formatServiceDateRange(start, end)
                : dateDisplay(row.created_at, { hour12 })
              const label = `${dateLabel} · ${productDisplay(row)}`
              return (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onBookingClick(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onBookingClick(row)
                    }
                  }}
                  aria-label={t.customerDetail.bookings.rowAriaLabel(label)}
                  data-testid={`customer-booking-row-${row.id}`}
                  className={cn(
                    'hover:bg-accent/50 focus-visible:bg-accent/60',
                    'cursor-pointer border-t outline-none transition-colors',
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-2">{dateLabel}</td>
                  <td className="px-3 py-2">
                    <span className="block truncate">{productDisplay(row)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <StageBadge
                      state={row.current_semantic_state}
                      stageCode={stageCode(row)}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {priceDisplay(row)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
