// Reporting / revenue helpers — landr-m05.9.
//
// Pure functions that take BookingRow[] (from lib/bookings.ts) and return:
//   - KPIs (count, revenue sum, average ticket)
//   - chart data (revenue per day, bookings per ISO-week)
//   - CSV strings (RFC 4180-style escaping)
//
// Revenue semantics:
//   - We exclude cancelled bookings from revenue + average-ticket math
//     (gross_total has been promised back; finalising is what locks it in).
//   - Total-bookings count uses ALL non-cancelled rows so refunded/no-show
//     bookings still appear in the operational picture.
//   - Currency is taken from the first non-cancelled row encountered;
//     mixed-currency operators get a fallback to EUR and a flag.
//
// Date filtering operates on `created_at`. We use UTC throughout so the
// numbers match between the API and the dashboard regardless of viewer TZ.

import type { BookingRow, BookingSemanticState } from '@/lib/bookings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DateRange = {
  /** Inclusive ISO date (YYYY-MM-DD) for the lower bound, or null = open. */
  from: string | null
  /** Inclusive ISO date (YYYY-MM-DD) for the upper bound, or null = open. */
  to: string | null
}

export type ReportingKpis = {
  bookingCount: number
  revenueTotal: number
  averageTicket: number
  currency: string
  /** True if multiple currencies were seen — UI should warn. */
  mixedCurrency: boolean
  /** Count of cancelled bookings excluded from revenue math. */
  cancelledExcluded: number
}

export type RevenuePoint = {
  /** ISO date YYYY-MM-DD (UTC). */
  date: string
  /** Revenue in numeric units for this day. */
  revenue: number
}

export type BookingsPerWeekPoint = {
  /** ISO week label `YYYY-Www` (e.g. `2026-W19`). */
  week: string
  /** First day of the week as ISO date (Monday, UTC). */
  weekStart: string
  /** Total bookings (non-cancelled) that started in this week. */
  bookings: number
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

const EXCLUDED_FROM_REVENUE: BookingSemanticState[] = ['cancelled']

function isRevenueState(state: BookingSemanticState): boolean {
  return !EXCLUDED_FROM_REVENUE.includes(state)
}

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Filter rows whose `created_at` falls within [from, to]. `null` bounds = open.
 * Dates are compared as date-only (YYYY-MM-DD) in UTC.
 */
export function filterByDateRange(
  rows: BookingRow[],
  range: DateRange,
): BookingRow[] {
  if (!range.from && !range.to) return rows
  return rows.filter((row) => {
    const d = row.created_at.slice(0, 10)
    if (range.from && d < range.from) return false
    if (range.to && d > range.to) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// KPI calculation
// ---------------------------------------------------------------------------

export function computeKpis(rows: BookingRow[]): ReportingKpis {
  let revenueTotal = 0
  let revenueCount = 0
  let cancelledExcluded = 0
  let currency = 'EUR'
  let firstCurrencyFound = false
  let mixedCurrency = false
  let totalBookings = 0

  for (const row of rows) {
    totalBookings += 1
    if (!isRevenueState(row.current_semantic_state)) {
      cancelledExcluded += 1
      continue
    }
    const amount = toNumber(row.gross_total)
    const c = (row.currency || 'EUR').toUpperCase()
    if (!firstCurrencyFound) {
      currency = c
      firstCurrencyFound = true
    } else if (c !== currency) {
      mixedCurrency = true
    }
    revenueTotal += amount
    revenueCount += 1
  }

  // Round to 2 decimals to avoid FP-noise (e.g. 149.99 + 0.01 = 150.00).
  revenueTotal = Math.round(revenueTotal * 100) / 100
  const averageTicket =
    revenueCount === 0 ? 0 : Math.round((revenueTotal / revenueCount) * 100) / 100

  return {
    bookingCount: totalBookings,
    revenueTotal,
    averageTicket,
    currency,
    mixedCurrency,
    cancelledExcluded,
  }
}

// ---------------------------------------------------------------------------
// Chart data shaping
// ---------------------------------------------------------------------------

/**
 * Group revenue by day (UTC). Cancelled bookings contribute 0.
 * Returns points sorted ascending by date, with zero-revenue days
 * filled in across the [min, max] range so the area chart doesn't
 * have visual gaps.
 */
export function shapeRevenueOverTime(rows: BookingRow[]): RevenuePoint[] {
  const byDate = new Map<string, number>()

  for (const row of rows) {
    if (!isRevenueState(row.current_semantic_state)) continue
    const d = row.created_at.slice(0, 10)
    const v = toNumber(row.gross_total)
    byDate.set(d, (byDate.get(d) ?? 0) + v)
  }

  if (byDate.size === 0) return []

  const sortedDates = Array.from(byDate.keys()).sort()
  const first = sortedDates[0]
  const last = sortedDates[sortedDates.length - 1]

  // Fill gaps so the chart has even spacing. Capped at 365 days; longer ranges
  // skip the fill to avoid pathological cases (charts get unreadable anyway).
  const points: RevenuePoint[] = []
  const startMs = Date.UTC(
    Number(first.slice(0, 4)),
    Number(first.slice(5, 7)) - 1,
    Number(first.slice(8, 10)),
  )
  const endMs = Date.UTC(
    Number(last.slice(0, 4)),
    Number(last.slice(5, 7)) - 1,
    Number(last.slice(8, 10)),
  )
  const days = Math.round((endMs - startMs) / 86_400_000)

  if (days > 365) {
    // Just emit the observed points, no fill.
    for (const date of sortedDates) {
      points.push({ date, revenue: round2(byDate.get(date) ?? 0) })
    }
    return points
  }

  for (let i = 0; i <= days; i += 1) {
    const ms = startMs + i * 86_400_000
    const d = new Date(ms)
    const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
    points.push({ date, revenue: round2(byDate.get(date) ?? 0) })
  }
  return points
}

/**
 * Group bookings by ISO week. Cancelled bookings are excluded.
 * Week is computed from the booking's earliest scheduled item
 * (`booking_products.date_range_start`), falling back to `created_at`
 * so unscheduled bookings still appear.
 */
export function shapeBookingsPerWeek(
  rows: BookingRow[],
): BookingsPerWeekPoint[] {
  const byWeek = new Map<string, BookingsPerWeekPoint>()

  for (const row of rows) {
    if (!isRevenueState(row.current_semantic_state)) continue
    const refDate = earliestScheduledDate(row) ?? row.created_at.slice(0, 10)
    const { isoYear, isoWeek, weekStart } = isoWeekInfo(refDate)
    const key = `${isoYear}-W${pad2(isoWeek)}`
    const existing = byWeek.get(key)
    if (existing) {
      existing.bookings += 1
    } else {
      byWeek.set(key, { week: key, weekStart, bookings: 1 })
    }
  }

  return Array.from(byWeek.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  )
}

function earliestScheduledDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    if (!item.date_range_start) continue
    if (!best || item.date_range_start < best) best = item.date_range_start
  }
  return best ? best.slice(0, 10) : null
}

// ISO-8601 week-numbering. Reference algorithm: the ISO week that contains
// the Thursday of the given week. Day-of-week: Mon=1..Sun=7.
function isoWeekInfo(dateOnly: string): {
  isoYear: number
  isoWeek: number
  weekStart: string
} {
  const [y, m, d] = dateOnly.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d)
  const date = new Date(ms)
  const day = date.getUTCDay() || 7 // Sun(0) -> 7
  // Move to the Thursday of this week (week-defining day per ISO-8601).
  const thursdayMs = ms + (4 - day) * 86_400_000
  const thursday = new Date(thursdayMs)
  const isoYear = thursday.getUTCFullYear()
  const jan4ms = Date.UTC(isoYear, 0, 4)
  const jan4 = new Date(jan4ms)
  const jan4Day = jan4.getUTCDay() || 7
  const week1MondayMs = jan4ms - (jan4Day - 1) * 86_400_000
  const isoWeek = Math.round((thursdayMs - week1MondayMs) / (7 * 86_400_000)) + 1
  const mondayMs = ms - (day - 1) * 86_400_000
  const monday = new Date(mondayMs)
  const weekStart = `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`
  return { isoYear, isoWeek, weekStart }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Escape a single CSV field per RFC 4180:
 *   - if it contains "," `"` `\n` or `\r`, wrap in double-quotes
 *   - any embedded `"` is doubled
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  if (s === '') return ''
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function rowsToCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines: string[] = []
  lines.push(headers.map(csvEscape).join(','))
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','))
  }
  // Trailing newline keeps it POSIX-friendly.
  return `${lines.join('\r\n')}\r\n`
}

