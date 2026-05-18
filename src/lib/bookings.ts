import { supabase } from '@/lib/supabase'

export type BookingSemanticState =
  | 'pending'
  | 'confirmed'
  | 'finalised'
  | 'cancelled'
  | 'no_show'

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
  gross_total: number | string
  currency: string
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
  items: BookingItem[]
}

const SELECT = `
  id,
  created_at,
  current_semantic_state,
  gross_total,
  currency,
  customer:contacts!inner ( id, first_name, last_name, email ),
  items:booking_products ( id, date_range_start, date_range_end, selected_days, products ( id, name ) )
`

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
