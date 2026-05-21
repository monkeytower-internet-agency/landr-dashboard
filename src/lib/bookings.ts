import type { QueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api-client'
// landr-g2m5 — single source of truth for the product_kind enum lives in
// lib/products.ts. Re-export here so existing `from '@/lib/bookings'`
// consumers keep compiling without changes.
import type { ProductKind } from '@/lib/products'

export type { ProductKind }

export type BookingSemanticState =
  | 'pending'
  | 'confirmed'
  | 'finalised'
  | 'cancelled'
  | 'no_show'

// free-text in booking_lifecycle_stages.code; operator-customizable.
// These three are the seeded defaults for Para42; other operators
// may have different codes.
export type BookingStageCode =
  | 'awaiting_general_approval'
  | 'awaiting_secondary_approval'
  | 'awaiting_hotel_approval'
  | 'awaiting_payment'
  | (string & {})

// Mirrors public.service_time_shape enum. NULL for non-service products.
export type ServiceTimeShape =
  | 'single_date'
  | 'days_range'
  | 'fixed_window'
  | 'time_slot'

// landr-lx7s — formerly `BookingItem`; renamed to `BookingProduct` to clear
// the name collision with views-bookings-data.ts's `BookingItem = BookingRow`
// alias. This shape is a single booking_products line (one product within a
// booking); the View layer's `BookingItem` is the row-level aggregate.
export type BookingProduct = {
  id: string
  date_range_start: string | null
  date_range_end: string | null
  selected_days: string[] | null
  products: {
    id: string
    name: string
    // landr-1lj — surface kind + time shape so the filter bar can match
    // booking rows. Both columns are NOT NULL / nullable per the
    // product_kinds_refactor migration (landr-glx).
    product_kind: ProductKind
    service_time_shape: ServiceTimeShape | null
  } | null
}

// landr-1lj — booking_participants brings the pickup_location_id for the
// pickup-location filter. We hydrate the location id+name via the FK join.
export type BookingParticipant = {
  id: string
  pickup_location: { id: string; name: string } | null
}

// landr-aqn4 — approval_trace shape mirrored from the FastAPI router
// (`app/routers/public_bookings.py::_serialize_capacity_verdict`) and the
// pure-Python evaluator (`app/services/approval.py::FiredRule`). The
// dashboard only reads the fields it needs for filtering / display; the
// real column is `jsonb` so unknown keys are tolerated.
export type ApprovalAppliedRule = {
  rule_id?: string
  rule_kind?: string
  rule_code?: string
  outcome?: string
  detail?: Record<string, unknown>
}

export type ApprovalTrace = {
  outcome?: string
  applied_rules?: ApprovalAppliedRule[]
  // Tolerated freeform keys (e.g. capacity_verdict, has_hotel_products):
  [key: string]: unknown
}

export type BookingRow = {
  id: string
  created_at: string
  current_semantic_state: BookingSemanticState
  current_stage: { code: string } | null
  gross_total: number | string
  currency: string
  // landr-aqn4 — surfaced for the Approvals queue (reason / capacity /
  // first-time-customer signals). Nullable for legacy bookings; optional
  // on the type because existing callers (BookingsTable / Calendar /
  // reporting) don't depend on it and their fixtures omit the field.
  approval_trace?: ApprovalTrace | null
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
  } | null
  items: BookingProduct[]
  participants?: BookingParticipant[]
}

const SELECT = `
  id,
  created_at,
  current_semantic_state,
  current_stage:booking_lifecycle_stages!current_stage_id ( code ),
  gross_total,
  currency,
  approval_trace,
  customer:contacts!inner ( id, first_name, last_name, email, phone ),
  items:booking_products ( id, date_range_start, date_range_end, selected_days, products ( id, name, product_kind, service_time_shape ) ),
  participants:booking_participants ( id, pickup_location:locations!pickup_location_id ( id, name ) )
`

/** Convenience helper — falls back to null safely. */
export function stageCode(row: BookingRow): string | null {
  return row.current_stage?.code ?? null
}

