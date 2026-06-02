// landr-z4lj — service-recipient roster for a booking.
//
// Read-only fetch for the Participants tab inside BookingDetailSheet. The
// booking_participants table is operator-scoped via RLS (apply_tenant_rls),
// so we hit Supabase REST directly — there's no FastAPI write here, just a
// row read with embedded contact + service_role lookups. The booker
// (bookings.customer_contact_id) is a separate axis; participants may or
// may not overlap with the booker by data, never by schema.
//
// Schema reminders (landr-api migrations 20260512163050 service_roles +
// 20260512220357 booking_participants + 20260521120000 participant phone):
//   * booking_participants.contact_id  → contacts (first_name, last_name,
//                                                  email, phone,
//                                                  do_not_contact)
//   * booking_participants.service_role_id → service_roles (code, label)
//   * Per-participant phone lives on contacts.phone (landr-zaan) — the
//     widget upserts it on every submit with COALESCE-protect-existing.

import { supabase } from '@/lib/supabase'

export type BookingParticipantContact = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  // landr-h46a — when true, EmailSenderService suppresses non-transactional
  // outbound emails to this contact. Surfaced here so the roster can flag
  // it with a small "no marketing" badge.
  do_not_contact: boolean
}

export type BookingParticipantServiceRole = {
  id: string
  code: string
  label: string
}

export type BookingParticipantRow = {
  id: string
  booking_id: string
  notes: string | null
  contact: BookingParticipantContact | null
  service_role: BookingParticipantServiceRole | null
  // landr-wv0m: distinguish guiding participants from non-guiding companions.
  // is_guiding=true (or null for legacy rows) → guiding participant.
  // is_guiding=false → companion row; companion_kind holds the sub-type.
  is_guiding: boolean | null
  // 'guest' = not doing the activity; 'separate_guiding' = doing the activity
  // but paying for their own guiding separately. NULL for guiding participants.
  companion_kind: 'guest' | 'separate_guiding' | null
}

// The Supabase select shape — flattened by `fetchBookingParticipants` into
// the BookingParticipantRow type above. PostgREST returns the embedded FK
// rows under their relation alias (`contact:contacts!contact_id ( … )`).
// landr-wv0m: is_guiding + companion_kind added to distinguish self-paying
// activity participants (separate_guiding) from non-participating guests.
const SELECT = `
  id,
  booking_id,
  notes,
  is_guiding,
  companion_kind,
  contact:contacts!contact_id ( id, first_name, last_name, email, phone, do_not_contact ),
  service_role:service_roles!service_role_id ( id, code, label )
`

type RawRow = {
  id: string
  booking_id: string
  notes: string | null
  is_guiding: boolean | null
  companion_kind: 'guest' | 'separate_guiding' | null
  contact: BookingParticipantContact | null
  service_role: BookingParticipantServiceRole | null
}

export async function fetchBookingParticipants(
  bookingId: string,
): Promise<BookingParticipantRow[]> {
  const { data, error } = await supabase
    .from('booking_participants')
    .select(SELECT)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as RawRow[]).map((r) => ({
    id: r.id,
    booking_id: r.booking_id,
    notes: r.notes,
    // landr-wv0m: default true for legacy rows that pre-date the column.
    is_guiding: r.is_guiding ?? true,
    companion_kind: r.companion_kind ?? null,
    contact: r.contact ?? null,
    service_role: r.service_role ?? null,
  }))
}

/** Human-readable name for a participant row. Mirrors customerDisplay() in
 *  lib/bookings.ts: prefers `${first} ${last}`, falls back to email, then
 *  to the em-dash placeholder. Exported so the component and tests share
 *  one source of truth. */
export function participantDisplayName(row: BookingParticipantRow): string {
  const c = row.contact
  if (!c) return '—'
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  if (c.email && c.email.trim()) return c.email
  return '—'
}

/** Display label for the service role or companion kind.
 *
 * landr-wv0m: non-guiding companions (is_guiding=false) have no
 * service_role. For them we derive a human-readable label from companion_kind:
 *   - 'separate_guiding' → "Joining (separate guiding)" — clearly a
 *     self-paying activity participant, distinct from a plain guest.
 *   - 'guest' (or null/default) → "Guest"
 *
 * Guiding participants continue to use their service_role label → code
 * chain as before (defence-in-depth em-dash for missing roles).
 */
export function participantRoleLabel(row: BookingParticipantRow): string {
  // landr-wv0m: companions have no service_role — label from companion_kind.
  if (row.is_guiding === false) {
    if (row.companion_kind === 'separate_guiding') {
      return 'Joining (separate guiding)'
    }
    return 'Guest'
  }
  const r = row.service_role
  if (!r) return '—'
  if (r.label && r.label.trim()) return r.label
  if (r.code && r.code.trim()) return r.code
  return '—'
}
