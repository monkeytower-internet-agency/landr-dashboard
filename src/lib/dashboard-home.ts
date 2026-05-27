// Dashboard-home helpers — landr-p600.
//
// Pure functions that derive the dashboard widgets from existing
// fetcher payloads (BookingRow[] + ContactRow[]). No new backend calls
// — the Dashboard route fetches the same data the Bookings / Contacts
// / Approvals routes already use, then shapes it for the home view.
//
// Date semantics:
//   - "Today" = the calling user's local date (operator working in their
//     own TZ). We compare item.date_range_start (YYYY-MM-DD) to the
//     viewer's local today; bookings without scheduled items are
//     excluded from the today list.
//   - "This week" = ISO week (Mon..Sun) containing the local today.
//     Revenue + bookings count use created_at; new-contact count uses
//     contact.created_at. Cancelled bookings are excluded from revenue
//     (matches lib/reporting.ts semantics).

import type { ProductForSchedule } from '@/lib/availability'
import type { BookingRow, BookingSemanticState } from '@/lib/bookings'
import type { ContactRow } from '@/lib/contacts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityEvent = {
  /** Stable id for React keys; combines event-kind + source row id. */
  id: string
  kind: 'booking_created' | 'contact_created' | 'approval_pending'
  /** ISO timestamp (UTC) used for sorting. */
  occurredAt: string
  /** Human label (customer / contact name). */
  label: string
  /** Optional secondary line (product name, etc). */
  detail: string | null
  /** Internal link target — `null` if the row doesn't deep-link. */
  href: string | null
}

export type WeekSummary = {
  revenue: number
  /** Currency code (defaults to EUR if no rows). Matches reporting.ts. */
  currency: string
  bookings: number
  newContacts: number
}

export type RevenueDayPoint = {
  /** ISO date YYYY-MM-DD. */
  date: string
  revenue: number
}

// landr-kav4 — one row in the Today's-capacity card. `booked` is the sum
// of `participants.length` across today's bookings that include this
// product as an item. `capacity` mirrors product.capacity_per_unit (a >=1
// integer when set, NULL when the product doesn't carry a per-unit limit
// — e.g. non-hotel_room services where seats are tracked on the
// availability row, not the product). `percent` is `booked / capacity`
// rounded to the nearest int (0 when capacity is 0 to avoid /0).
export type CapacityRow = {
  productId: string
  name: string
  booked: number
  capacity: number
  percent: number
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Local-date YYYY-MM-DD for the given Date. Uses viewer's TZ. */
export function localDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * ISO-week boundaries (Mon..Sun) containing the given local date.
 * Returns inclusive local-date YYYY-MM-DD strings.
 */
export function weekBoundsForLocal(now: Date): {
  start: string
  end: string
} {
  const dow = now.getDay() || 7 // Sun=0 -> 7
  const startMs = now.getTime() - (dow - 1) * 86_400_000
  const endMs = startMs + 6 * 86_400_000
  return {
    start: localDateOnly(new Date(startMs)),
    end: localDateOnly(new Date(endMs)),
  }
}

const EXCLUDED_FROM_REVENUE: BookingSemanticState[] = ['cancelled']

function isRevenueState(state: BookingSemanticState): boolean {
  return !EXCLUDED_FROM_REVENUE.includes(state)
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Earliest scheduled date (YYYY-MM-DD) across a booking's items, or null. */
function earliestItemDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    const d = item.date_range_start
    if (!d) continue
    if (!best || d < best) best = d
  }
  return best
}

// ---------------------------------------------------------------------------
// Today's bookings
// ---------------------------------------------------------------------------

/**
 * Bookings whose earliest scheduled date equals the viewer's local today.
 * Cancelled bookings are excluded — operators care about the day's
 * actionable list, not historical ghosts.
 *
 * Sorted by the (earliest) item start date asc — for `single_date` /
 * `time_slot` products that gives time-of-day order; for `days_range`
 * the start is already today so ordering falls back to booking id.
 */