// landr-399m — shared cache-invalidation helper. Bookings are read through
// two query-key prefixes that DO NOT match each other:
//   - ['bookings']        → fetchBookings / fetchPendingGeneralApprovals
//   - ['views-bookings']  → lib/views-bookings-data.ts:useViewBookings
// Any write that mutates a booking (edit, cancel, approve/reject, contact
// patch on the customer FK) must invalidate BOTH so the Views layer
// (Bookings/Reporting/ViewPage) doesn't go stale until a manual refresh.
// landr-parv fixed BookingDetailSheet; this helper makes the contract a
// single source of truth so CustomerDetailSheet + GeneralApprovals (and
// any future caller) can't drift again.
export function invalidateBookingCaches(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['bookings'] }),
    qc.invalidateQueries({ queryKey: ['views-bookings'] }),
  ]).then(() => undefined)
}

export async function fetchBookings(operatorId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BookingRow[]
}

export function customerDisplay(row: BookingRow): string {
  const c = row.customer
  if (!c) return '—'
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  return name || c.email || '—'
}

export function productDisplay(row: BookingRow): string {
  const named = row.items
    .map((item) => item.products?.name)
    .filter((n): n is string => !!n)
  if (named.length === 0) return '—'
  if (named.length === 1) return named[0]
  return `${named[0]} +${named.length - 1}`
}

const numberFormatCache = new Map<string, Intl.NumberFormat>()
function numberFormatter(currency: string): Intl.NumberFormat {
  const key = currency || 'EUR'
  let fmt = numberFormatCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: key,
    })
    numberFormatCache.set(key, fmt)
  }
  return fmt
}

export function priceDisplay(row: BookingRow): string {
  const n =
    typeof row.gross_total === 'number'
      ? row.gross_total
      : Number(row.gross_total)
  if (!Number.isFinite(n)) return '—'
  return numberFormatter(row.currency || 'EUR').format(n)
}

// landr-f1s — date + time-of-day display. Hour cycle follows the operator's
// time_format_24h preference (passed by the caller via opts.hour12). Cached
// per cycle to match the previous module-level singleton.
// NOTE: Intl.DateTimeFormat forbids mixing dateStyle/timeStyle with the
// per-component options (year, hour, minute, …); we use the per-component
// form so hourCycle takes effect.
const _dateTimeFormatters: Record<'h12' | 'h23', Intl.DateTimeFormat> = {
  h12: new Intl.DateTimeFormat('en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h12',
  }),
  h23: new Intl.DateTimeFormat('en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }),
}

export function dateDisplay(iso: string, opts?: { hour12?: boolean }): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return _dateTimeFormatters[opts?.hour12 ? 'h12' : 'h23'].format(d)
}

// ----- Service date helpers (landr-04ec) ----------------------------------
// Used by BookingsTable's "Service date" column. The booking row itself
// stores no scheduled date — schedule lives on booking_products. For the
// table we surface the EARLIEST item.date_range_start; multi-item bookings
// with mixed dates collapse to the min (matches calendar / earliest-event
// semantics in bookingsToCalendarEvents above).

/** Earliest item.date_range_start across a booking's items, or null. */
export function earliestServiceDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    const start = item.date_range_start
    if (!start) continue
    if (best === null || start < best) best = start
  }
  return best
}

/** Date_range_end paired with the given start (so single-day bookings
 *  collapse to one date and multi-day ranges still render with an end). */
export function matchingServiceEnd(
  row: BookingRow,
  start: string,
): string | null {
  for (const item of row.items) {
    if (item.date_range_start === start) {
      return item.date_range_end
    }
  }
  return null
}

const _serviceDateFormatter = new Intl.DateTimeFormat('en-IE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function _formatServiceDay(iso: string): string {
  // ISO YYYY-MM-DD — anchor at UTC noon to keep weekday stable across TZs.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
  if (Number.isNaN(date.getTime())) return iso
  return _serviceDateFormatter.format(date)
}

/** "Tue 8 Jul" (single day) or "Tue 8 Jul – Sat 12 Jul" (range). */
export function formatServiceDateRange(
  start: string,
  end: string | null,
): string {
  const s = _formatServiceDay(start)
  if (!end || end === start) return s
  return `${s} – ${_formatServiceDay(end)}`
}

// ----- Calendar helpers --------------------------------------------------
// The bookings table itself stores no scheduled timestamp; the schedule
// lives on booking_products (date_range_start / date_range_end /
// selected_days). For the calendar we surface ONE event per booking using
// the earliest item with a date_range_start. If no item has scheduling
// info we fall back to created_at (so the booking still appears).

export type BookingCalendarEvent = {
  id: string
  bookingId: string
  itemId: string | null
  title: string
  start: string
  end: string | null
  allDay: boolean
  state: BookingSemanticState
  productName: string | null
  customerName: string
  raw: BookingRow
}

