// landr-7dya.10 / landr-7dya.13 — staff capabilities feature-detection.
//
// The ops feedback inbox is becoming a first-class app-view with a top-level
// mode switch (single-operator · view-as-operator · ticket-system). The set of
// modes a staff user may enter is, longer term, governed by a server-computed
// capability block fetched from `GET /api/landr-staff/me/capabilities`
// (landr-api PR #171). That endpoint MAY NOT BE MERGED YET, so this module
// FEATURE-DETECTS it and DEGRADES GRACEFULLY:
//
//   • Endpoint present (200) → use the server's capability block verbatim.
//   • Endpoint absent (404 / "Not Found") OR any transport error → fall back to
//     the conservative client default: a Landr-staff user gets every mode
//     (matching today's behaviour where staff see all staff tooling), a
//     non-staff user gets none of the staff-only modes.
//
// REAL API SHAPE (landr-api PR #171, GET /api/landr-staff/me/capabilities):
//   { is_staff, is_owner, can_triage_tickets, can_admin_roles,
//     can_view_as_operator, roles }
//
// CLIENT-SIDE DERIVED FLAGS (not returned by the API verbatim):
//   canUseTicketSystem(caps) = caps.is_staff || caps.can_triage_tickets
//
// This module is intentionally dependency-light — the caller (app-mode-context.tsx)
// owns the React/query wiring + the is_landr_staff input. Keeping the fetch +
// shape here keeps app-mode-context.tsx focused on mode state.

import { api } from '@/lib/api-client'

/**
 * The capability block returned by GET /api/landr-staff/me/capabilities
 * (landr-api PR #171). Unknown extra fields are ignored, and missing fields
 * fall back to the conservative default below.
 */
export type StaffCapabilities = {
  /** True when the session belongs to a Landr staff user. */
  is_staff: boolean
  /** True when the user is a Landr owner (super-staff). */
  is_owner: boolean
  /** May triage/respond to support tickets. */
  can_triage_tickets: boolean
  /** May manage roles for other users. */
  can_admin_roles: boolean
  /** May enter "view as operator" preview (mode 2). Deep behaviour: .13. */
  can_view_as_operator: boolean
  /** Assigned role slugs for UI display. */
  roles: string[]
}

/**
 * Derived convenience: true when the staff user may enter the ticket-system
 * workspace. Full staff (`is_staff`) or explicit triage permission covers this.
 */
export function canUseTicketSystem(caps: StaffCapabilities): boolean {
  return caps.is_staff || caps.can_triage_tickets
}

/**
 * Conservative client-side fallback used when the capabilities endpoint is not
 * yet deployed (landr-7dya.14 unmerged) or the request fails. Landr staff keep
 * full access to the staff-only modes (today's behaviour); non-staff get none.
 */
export function fallbackCapabilities(isLandrStaff: boolean): StaffCapabilities {
  return {
    is_staff: isLandrStaff,
    is_owner: false,
    can_triage_tickets: isLandrStaff,
    can_admin_roles: false,
    can_view_as_operator: isLandrStaff,
    roles: [],
  }
}

/** Raw partial shape as the endpoint may return it — a subset of StaffCapabilities. */
type RawCapabilities = Partial<StaffCapabilities>

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
    const raw = await api<RawCapabilities | null>(
      'GET',
      '/api/landr-staff/me/capabilities',
    )
    if (!raw || typeof raw !== 'object') return fallbackCapabilities(true)
    const fb = fallbackCapabilities(true)
    return {
      is_staff:
        typeof raw.is_staff === 'boolean' ? raw.is_staff : fb.is_staff,
      is_owner:
        typeof raw.is_owner === 'boolean' ? raw.is_owner : fb.is_owner,
      can_triage_tickets:
        typeof raw.can_triage_tickets === 'boolean'
          ? raw.can_triage_tickets
          : fb.can_triage_tickets,
      can_admin_roles:
        typeof raw.can_admin_roles === 'boolean'
          ? raw.can_admin_roles
          : fb.can_admin_roles,
      can_view_as_operator:
        typeof raw.can_view_as_operator === 'boolean'
          ? raw.can_view_as_operator
          : fb.can_view_as_operator,
      roles: Array.isArray(raw.roles) ? raw.roles : fb.roles,
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
