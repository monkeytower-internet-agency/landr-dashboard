// landr-eaqr — quick-capture booking create API client.
//
// Thin wrapper over `api()` for POST
// /api/staff/operators/{operatorId}/bookings/quick-create — backs the
// QuickCaptureFab Save handler. The endpoint returns { booking_id,
// contact_id }; the dashboard navigates to /bookings?open=<booking_id>
// so the existing landr-ne58 deep-link effect opens BookingDetailSheet
// for further detail (participants, addons, pricing overrides).
//
// Error shape (from landr-rgvc):
//   - 400 { detail: { error: "product_not_found" } } — product missing
//     or owned by a different operator.
//   - 409 { detail: { error: "drafted_stage_missing" } } — operator
//     has no 'drafted' lifecycle stage row.
// The shared `api()` helper unwraps `detail.error` strings into the
// thrown Error.message, so callers can match on the error code in the
// caught Error's message field.

import { api } from '@/lib/api-client'

export type QuickCreateBookingPayload = {
  customer_name: string
  customer_email: string
  product_id: string
  /** ISO date — YYYY-MM-DD. */
  date: string
}

export type QuickCreateBookingResult = {
  booking_id: string
  contact_id: string
}

export async function quickCreateBooking(
  operatorId: string,
  payload: QuickCreateBookingPayload,
): Promise<QuickCreateBookingResult> {
  return api<QuickCreateBookingResult>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/quick-create`,
    payload,
  )
}