function earliestScheduledItem(row: BookingRow): BookingProduct | null {
  let best: BookingProduct | null = null
  for (const item of row.items) {
    if (!item.date_range_start) continue
    if (!best || item.date_range_start < best.date_range_start!) {
      best = item
    }
  }
  return best
}

export function bookingsToCalendarEvents(
  rows: BookingRow[],
): BookingCalendarEvent[] {
  const out: BookingCalendarEvent[] = []
  for (const row of rows) {
    const item = earliestScheduledItem(row)
    if (item && item.date_range_start) {
      out.push({
        id: row.id,
        bookingId: row.id,
        itemId: item.id,
        title: `${customerDisplay(row)} — ${item.products?.name ?? productDisplay(row)}`,
        start: item.date_range_start,
        end: item.date_range_end,
        allDay: true,
        state: row.current_semantic_state,
        productName: item.products?.name ?? null,
        customerName: customerDisplay(row),
        raw: row,
      })
    } else {
      // No scheduling info — show on created_at so the booking is still
      // visible but flagged. allDay=false keeps it as a time-pinned event.
      out.push({
        id: row.id,
        bookingId: row.id,
        itemId: null,
        title: `${customerDisplay(row)} — ${productDisplay(row)}`,
        start: row.created_at,
        end: null,
        allDay: false,
        state: row.current_semantic_state,
        productName: null,
        customerName: customerDisplay(row),
        raw: row,
      })
    }
  }
  return out
}

// Color tokens (mapped to shadcn/ui theme tokens via CSS classes in
// BookingsCalendar.tsx). Returned as a string key the component maps to a
// className. Kept here so tests can assert against the mapping directly.
export function colorKeyForBooking(row: BookingRow): BookingSemanticState {
  return row.current_semantic_state
}

// Persist a calendar drag-to-reschedule. Writes the new start/end date
// to the booking_products row that we used to render the event. If the
// booking had no scheduled item, this is a no-op (callers should guard).
export async function rescheduleBookingItem(args: {
  itemId: string
  startDate: string // ISO date YYYY-MM-DD
  endDate: string | null // ISO date YYYY-MM-DD or null
}): Promise<void> {
  const payload: { date_range_start: string; date_range_end: string | null } = {
    date_range_start: args.startDate,
    date_range_end: args.endDate,
  }
  const { error } = await supabase
    .from('booking_products')
    .update(payload)
    .eq('id', args.itemId)
  if (error) throw new Error(error.message)
}

// Helper: format a Date back to YYYY-MM-DD for postgres `date` columns.
export function toDateOnlyIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ----- Past-booking helper (landr-qhi0) -----------------------------------
// A booking is "past" when its latest activity date is strictly before today.
// Activity date per item is max(date_range_end, last(selected_days[])); the
// booking-level activity date is the MAX across items. Bookings with NO
// dates at all (rare — direct stub bookings) are treated as future ("not
// past") so they never silently disappear from the operator's queue.
//
// All comparisons happen on ISO YYYY-MM-DD strings, which sort
// lexicographically. We anchor "today" in the operator's LOCAL timezone via
// toDateOnlyIso(new Date()) so the cut-off rolls over at the operator's
// midnight, not UTC midnight.

/** Latest activity date across a booking's items as YYYY-MM-DD, or null. */
function latestActivityDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    const end = item.date_range_end
    if (end && (best === null || end > best)) best = end
    const days = item.selected_days
    if (days && days.length > 0) {
      // selected_days[] is not guaranteed sorted — scan for max.
      for (const d of days) {
        if (d && (best === null || d > best)) best = d
      }
    }
  }
  return best
}

/**
 * True when the booking's latest activity date is strictly before `now`
 * (operator-local date). Bookings without any item-level dates are
 * treated as NOT past, so they remain visible by default.
 */
export function isPastBooking(row: BookingRow, now: Date = new Date()): boolean {
  const latest = latestActivityDate(row)
  if (!latest) return false
  return latest < toDateOnlyIso(now)
}

// ----- General approval queue ---------------------------------------------

/** Fetch all bookings awaiting_general_approval for an operator. */
export async function fetchPendingGeneralApprovals(
  operatorId: string,
): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .filter('current_stage.code', 'eq', 'awaiting_general_approval')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BookingRow[]
}

export type ApprovalDecision = 'approve' | 'reject'

