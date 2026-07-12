// landr-sr69 — "Daily roster": show ALL flying participants per day in the
// bookings calendar (default behaviour), not just the booker.
//
// WHY direct Supabase, no RPC
// ---------------------------
// `booking_participants` + `contacts` are operator-scoped via apply_tenant_rls
// (the same RLS that lib/booking-participants.ts already reads through). The
// dashboard's Supabase client carries the staff JWT, so a single REST select
// joining booking_participants → contacts, filtered by operator_id, returns
// exactly this operator's roster — no SECURITY-DEFINER RPC and no landr-api
// migration needed. We fetch the operator's flying participants in ONE query
// (keyed on operator), then derive the per-day roster client-side from the
// bookings already loaded for the calendar (which carry items.selected_days).
// That avoids the N+1 of fetching participants per booking.
//
// FLYING semantics
// ----------------
// "Flying participant" = a booking_participants row that is NOT a companion:
//   is_guiding = true  → flying (service recipient in the activity)
//   is_guiding = NULL  → flying (legacy rows pre-date the column; backfilled
//                        true at the DB level, defaulted true here)
//   is_guiding = false → companion (guest / separate_guiding) → EXCLUDED
// Companions sleep in the room but don't fly; they never appear on the roster.
//
// DAY semantics
// -------------
// A participant flies on the booking's ACTIVITY selected_days — the union of
// selected_days across the booking's non-hotel products. selected_days is a
// gapped set (a pilot may fly Mon + Wed but not Tue), so we roster each
// selected day independently, NOT the contiguous stay window. Hotel_room
// products carry the accommodation stay span and are excluded from flying
// days. If a booking has activity products but none carry selected_days (rare
// — e.g. a single_date service), we fall back to that product's
// date_range_start so the booking still appears on its day.

import { supabase } from '@/lib/supabase'
import type { BookingRow, BookingProduct } from '@/lib/bookings'

/** One flying participant on one day of one booking. */
export type DayRosterEntry = {
  /** Participant display name (contact name → email → em-dash fallback). */
  participantName: string
  /** Booking uuid — opens the BookingDetailSheet via the calendar's
   *  existing onEventClick(row) behaviour. */
  bookingId: string
  /** Short human ref shown next to the name, matching the
   *  `#${id.slice(0,8)}` convention used by BookingDetailSheet. */
  bookingRef: string
}

/** Per-booking flying-participant names, keyed by booking_id. */
export type FlyingParticipantsByBooking = Map<string, string[]>