export function todaysBookings(
  rows: BookingRow[],
  now: Date = new Date(),
): BookingRow[] {
  const today = localDateOnly(now)
  return rows
    .filter((row) => {
      if (!isRevenueState(row.current_semantic_state)) return false
      const start = earliestItemDate(row)
      return start === today
    })
    .sort((a, b) => {
      const aStart = earliestItemDate(a) ?? ''
      const bStart = earliestItemDate(b) ?? ''
      if (aStart !== bStart) return aStart.localeCompare(bStart)
      return a.id.localeCompare(b.id)
    })
}

// ---------------------------------------------------------------------------
// This-week summary cards
// ---------------------------------------------------------------------------

/**
 * Revenue + booking count + new-contact count for the current ISO week.
 * Revenue rules match lib/reporting.ts (cancelled excluded; mixed
 * currencies fall back to EUR, no mixed-currency flag here — the home
 * card is intentionally informational).
 */
export function weekSummary(
  bookings: BookingRow[],
  contacts: ContactRow[],
  now: Date = new Date(),
): WeekSummary {
  const { start, end } = weekBoundsForLocal(now)
  let revenue = 0
  let bookingCount = 0
  let currency = 'EUR'
  let firstCurrencyFound = false

  for (const row of bookings) {
    const day = row.created_at.slice(0, 10)
    if (day < start || day > end) continue
    bookingCount += 1
    if (!isRevenueState(row.current_semantic_state)) continue
    const c = (row.currency || 'EUR').toUpperCase()
    if (!firstCurrencyFound) {
      currency = c
      firstCurrencyFound = true
    }
    revenue += toNumber(row.gross_total)
  }

  let newContacts = 0
  for (const contact of contacts) {
    const day = contact.created_at.slice(0, 10)
    if (day < start || day > end) continue
    newContacts += 1
  }

  return {
    revenue: Math.round(revenue * 100) / 100,
    currency,
    bookings: bookingCount,
    newContacts,
  }
}

/**
 * Revenue grouped by day for the current ISO week. Always returns 7
 * points (Mon..Sun) with zero-fill so the spark chart has a stable
 * x-axis. Cancelled bookings excluded.
 */