/** POST /api/staff/bookings/{id}/approval with branch=general. */
export async function postGeneralApprovalDecision(args: {
  bookingId: string
  decision: ApprovalDecision
  notes?: string
}): Promise<void> {
  await postApprovalDecision({ ...args, branch: 'general' })
}

/** POST /api/staff/bookings/{id}/approval with branch=secondary
 *  (covers awaiting_hotel_approval — the "hotel confirmed → unblock" flow). */
export async function postHotelApprovalDecision(args: {
  bookingId: string
  decision: ApprovalDecision
  notes?: string
}): Promise<void> {
  await postApprovalDecision({ ...args, branch: 'secondary' })
}

async function postApprovalDecision(args: {
  bookingId: string
  branch: 'general' | 'secondary'
  decision: ApprovalDecision
  notes?: string
}): Promise<void> {
  await api<unknown>('POST', `/api/staff/bookings/${args.bookingId}/approval`, {
    branch: args.branch,
    decision: args.decision,
    notes: args.notes ?? null,
  })
}

// ----- Edit / cancel mutations --------------------------------------------

export type BookingPatch = {
  customer_contact_id?: string
}

export type BookingProductPatch = {
  date_range_start?: string | null
  date_range_end?: string | null
  selected_days?: string[]
  quantity?: number
}

/** PATCH /api/staff/bookings/{id} — booking-level fields. */
export async function patchBooking(
  bookingId: string,
  patch: BookingPatch,
): Promise<void> {
  await api<unknown>('PATCH', `/api/staff/bookings/${bookingId}`, patch)
}

/** PATCH /api/staff/bookings/{id}/products/{lineId} — re-runs pricing. */
export async function patchBookingProduct(
  bookingId: string,
  bookingProductId: string,
  patch: BookingProductPatch,
): Promise<void> {
  await api<unknown>(
    'PATCH',
    `/api/staff/bookings/${bookingId}/products/${bookingProductId}`,
    patch,
  )
}

/** DELETE /api/staff/bookings/{id} — soft-cancel with required reason. */
export async function cancelBooking(
  bookingId: string,
  reason: string,
): Promise<void> {
  // DELETE-with-body: the wrapper attaches Content-Type when a body is
  // present, so the FastAPI handler sees the JSON payload.
  await api<unknown>('DELETE', `/api/staff/bookings/${bookingId}`, { reason })
}

// ----- Approval-queue helpers (landr-aqn4) --------------------------------
// Pure derivations off BookingRow used by the Approvals page filters +
// table. Kept here (rather than in src/components/approvals) so the
// filter-match layer (src/lib/approvals-filter-match.ts) can import them
// without dragging React in.

export type ApprovalReasonBucket =
  | 'capacity_warning'
  | 'new_customer'
  | 'voucher_invalid'
  | 'manual_override'
  | 'other'

export const APPROVAL_REASON_BUCKETS: ReadonlyArray<ApprovalReasonBucket> = [
  'capacity_warning',
  'new_customer',
  'voucher_invalid',
  'manual_override',
  'other',
]

/** Map a single rule_kind to a reason bucket. Unknown / "other" rules
 *  fall through to `'other'` so the chip still surfaces them. */
function ruleKindBucket(kind: string | undefined): ApprovalReasonBucket {
  switch (kind) {
    case 'capacity_threshold':
    case 'capacity_percentage':
      return 'capacity_warning'
    case 'first_time_customer':
      return 'new_customer'
    case 'date_override':
    case 'product_override':
      return 'manual_override'
    default:
      return 'other'
  }
}

/** All reason buckets a booking lands in. A booking can hit multiple
 *  (e.g. capacity + first-time customer), so we return a Set. If the
 *  approval_trace declares a `voucher_invalid` flag (jsonb tolerates
 *  unknown keys; landr-api may add this later) it is added too. */
export function approvalReasonsOf(row: BookingRow): Set<ApprovalReasonBucket> {
  const out = new Set<ApprovalReasonBucket>()
  const trace = row.approval_trace
  if (!trace) {
    out.add('other')
    return out
  }
  for (const rule of trace.applied_rules ?? []) {
    out.add(ruleKindBucket(rule.rule_kind))
  }
  // Tolerated freeform flags. Today the FastAPI router doesn't emit
  // `voucher_invalid`, but the column is jsonb — the bucket is documented
  // in the bd ticket and we let it light up if/when the router adds it.
  if ((trace as Record<string, unknown>).voucher_invalid === true) {
    out.add('voucher_invalid')
  }
  if (out.size === 0) out.add('other')
  return out
}

