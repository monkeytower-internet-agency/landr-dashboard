// landr-aoak.3 — staff booking-session mint API client.
//
// Thin wrapper over `api()` for POST
// /api/staff/operators/{operatorId}/booking-sessions (landr-aoak.1 [S1]).
// Mints a short-lived (<=30 min) server-SIGNED staff session token bound to
// {operator_id, user_id, powers, channel:'staff', exp}. The dashboard hands
// this token to the embedded booking widget (in staff/agent mode) via an
// origin-checked `landr:staff-init` postMessage — keeping the token out of
// the iframe URL / browser history.
//
// Auth: the operator-staff Supabase JWT (the shared `api()` helper attaches
// the bearer). The endpoint 403s if the caller is not a member of {operator}.
//
// Response shape (aoak.1 handoff [S1] 201):
//   { staff_session, operator_id, powers, expires_at }
// - `staff_session` is OPAQUE to the dashboard — pass it verbatim to the widget.
// - `503 { error: 'session_signing_unavailable' }` when OAUTH_STATE_SECRET is
//   unset on the server (the api() helper surfaces this as a thrown Error).

import { api } from '@/lib/api-client'

/** Operator powers a minted staff session may carry (aoak.1 [S1]). */
export type StaffPower = 'force_book' | 'price_override' | 'skip_customer_email'

export type StaffBookingSession = {
  /** Opaque server-signed token: `<payload_b64url>.<sig_hex>`. */
  staff_session: string
  operator_id: string
  powers: StaffPower[]
  /** Unix epoch seconds at which the token expires (<=30 min from mint). */
  expires_at: number
}

/**
 * Mint a staff booking session for the given operator. Requires an
 * operator-staff JWT (attached by `api()`); 403 if the caller is not a member
 * of `operatorId`. Returns the opaque token + powers + expiry.
 */
export async function mintBookingSession(
  operatorId: string,
): Promise<StaffBookingSession> {
  return api<StaffBookingSession>(
    'POST',
    `/api/staff/operators/${operatorId}/booking-sessions`,
  )
}
