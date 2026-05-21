// Analytics aggregation helpers — landr-af6c.
//
// Pure functions that take BookingRow[] (from lib/bookings.ts) and shape it
// into the data structures the /analytics route's charts need:
//
//   - Revenue over time, bucketed by day/week/month depending on the
//     selected range (so the line stays readable at 30/90/365d).
//   - Bookings per product (bar chart, sorted descending).
//   - Conversion funnel (initiated → confirmed → completed).
//   - Top customers table (by revenue, then booking count).
//   - Occupancy heatmap (weekday × hour-of-day cells), bucketed from the
//     earliest scheduled item or fallback to created_at.
//
// All revenue math mirrors lib/reporting.ts: cancelled bookings contribute
// 0 revenue and are still counted in the operational booking total. We use
// UTC throughout so the numbers stay reproducible irrespective of viewer TZ.
//
// No FastAPI hop — everything aggregates client-side off the existing
// bookings fetch, which RLS already scopes by operator.

import {
  customerDisplay,
  type BookingRow,
  type BookingSemanticState,
} from '@/lib/bookings'

// ---------------------------------------------------------------------------
// Range presets — drive both the data window AND the bucket granularity.
// ---------------------------------------------------------------------------

export type RangePresetKey = 'last30' | 'last90' | 'last365'

export type Bucket = 'day' | 'week' | 'month'

/** Day-count window for each preset. The /analytics page uses these to
 *  derive a `[from, today]` window passed to filterByDateRangeAnalytics. */
export function rangeWindowDays(key: RangePresetKey): number {
  switch (key) {
    case 'last30':
      return 30
    case 'last90':
      return 90
    case 'last365':
      return 365
  }
}

/** Pick a sensible bucket size for the range. Day for ≤30d, week for
 *  ≤90d, month for the year view — keeps each chart ≤30 data points. */
export function bucketForRange(key: RangePresetKey): Bucket {
  switch (key) {
    case 'last30':
      return 'day'
    case 'last90':
      return 'week'
    case 'last365':
      return 'month'
  }
}

// ---------------------------------------------------------------------------
// Shared filtering / numeric helpers — kept private to this module so the
// existing reporting.ts contract is untouched.
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** YYYY-MM-DD (UTC) for a Date. */
function utcDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** YYYY-MM-DD (UTC) for "today". */
export function todayUtcIso(now: Date = new Date()): string {
  return utcDateOnly(now)
}

/** YYYY-MM-DD (UTC) for `days` days ago (so days=0 = today, days=29 = 30d window). */
export function daysAgoUtcIso(days: number, now: Date = new Date()): string {
  return utcDateOnly(new Date(now.getTime() - days * 86_400_000))
}

/** Earliest scheduled date for the booking (first booking_products start),
 *  falling back to created_at when no item is scheduled. Used for the
 *  occupancy heatmap and per-product breakdowns so the activity lands in
 *  the bucket that reflects when the service happens, not when it was
 *  booked. */
function activityDate(row: BookingRow): string {
  let best: string | null = null
  for (const item of row.items) {
    if (!item.date_range_start) continue
    if (best === null || item.date_range_start < best) best = item.date_range_start
  }
  return best ?? row.created_at.slice(0, 10)
}

// ---------------------------------------------------------------------------
// Date filter (mirrors reporting.filterByDateRange but takes a single
// inclusive [from, to] tuple; analytics presets always supply both ends).
// ---------------------------------------------------------------------------

export function filterByCreatedAt(
  rows: BookingRow[],
  from: string,
  to: string,
): BookingRow[] {
  return rows.filter((row) => {
    const d = row.created_at.slice(0, 10)
    return d >= from && d <= to
  })
}

// ---------------------------------------------------------------------------
// Revenue over time (line chart, day/week/month buckets).
// ---------------------------------------------------------------------------

