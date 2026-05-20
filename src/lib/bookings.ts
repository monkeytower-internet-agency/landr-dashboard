import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api-client'

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

// Mirrors public.product_kind enum (landr-glx product_kinds_refactor).
export type ProductKind =
  | 'service'
  | 'digital_good'
  | 'physical_good'
  | 'gift_card'

// Mirrors public.service_time_shape enum. NULL for non-service products.
export type ServiceTimeShape =
  | 'single_date'
  | 'days_range'
  | 'fixed_window'
  | 'time_slot'

export type BookingItem = {
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

export type BookingRow = {
  id: string
  created_at: string
  current_semantic_state: BookingSemanticState
  current_stage: { code: string } | null
  gross_total: number | string
  currency: string
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
  } | null
  items: BookingItem[]
  participants?: BookingParticipant[]
}

const SELECT = `
  id,
  created_at,
  current_semantic_state,
  current_stage:booking_lifecycle_stages!current_stage_id ( code ),
  gross_total,
  currency,
  customer:contacts!inner ( id, first_name, last_name, email, phone ),
  items:booking_products ( id, date_range_start, date_range_end, selected_days, products ( id, name, product_kind, service_time_shape ) ),
  participants:booking_participants ( id, pickup_location:locations!pickup_location_id ( id, name ) )
`

/** Convenience helper — falls back to null safely. */
export function stageCode(row: BookingRow): string | null {
  return row.current_stage?.code ?? null
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

function earliestScheduledItem(row: BookingRow): BookingItem | null {
  let best: BookingItem | null = null
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