/** Was this booking flagged as a first-time customer? Derived from the
 *  `first_time_customer` rule firing in approval_trace.applied_rules.
 *  When the trace is missing we default to "returning" (treat older
 *  bookings as returning rather than mislabel them new). */
export function isNewCustomer(row: BookingRow): boolean {
  for (const rule of row.approval_trace?.applied_rules ?? []) {
    if (rule.rule_kind === 'first_time_customer') return true
  }
  return false
}

/** Earliest activity date across the booking's items. Considers both
 *  date_range_start AND the first entry in selected_days (for products
 *  that schedule via day-picker rather than a contiguous range). Returns
 *  an ISO 'YYYY-MM-DD' string or null. */
export function firstActivityDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    const candidates: string[] = []
    if (item.date_range_start) candidates.push(item.date_range_start)
    if (item.selected_days && item.selected_days.length > 0) {
      // selected_days come unsorted from the DB; sort defensively.
      const sorted = [...item.selected_days].sort()
      candidates.push(sorted[0])
    }
    for (const c of candidates) {
      if (best === null || c < best) best = c
    }
  }
  return best
}

export type UrgencyBucket = 'urgent' | 'soon' | 'later' | 'unknown'

export const URGENCY_BUCKETS: ReadonlyArray<UrgencyBucket> = [
  'urgent',
  'soon',
  'later',
  'unknown',
]

/** Bucket the booking by how soon its activity date falls.
 *  ≤3 days = urgent, 4-14 = soon, 15+ = later, no activity date = unknown. */
export function urgencyBucketOf(
  row: BookingRow,
  now: Date = new Date(),
): UrgencyBucket {
  const iso = firstActivityDate(row)
  if (!iso) return 'unknown'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return 'unknown'
  const [, y, mo, d] = m
  const activity = Date.UTC(Number(y), Number(mo) - 1, Number(d))
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const diffDays = Math.floor((activity - today) / 86400000)
  if (diffDays <= 3) return 'urgent'
  if (diffDays <= 14) return 'soon'
  return 'later'
}

export type PriceBucket = 'low' | 'mid' | 'high'

export const PRICE_BUCKETS: ReadonlyArray<PriceBucket> = ['low', 'mid', 'high']

/** Bucket the booking's gross_total: <100 = low, 100-500 = mid, >500 = high. */
export function priceBucketOf(row: BookingRow): PriceBucket {
  const n =
    typeof row.gross_total === 'number'
      ? row.gross_total
      : Number(row.gross_total)
  if (!Number.isFinite(n) || n < 100) return 'low'
  if (n <= 500) return 'mid'
  return 'high'
}

// landr-qmdo — Approvals page "Awaiting" dimension. The booking_lifecycle
// stages.code column is operator-customisable free-text, but the Approvals
// queue only surfaces rows in one of three canonical states. We collapse
// the raw code into a small enum so the filter chip stays stable across
// operator-renamed stages (anything outside the three known codes lands
// in null and is filtered out of the dimension).
export type ApprovalStage = 'general' | 'secondary' | 'hotel'

export const APPROVAL_STAGE_BUCKETS: ReadonlyArray<ApprovalStage> = [
  'general',
  'secondary',
  'hotel',
]

/** Bucket the booking's current_stage.code into the three Approvals
 *  stages. Returns null when the code doesn't match any known stage
 *  (caller decides whether to show or hide such rows; the Approvals page
 *  itself only ever queries `awaiting_general_approval` today, so this
 *  mostly stays in the `general` bucket). */
export function stageOf(row: BookingRow): ApprovalStage | null {
  const code = row.current_stage?.code
  switch (code) {
    case 'awaiting_general_approval':
      return 'general'
    case 'awaiting_secondary_approval':
      return 'secondary'
    case 'awaiting_hotel_approval':
      return 'hotel'
    default:
      return null
  }
}

/** Format the firstActivityDate as 'Tue 8 Jul' (or null when unscheduled). */
export function activityDateDisplay(row: BookingRow): string | null {
  const iso = firstActivityDate(row)
  if (!iso) return null
  return _formatServiceDay(iso)
}

// --------------------------------------------------------------------------

/** Patch a customer contact directly (RLS-gated; supabase write).
 *  Used by the Bookings detail Sheet to keep payer info in sync. */
export async function patchCustomerContact(
  contactId: string,
  patch: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    phone?: string | null
  },
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', contactId)
  if (error) throw new Error(error.message)
}