export function weekRevenueDaily(
  bookings: BookingRow[],
  now: Date = new Date(),
): RevenueDayPoint[] {
  const { start } = weekBoundsForLocal(now)
  const byDate = new Map<string, number>()
  // Pre-fill 7 days so empty weeks still render a flat line.
  const [sy, sm, sd] = start.split('-').map(Number)
  const startLocalMs = new Date(sy, sm - 1, sd).getTime()
  for (let i = 0; i < 7; i += 1) {
    byDate.set(localDateOnly(new Date(startLocalMs + i * 86_400_000)), 0)
  }
  const end = localDateOnly(new Date(startLocalMs + 6 * 86_400_000))

  for (const row of bookings) {
    if (!isRevenueState(row.current_semantic_state)) continue
    const day = row.created_at.slice(0, 10)
    if (day < start || day > end) continue
    byDate.set(day, (byDate.get(day) ?? 0) + toNumber(row.gross_total))
  }

  return Array.from(byDate.entries())
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------

function customerLabel(row: BookingRow, fallback: string): string {
  const c = row.customer
  if (!c) return fallback
  const name = [c.first_name, c.last_name]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join(' ')
    .trim()
  return name || c.email || fallback
}

function contactLabel(row: ContactRow, fallback: string): string {
  const name = [row.first_name, row.last_name]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join(' ')
    .trim()
  return name || row.email || fallback
}

function productLabel(row: BookingRow): string | null {
  const named = row.items
    .map((item) => item.products?.name)
    .filter((n): n is string => !!n)
  if (named.length === 0) return null
  if (named.length === 1) return named[0]
  return `${named[0]} +${named.length - 1}`
}

/**
 * Merge bookings + contacts + pending approvals into a single
 * chronological activity feed. Newest first; capped at `limit`.
 *
 * Notes on dedup:
 *   - Pending-approval entries share the source booking row, so a
 *     newly-created booking that is also awaiting general approval
 *     appears twice (once as `booking_created`, once as
 *     `approval_pending`). That mirrors what an operator actually
 *     wants to see — "this booking happened, and it needs my
 *     attention".
 */
export function recentActivity(args: {
  bookings: BookingRow[]
  contacts: ContactRow[]
  pendingApprovals: BookingRow[]
  customerFallback: string
  limit?: number
}): ActivityEvent[] {
  const { bookings, contacts, pendingApprovals, customerFallback } = args
  const limit = args.limit ?? 10
  const events: ActivityEvent[] = []

  for (const row of bookings) {
    events.push({
      id: `booking:${row.id}`,
      kind: 'booking_created',
      occurredAt: row.created_at,
      label: customerLabel(row, customerFallback),
      detail: productLabel(row),
      href: null,
    })
  }

  for (const row of contacts) {
    events.push({
      id: `contact:${row.id}`,
      kind: 'contact_created',
      occurredAt: row.created_at,
      label: contactLabel(row, customerFallback),
      detail: null,
      href: null,
    })
  }

  for (const row of pendingApprovals) {
    events.push({
      id: `approval:${row.id}`,
      kind: 'approval_pending',
      occurredAt: row.created_at,
      label: customerLabel(row, customerFallback),
      detail: productLabel(row),
      href: '/approvals/general',
    })
  }

  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return events.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Today's capacity (landr-kav4)
// ---------------------------------------------------------------------------

/**
 * Compute per-product seats-booked vs capacity for the viewer's local
 * today. Driven by the same fetchers the Dashboard already uses
 * (fetchBookings + fetchSchedulableProducts) — no new backend.
 *
 * Booked = sum of `participants.length` across today's non-cancelled
 * bookings that include the product as an item. Falls back to 1 per
 * booking when the participants array is missing/empty so a brand-new
 * booking with no participant rows still contributes a seat. Multi-
 * product bookings attribute the same participant count to each item
 * — Para42 bookings are overwhelmingly single-product, so the
 * approximation is acceptable for v1.
 *
 * Products without a capacity_per_unit (most non-hotel_room services)
 * are filtered out — the card only renders rows where X/Y is
 * meaningful. Products with zero today-bookings AND a capacity_per_unit
 * still render (0/Y) so operators see the empty-but-bookable load.
 *
 * Output is sorted by percent DESC, then name ASC, so the most-loaded
 * product floats to the top.
 */
export function todaysCapacity(
  bookings: BookingRow[],
  products: Array<Pick<ProductForSchedule, 'id' | 'name' | 'capacity_per_unit'>>,
  now: Date = new Date(),
): CapacityRow[] {
  const today = localDateOnly(now)

  // Seats booked per product id, derived from today's bookings only.
  const bookedByProduct = new Map<string, number>()
  for (const row of bookings) {
    if (!isRevenueState(row.current_semantic_state)) continue
    if (earliestItemDate(row) !== today) continue
    const seats = row.participants?.length ?? 0
    const contribution = seats > 0 ? seats : 1
    for (const item of row.items) {
      const pid = item.products?.id
      if (!pid) continue
      bookedByProduct.set(pid, (bookedByProduct.get(pid) ?? 0) + contribution)
    }
  }

  const rows: CapacityRow[] = []
  for (const p of products) {
    if (p.capacity_per_unit == null || p.capacity_per_unit <= 0) continue
    const booked = bookedByProduct.get(p.id) ?? 0
    const capacity = p.capacity_per_unit
    const percent = capacity > 0 ? Math.round((booked / capacity) * 100) : 0
    rows.push({ productId: p.id, name: p.name, booked, capacity, percent })
  }

  rows.sort((a, b) => {
    if (a.percent !== b.percent) return b.percent - a.percent
    return a.name.localeCompare(b.name)
  })
  return rows
}
