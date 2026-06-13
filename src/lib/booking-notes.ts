// landr-9qo1 — operator-internal notes on bookings.
//
// Staff-only free-text notes attached to a booking. Never sent to the
// customer. The API stamps the author from the resolved staff
// membership, so we don't pass author_user_id from the client — only
// the note content. The response carries flattened author_display_name
// + author_email (from a PostgREST FK join) so the list renderer doesn't
// need a second round-trip per row.

import { api } from '@/lib/api-client'

// Shared TanStack Query key for a booking's notes list. Exported so the
// BookingNotes panel and the BookingDetailSheet "Notes" tab badge read the
// SAME cache entry (identical key ⇒ React Query dedupes the fetch and the
// badge updates live after any create/delete).
export const BOOKING_NOTES_QUERY_KEY = 'booking-notes'
export function bookingNotesQueryKey(operatorId: string, bookingId: string) {
  return [BOOKING_NOTES_QUERY_KEY, operatorId, bookingId] as const
}

export type BookingNote = {
  id: string
  booking_id: string
  operator_id: string
  author_user_id: string | null
  author_display_name: string | null
  author_email: string | null
  content: string
  created_at: string
}

export type CreateBookingNotePayload = {
  content: string
}

export async function listBookingNotes(
  operatorId: string,
  bookingId: string,
): Promise<BookingNote[]> {
  return api<BookingNote[]>(
    'GET',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/notes`,
  )
}

export async function createBookingNote(
  operatorId: string,
  bookingId: string,
  payload: CreateBookingNotePayload,
): Promise<BookingNote> {
  return api<BookingNote>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/notes`,
    payload,
  )
}

export async function deleteBookingNote(
  operatorId: string,
  bookingId: string,
  noteId: string,
): Promise<void> {
  await api<void>(
    'DELETE',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/notes/${noteId}`,
  )
}

// Human-readable author label for the list row. Prefers display_name,
// falls back to email, then to "(deleted user)" when the FK has been
// SET NULL (author_user_id NULL means the user was deleted).
export function authorLabel(note: BookingNote): string {
  if (note.author_display_name && note.author_display_name.trim()) {
    return note.author_display_name
  }
  if (note.author_email && note.author_email.trim()) {
    return note.author_email
  }
  return '(deleted user)'
}
