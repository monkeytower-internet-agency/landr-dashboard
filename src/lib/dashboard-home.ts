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