export type RevenueOverTimePoint = {
  /** Canonical key for the bucket: 'YYYY-MM-DD' (day), 'YYYY-MM-DD'
   *  Monday-anchored (week), or 'YYYY-MM' (month). */
  key: string
  /** Human-friendly bucket label for the chart axis. */
  label: string
  /** Sum of gross_total for non-cancelled bookings in this bucket. */
  revenue: number
}

/** Monday-anchored YYYY-MM-DD for the ISO week containing `dateOnly`. */
function isoWeekMonday(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d)
  const day = new Date(ms).getUTCDay() || 7 // Sun(0) -> 7
  const mondayMs = ms - (day - 1) * 86_400_000
  return utcDateOnly(new Date(mondayMs))
}

/** Bucket key for `dateOnly` according to the requested bucket size. */
function bucketKey(dateOnly: string, bucket: Bucket): string {
  switch (bucket) {
    case 'day':
      return dateOnly
    case 'week':
      return isoWeekMonday(dateOnly)
    case 'month':
      return dateOnly.slice(0, 7) // YYYY-MM
  }
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Human label for a bucket key. */
function bucketLabel(key: string, bucket: Bucket): string {
  if (bucket === 'month') {
    const [y, m] = key.split('-').map(Number)
    return `${SHORT_MONTHS[m - 1]} ${String(y).slice(2)}`
  }
  // day + week share YYYY-MM-DD; render as `MMM d`.
  const [, m, d] = key.split('-').map(Number)
  return `${SHORT_MONTHS[m - 1]} ${d}`
}

/** Iterate over every bucket key in [from, to] so the chart has no gaps. */
function enumerateBuckets(from: string, to: string, bucket: Bucket): string[] {
  const out: string[] = []
  if (bucket === 'month') {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    let y = fy
    let m = fm
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${pad2(m)}`)
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
    return out
  }
  // day / week — step by 1 day, dedupe to bucket key.
  const [fy, fmo, fd] = from.split('-').map(Number)
  const [ty, tmo, td] = to.split('-').map(Number)
  const startMs = Date.UTC(fy, fmo - 1, fd)
  const endMs = Date.UTC(ty, tmo - 1, td)
  const days = Math.round((endMs - startMs) / 86_400_000)
  const seen = new Set<string>()
  for (let i = 0; i <= days; i += 1) {
    const d = utcDateOnly(new Date(startMs + i * 86_400_000))
    const key = bucketKey(d, bucket)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  return out
}

export function shapeRevenueOverTime(
  rows: BookingRow[],
  args: { from: string; to: string; bucket: Bucket },
): RevenueOverTimePoint[] {
  const byKey = new Map<string, number>()
  for (const row of rows) {
    if (!isRevenueState(row.current_semantic_state)) continue
    const d = row.created_at.slice(0, 10)
    if (d < args.from || d > args.to) continue
    const key = bucketKey(d, args.bucket)
    byKey.set(key, (byKey.get(key) ?? 0) + toNumber(row.gross_total))
  }
  const keys = enumerateBuckets(args.from, args.to, args.bucket)
  return keys.map((key) => ({
    key,
    label: bucketLabel(key, args.bucket),
    revenue: round2(byKey.get(key) ?? 0),
  }))
}

// ---------------------------------------------------------------------------
// Bookings per product (bar chart).
//
// A single booking can carry multiple booking_products — each product line
// counts as one for this view (the chart answers "which products carry the
// load", not "which products are bundled"). Cancelled bookings are
// excluded since the operator-facing question is about successful sales.
// ---------------------------------------------------------------------------

export type ProductBreakdownPoint = {
  productId: string | null
  productName: string
  bookings: number
  revenue: number
}

/** A product's allocated revenue is the booking gross_total divided evenly
 *  across its line items, so multi-product bookings don't double-count. */
function perItemRevenue(row: BookingRow): number {
  const lineCount = row.items.length || 1
  return toNumber(row.gross_total) / lineCount
}

export function shapeBookingsPerProduct(
  rows: BookingRow[],
): ProductBreakdownPoint[] {
  const acc = new Map<string, ProductBreakdownPoint>()
  for (const row of rows) {
    if (!isRevenueState(row.current_semantic_state)) continue
    const share = perItemRevenue(row)
    if (row.items.length === 0) {
      // Booking with no items — still surface it so totals balance.
      const key = '__no_product__'
      const cur = acc.get(key) ?? {
        productId: null,
        productName: '(no product)',
        bookings: 0,
        revenue: 0,
      }
      cur.bookings += 1
      cur.revenue += toNumber(row.gross_total)
      acc.set(key, cur)
      continue
    }
    for (const item of row.items) {
      const id = item.products?.id ?? null
      const name = item.products?.name ?? '(unknown product)'
      const key = id ?? `__name__:${name}`
      const cur = acc.get(key) ?? {
        productId: id,
        productName: name,
        bookings: 0,
        revenue: 0,
      }
      cur.bookings += 1
      cur.revenue += share
      acc.set(key, cur)
    }
  }
  return Array.from(acc.values())
    .map((p) => ({ ...p, revenue: round2(p.revenue) }))
    .sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue)
}

// ---------------------------------------------------------------------------
// Conversion funnel (initiated → confirmed → completed).
//
// LANDR's funnel collapses the lifecycle states into three coarse buckets
// so the chart reads as a true funnel (each step contains its successors):
//
//   initiated  — every non-cancelled booking that came in.
//   confirmed  — moved past the pending-approval gate.
//   completed  — finalised bookings (revenue locked in).
//
// Cancelled / no-show rows are counted as drop-off and surfaced as a
// separate annotation so the operator sees WHY the funnel narrows.
// ---------------------------------------------------------------------------

export type FunnelStageKey = 'initiated' | 'confirmed' | 'completed'

export type FunnelStage = {
  key: FunnelStageKey
  /** Count of bookings that reached at least this stage. */
  count: number
  /** Conversion vs. the previous stage (0..1). Stage 0 is always 1. */
  conversionFromPrev: number
  /** Conversion vs. the initiated stage (0..1). */
  conversionFromTop: number
}

export type ConversionFunnel = {
  stages: FunnelStage[]
  cancelled: number
  noShow: number
}

function stageReached(state: BookingSemanticState, target: FunnelStageKey): boolean {
  // Every state except cancelled counts as "initiated" — the customer made
  // it past the widget. no_show is included in initiated/confirmed because
  // by definition the booking WAS confirmed; the absence happened later.
  if (state === 'cancelled') return false
  switch (target) {
    case 'initiated':
      return true
    case 'confirmed':
      return (
        state === 'confirmed' || state === 'finalised' || state === 'no_show'
      )
    case 'completed':
      return state === 'finalised'
  }
}

export function shapeConversionFunnel(rows: BookingRow[]): ConversionFunnel {
  const stageKeys: FunnelStageKey[] = ['initiated', 'confirmed', 'completed']
  const counts: Record<FunnelStageKey, number> = {
    initiated: 0,
    confirmed: 0,
    completed: 0,
  }
  let cancelled = 0
  let noShow = 0
  for (const row of rows) {
    const s = row.current_semantic_state
    if (s === 'cancelled') {
      cancelled += 1
      continue
    }
    if (s === 'no_show') noShow += 1
    for (const key of stageKeys) {
      if (stageReached(s, key)) counts[key] += 1
    }
  }
  const initiated = counts.initiated
  const stages: FunnelStage[] = []
  let prev = initiated
  for (const key of stageKeys) {
    const count = counts[key]
    const fromPrev = prev === 0 ? 0 : count / prev
    const fromTop = initiated === 0 ? 0 : count / initiated
    stages.push({
      key,
      count,
      conversionFromPrev: round4(fromPrev),
      conversionFromTop: round4(fromTop),
    })
    prev = count
  }
  return { stages, cancelled, noShow }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

// ---------------------------------------------------------------------------
// Top customers (table, sorted by revenue desc).
// ---------------------------------------------------------------------------

export type TopCustomerRow = {
  customerId: string | null
  name: string
  email: string | null
  bookings: number
  revenue: number
}

export function shapeTopCustomers(
  rows: BookingRow[],
  limit: number = 10,
): TopCustomerRow[] {
  const byCustomer = new Map<string, TopCustomerRow>()
  for (const row of rows) {
    if (!isRevenueState(row.current_semantic_state)) continue
    const id = row.customer?.id ?? null
    const key = id ?? `__anon__:${row.id}`
    const cur = byCustomer.get(key) ?? {
      customerId: id,
      name: customerDisplay(row),
      email: row.customer?.email ?? null,
      bookings: 0,
      revenue: 0,
    }
    cur.bookings += 1
    cur.revenue += toNumber(row.gross_total)
    byCustomer.set(key, cur)
  }
  return Array.from(byCustomer.values())
    .map((c) => ({ ...c, revenue: round2(c.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Occupancy heatmap — weekday × hour-of-day cells based on the booking's
// activity date / time. The dashboard never stores a per-day time-of-day
// field (booking_products schedule via date ranges or day arrays without an
// hour), so the "hour" axis falls back to created_at's hour. That gives the
// operator a "when do bookings come in" heatmap, which is what most
// operators actually want from this widget anyway.
// ---------------------------------------------------------------------------

export type HeatmapCell = {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number
  /** 0..23 in UTC. */
  hour: number
  count: number
}

export const HEATMAP_WEEKDAYS: ReadonlyArray<string> = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
]

export function shapeOccupancyHeatmap(rows: BookingRow[]): {
  cells: HeatmapCell[]
  max: number
} {
  // Pre-allocate the 7×24 grid so the renderer can index it directly.
  const grid: HeatmapCell[] = []
  for (let w = 0; w < 7; w += 1) {
    for (let h = 0; h < 24; h += 1) {
      grid.push({ weekday: w, hour: h, count: 0 })
    }
  }
  let max = 0
  for (const row of rows) {
    if (!isRevenueState(row.current_semantic_state)) continue
    // weekday: prefer the activity (service) date so the heatmap reflects
    // when the work happens; hour falls back to created_at since service
    // dates don't carry a wall-clock time.
    const activity = activityDate(row)
    const [y, m, d] = activity.split('-').map(Number)
    const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // Mon=0
    const created = new Date(row.created_at)
    const hour = Number.isNaN(created.getTime()) ? 0 : created.getUTCHours()
    const idx = weekday * 24 + hour
    const cell = grid[idx]
    if (!cell) continue
    cell.count += 1
    if (cell.count > max) max = cell.count
  }
  return { cells: grid, max }
}

// ---------------------------------------------------------------------------
// KPI summary — light wrapper so the Analytics page can show
// total revenue, bookings and average ticket without duplicating math.
// ---------------------------------------------------------------------------

export type AnalyticsKpis = {
  bookingCount: number
  revenueTotal: number
  averageTicket: number
  currency: string
  mixedCurrency: boolean
  cancelledExcluded: number
}

export function computeAnalyticsKpis(rows: BookingRow[]): AnalyticsKpis {
  let revenueTotal = 0
  let revenueCount = 0
  let cancelledExcluded = 0
  let currency = 'EUR'
  let foundCurrency = false
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
    if (!foundCurrency) {
      currency = c
      foundCurrency = true
    } else if (c !== currency) {
      mixedCurrency = true
    }
    revenueTotal += amount
    revenueCount += 1
  }
  revenueTotal = round2(revenueTotal)
  const averageTicket =
    revenueCount === 0 ? 0 : round2(revenueTotal / revenueCount)
  return {
    bookingCount: totalBookings,
    revenueTotal,
    averageTicket,
    currency,
    mixedCurrency,
    cancelledExcluded,
  }
}
