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

export type BookingItem = {
  id: string
  date_range_start: string | null
  date_range_end: string | null
  selected_days: string[] | null
  products: { id: string; name: string } | null
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
}

const SELECT = `
  id,
  created_at,
  current_semantic_state,
  current_stage:booking_lifecycle_stages!current_stage_id ( code ),
  gross_total,
  currency,
  customer:contacts!inner ( id, first_name, last_name, email, phone ),
  items:booking_products ( id, date_range_start, date_range_end, selected_days, products ( id, name ) )
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

const dateFormatter = new Intl.DateTimeFormat('en-IE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
export function dateDisplay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateFormatter.format(d)
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

