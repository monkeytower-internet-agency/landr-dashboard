// landr-7o2a — Customer 360 "Bookings" tab content for CustomerDetailSheet.
// landr-ajb4 — split into two sections: "Open" (current / upcoming) and
// "Past" (terminal stage AND service date < today). Each section has its
// own header (label + "N bookings, €X total"), its own empty-state, and a
// visual separator between them.
//
// Pure presentation: data comes from fetchBookingsForContact(contactId) and
// every cell reuses the existing booking display helpers (priceDisplay,
// productDisplay, formatServiceDateRange, StageBadge, …) so this stays in
// lock-step with BookingsTable without re-implementing the formatting.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, History } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'
import { StageBadge } from '@/components/booking/StageBadge'
import {
  type BookingRow,
  dateDisplay,
  earliestServiceDate,
  fetchBookingsForContact,
  formatServiceDateRange,
  matchingServiceEnd,
  partitionBookingsByLifecycle,
  priceDisplay,
  productDisplay,
  stageCode,
  toDateOnlyIso,
} from '@/lib/bookings'
import { useOperatorCalendarPrefs } from '@/lib/operator'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  contactId: string
  onBookingClick: (row: BookingRow) => void
}

// Sort a section by earliest service date. Open: ascending (nearest-upcoming
// first); Past: descending (most-recent-first). Rows missing a service date
// fall back to created_at and sink to the end of the list in either
// direction (operators rarely care about un-dated bookings).
function sortSection(
  rows: BookingRow[],
  direction: 'asc' | 'desc',
): BookingRow[] {
  const copy = [...rows]
  copy.sort((a, b) => {
    const aKey = earliestServiceDate(a) ?? a.created_at.slice(0, 10)
    const bKey = earliestServiceDate(b) ?? b.created_at.slice(0, 10)
    if (aKey === bKey) return 0
    if (direction === 'asc') return aKey < bKey ? -1 : 1
    return aKey < bKey ? 1 : -1
  })
  return copy
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

  // landr-ajb4 — anchor "today" in the operator's local timezone so the
  // Open / Past cutover rolls at the operator's midnight (matches
  // isPastBooking in lib/bookings.ts).
  const sections = useMemo(() => {
    const today = toDateOnlyIso(new Date())
    const { open, past } = partitionBookingsByLifecycle(rows, today)
    return {
      open: sortSection(open, 'asc'),
      past: sortSection(past, 'desc'),
    }
  }, [rows])

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

  // Fully-empty short-circuit kept so the "no bookings yet" copy stays the
  // same when a contact has zero history (the test in CustomerDetailSheet
  // asserts customer-bookings-empty for this case).
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
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-2 pt-1">
      <BookingsSection
        kind="open"
        rows={sections.open}
        hour12={hour12}
        onBookingClick={onBookingClick}
      />
      {/* landr-ajb4 — visible divider between Open and Past so the
         two sections read as distinct lists rather than one long table. */}
      <hr
        className="border-border/60"
        data-testid="customer-bookings-section-divider"
      />
      <BookingsSection
        kind="past"
        rows={sections.past}
        hour12={hour12}
        onBookingClick={onBookingClick}
      />
    </div>
  )
}

type SectionKind = 'open' | 'past'

const SECTION_CONFIG: Record<
  SectionKind,
  { label: string; emptyTitle: string; testidBase: string; icon: typeof CalendarClock }
> = {
  open: {
    label: t.customerDetail.bookings.sectionOpenLabel,
    emptyTitle: t.customerDetail.bookings.sectionOpenEmpty,
    testidBase: 'customer-bookings-open',
    icon: CalendarClock,
  },
  past: {
    label: t.customerDetail.bookings.sectionPastLabel,
    emptyTitle: t.customerDetail.bookings.sectionPastEmpty,
    testidBase: 'customer-bookings-past',
    icon: History,
  },
}

function BookingsSection({
  kind,
  rows,
  hour12,
  onBookingClick,
}: {
  kind: SectionKind
  rows: BookingRow[]
  hour12: boolean
  onBookingClick: (row: BookingRow) => void
}) {
  const cfg = SECTION_CONFIG[kind]
  const summary = useMemo(() => summarise(rows), [rows])

  return (
    <section
      className="flex flex-col gap-3"
      data-testid={`${cfg.testidBase}-section`}
      aria-label={cfg.label}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          {cfg.label}
        </h3>
        {rows.length > 0 ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid={`${cfg.testidBase}-summary`}
          >
            {t.customerDetail.bookings.summary(summary.count, summary.total)}
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={cfg.icon}
          title={cfg.emptyTitle}
          size="compact"
          data-testid={`${cfg.testidBase}-empty`}
        />
      ) : (
        <BookingsSectionTable
          rows={rows}
          hour12={hour12}
          onBookingClick={onBookingClick}
        />
      )}
    </section>
  )
}

function BookingsSectionTable({
  rows,
  hour12,
  onBookingClick,
}: {
  rows: BookingRow[]
  hour12: boolean
  onBookingClick: (row: BookingRow) => void
}) {
  return (
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
              ? formatServiceDateRange(start, end, { hour12 })
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
  )
}