/**
 * Build the bookings CSV string. Columns chosen to mirror what staff would
 * normally hand to accounting: created date, booking id, customer, state,
 * gross + currency.
 */
export function buildBookingsCsv(rows: BookingRow[]): string {
  const headers = [
    'Created',
    'Booking ID',
    'Customer',
    'Email',
    'State',
    'Gross total',
    'Currency',
    'Product(s)',
  ] as const
  const data = rows.map((row) => {
    const customer = row.customer
    const customerName =
      customer
        ? [customer.first_name, customer.last_name]
            .filter((s): s is string => !!s && s.trim().length > 0)
            .join(' ') || customer.email || ''
        : ''
    const products = row.items
      .map((item) => item.products?.name)
      .filter((n): n is string => !!n)
      .join(' | ')
    return [
      row.created_at,
      row.id,
      customerName,
      customer?.email ?? '',
      row.current_semantic_state,
      toNumber(row.gross_total).toFixed(2),
      row.currency || 'EUR',
      products,
    ]
  })
  return rowsToCsv(headers, data)
}

/**
 * Trigger a CSV file download in the browser. Returns the object URL so
 * tests can assert against it (also lets callers `URL.revokeObjectURL` it).
 */
export function downloadCsv(filename: string, csv: string): string {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the click handler a tick before revoking, so the browser has a
  // chance to start the download. Most browsers also tolerate immediate
  // revoke, but the timeout is the documented-safe pattern.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return url
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const currencyFormatterCache = new Map<string, Intl.NumberFormat>()
export function formatCurrency(amount: number, currency: string): string {
  const key = currency || 'EUR'
  let fmt = currencyFormatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: key })
    currencyFormatterCache.set(key, fmt)
  }
  return fmt.format(amount)
}

const numberFormatter = new Intl.NumberFormat('en-IE')
export function formatCount(n: number): string {
  return numberFormatter.format(n)
}