type RawParticipantRow = {
  booking_id: string
  is_guiding: boolean | null
  companion_kind: 'guest' | 'separate_guiding' | null
  contact: {
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

const SELECT = `
  booking_id,
  is_guiding,
  companion_kind,
  contact:contacts!contact_id ( first_name, last_name, email )
`

/** Display name for a participant contact. Mirrors customerDisplay() /
 *  participantDisplayName(): `${first} ${last}` → email → em-dash. */
export function participantContactName(
  contact:
    | { first_name: string | null; last_name: string | null; email?: string | null }
    | null
    | undefined,
): string {
  if (!contact) return '—'
  const name = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (name) return name
  if (contact.email && contact.email.trim()) return contact.email
  return '—'
}

/** True when a participant row counts as flying (not a companion). */
export function isFlyingParticipant(row: {
  is_guiding?: boolean | null
}): boolean {
  // Legacy NULL rows pre-date the is_guiding column and are flying by
  // backfill; only an explicit `false` marks a companion.
  return row.is_guiding !== false
}

/**
 * Fetch this operator's flying participants in ONE query, grouped by booking.
 *
 * Companions (is_guiding=false) are dropped. The result maps booking_id →
 * ordered list of participant names (insertion order from created_at). A
 * booking with no flying participants simply has no entry in the map.
 */
export async function fetchFlyingParticipants(
  operatorId: string,
): Promise<FlyingParticipantsByBooking> {
  const { data, error } = await supabase
    .from('booking_participants')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  const byBooking: FlyingParticipantsByBooking = new Map()
  for (const raw of (data ?? []) as unknown as RawParticipantRow[]) {
    if (!isFlyingParticipant(raw)) continue
    const name = participantContactName(raw.contact)
    const existing = byBooking.get(raw.booking_id)
    if (existing) existing.push(name)
    else byBooking.set(raw.booking_id, [name])
  }
  return byBooking
}

/** A booking_product is an activity (flying) line iff it is NOT a hotel room.
 *  Hotel rooms carry the accommodation stay window, not flying days. */
function isActivityProduct(item: BookingProduct): boolean {
  return item.products?.product_kind !== 'hotel_room'
}

/** The set of ISO 'YYYY-MM-DD' days a booking flies on — the union of
 *  selected_days across its activity products. Falls back to each activity
 *  product's date_range_start when selected_days is empty/null so the booking
 *  still rosters on at least its start day. Returns a sorted, de-duped array. */
export function flyingDaysForBooking(row: BookingRow): string[] {
  const days = new Set<string>()
  for (const item of row.items) {
    if (!isActivityProduct(item)) continue
    const selected = item.selected_days
    if (selected && selected.length > 0) {
      for (const d of selected) {
        if (d) days.add(d.slice(0, 10))
      }
    } else if (item.date_range_start) {
      // No day-picker data on this line — roster on its start day so the
      // booking is still visible.
      days.add(item.date_range_start.slice(0, 10))
    }
  }
  return Array.from(days).sort()
}

/** Short booking ref — matches BookingDetailSheet's `#${id.slice(0,8)}`. */
export function bookingRef(bookingId: string): string {
  return `#${bookingId.slice(0, 8)}`
}

/**
 * Build the per-day flying roster.
 *
 * For each booking, for each of its flying days, emit one DayRosterEntry per
 * flying participant. Days come from the booking's activity selected_days
 * (gapped selections honoured); participant names come from
 * `participantsByBooking`. A multi-booking day naturally accumulates entries
 * from every booking that flies that day.
 *
 * Bookings with no flying participants contribute nothing (a roster of
 * companions-only is empty by design). The returned map is keyed by ISO
 * 'YYYY-MM-DD'; entries within a day preserve booking order then participant
 * order.
 */
export function buildDayRoster(
  rows: BookingRow[],
  participantsByBooking: FlyingParticipantsByBooking,
): Map<string, DayRosterEntry[]> {
  const byDay = new Map<string, DayRosterEntry[]>()
  for (const row of rows) {
    const names = participantsByBooking.get(row.id)
    if (!names || names.length === 0) continue
    const days = flyingDaysForBooking(row)
    if (days.length === 0) continue
    const ref = bookingRef(row.id)
    for (const day of days) {
      let bucket = byDay.get(day)
      if (!bucket) {
        bucket = []
        byDay.set(day, bucket)
      }
      for (const participantName of names) {
        bucket.push({ participantName, bookingId: row.id, bookingRef: ref })
      }
    }
  }
  return byDay
}

/**
 * Group a day's roster entries by booking, preserving booking encounter order
 * and participant order within each booking. Used by the day-roster panel to
 * render "names grouped by booking, each linking into the detail sheet".
 */
export type RosterBookingGroup = {
  bookingId: string
  bookingRef: string
  participantNames: string[]
}

export function groupRosterByBooking(
  entries: DayRosterEntry[],
): RosterBookingGroup[] {
  const order: string[] = []
  const byId = new Map<string, RosterBookingGroup>()
  for (const e of entries) {
    let group = byId.get(e.bookingId)
    if (!group) {
      group = {
        bookingId: e.bookingId,
        bookingRef: e.bookingRef,
        participantNames: [],
      }
      byId.set(e.bookingId, group)
      order.push(e.bookingId)
    }
    group.participantNames.push(e.participantName)
  }
  return order.map((id) => byId.get(id)!)
}
