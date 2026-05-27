// landr-7dya.10 — staff capabilities feature-detection.
//
// The ops feedback inbox is becoming a first-class app-view with a top-level
// mode switch (single-operator · view-as-operator · ticket-system). The set of
// modes a staff user may enter is, longer term, governed by a server-computed
// capability block fetched from `GET /api/landr-staff/me/capabilities`
// (delivered by landr-7dya.14). That endpoint MAY NOT BE MERGED YET, so this
// module FEATURE-DETECTS it and DEGRADES GRACEFULLY:
//
//   • Endpoint present (200) → use the server's capability block verbatim.
//   • Endpoint absent (404 / "Not Found") OR any transport error → fall back to
//     the conservative client default: a Landr-staff user gets every mode
//     (matching today's behaviour where staff see all staff tooling), a
//     non-staff user gets none of the staff-only modes.
//
// This module is intentionally dependency-light — the caller (app-mode.tsx)
// owns the React/query wiring + the is_landr_staff input. Keeping the fetch +
// shape here keeps app-mode.tsx focused on mode state.

import { api } from '@/lib/api-client'

/**
 * The capability block. Each flag gates one top-level app mode. Designed to be
 * forward-compatible with landr-7dya.14: the endpoint returns this exact shape;
 * unknown extra fields are ignored, and missing fields fall back to the
 * conservative default below.
 */
export type StaffCapabilities = {
  /** May enter the full-screen ticket-system workspace (mode 3). */
  can_use_ticket_system: boolean
  /** May enter "view as operator" preview (mode 2). Deep behaviour: .13. */
  can_view_as_operator: boolean
}

/**
 * Conservative client-side fallback used when the capabilities endpoint is not
 * yet deployed (landr-7dya.14 unmerged) or the request fails. Landr staff keep
 * full access to the staff-only modes (today's behaviour); non-staff get none.
 */
export function fallbackCapabilities(isLandrStaff: boolean): StaffCapabilities {
  return {
    can_use_ticket_system: isLandrStaff,
    can_view_as_operator: isLandrStaff,
  }
}

/** True when an error from api() looks like a missing endpoint (404). The api()
 *  wrapper throws `Error` with the server `detail` string, or "HTTP 404" when
 *  there is no JSON body — accept either shape so a bare 404 also degrades. */
function looksLikeMissingEndpoint(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('method not allowed') // 405 if a stub route exists w/o GET
  )
}

/**
 * Fetch the staff capability block, feature-detecting the endpoint. Never
 * rejects on a missing/erroring endpoint — always resolves to a usable block
 * (server value when available, conservative fallback otherwise). The caller
 * passes the already-resolved is_landr_staff flag so the fallback matches the
 * session's staff status.
 */
export async function fetchStaffCapabilities(
  isLandrStaff: boolean,
): Promise<StaffCapabilities> {
  // Non-staff never have staff capabilities — short-circuit without a request
  // (the endpoint would 403 anyway, and we must not surface that as an error).
  if (!isLandrStaff) return fallbackCapabilities(false)

  try {
    const raw = await api<Partial<StaffCapabilities> | null>(
      'GET',
      '/api/landr-staff/me/capabilities',
    )
    if (!raw || typeof raw !== 'object') return fallbackCapabilities(true)
    const fb = fallbackCapabilities(true)
    return {
      can_use_ticket_system:
        typeof raw.can_use_ticket_system === 'boolean'
          ? raw.can_use_ticket_system
          : fb.can_use_ticket_system,
      can_view_as_operator:
        typeof raw.can_view_as_operator === 'boolean'
          ? raw.can_view_as_operator
          : fb.can_view_as_operator,
    }
  } catch (err) {
    // Missing endpoint (.14 unmerged) OR any transport error → degrade to the
    // conservative staff default. We deliberately swallow the error: this is a
    // visibility decision, not a hard dependency.
    if (looksLikeMissingEndpoint(err)) return fallbackCapabilities(true)
    // Other errors (network blip, 500) also degrade — a staff user should never
    // be locked out of their primary workspace by a flaky capabilities probe.
    return fallbackCapabilities(true)
  }
}
