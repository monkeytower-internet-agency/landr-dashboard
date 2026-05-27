// landr-7dya.10 — top-level app-mode model (pure, no JSX).
//
// ADR 0005 makes the staff feedback inbox a FIRST-CLASS APP-VIEW rather than a
// sidebar item inside the operator-scoped dashboard. There are three top-level
// modes a Landr-staff user can be in:
//
//   1. 'operator'  — the normal operator-scoped dashboard (default; the only
//                    mode a non-staff user ever has). Owns the AppShell chrome
//                    (sidebar + operator topbar).
//   2. 'view-as'   — staff PREVIEW of what a SaaS customer sees. This is a
//                    VISIBILITY variant of the operator chrome (it reuses the
//                    existing view-as mechanic in operator.tsx — the session
//                    never changes), so it shares mode 1's chrome. The deep
//                    behaviour is landr-7dya.13; here we only wire the switch +
//                    entry point.
//   3. 'tickets'   — the full-screen ticket-system workspace (its own chrome).
//                    Switching in REPLACES the operator chrome with a dedicated
//                    ticket workspace surface (board · planning · inbox).
//
// Modes 1 and 2 both render the operator AppShell — mode 2 is mode 1 with
// `viewAsActive` on. Mode 3 is the genuinely different chrome. The mode is
// DERIVED from the URL (the ticket workspace lives under a dedicated path) +
// the operator view-as flag, so it survives reload and is deep-linkable; there
// is no separate persisted "mode" state to drift out of sync with the route.

/** The three top-level app modes (see file header). */
export type AppMode = 'operator' | 'view-as' | 'tickets'

/**
 * Path prefix that owns the full-screen ticket-system app-view. Kept distinct
 * from the operator-chrome `/tickets` board route (which stays working as a
 * sidebar destination inside the operator dashboard) so the two chromes never
 * collide. The workspace sub-surfaces hang off this prefix:
 *   <prefix>            → inbox (default surface — ADR 0005 primary workspace)
 *   <prefix>/board      → kanban board
 *   <prefix>/planning   → MoSCoW release planning
 */
export const TICKET_SYSTEM_PATH = '/staff/tickets'

/** True when a pathname is inside the ticket-system app-view. */
export function isTicketSystemPath(pathname: string): boolean {
  return (
    pathname === TICKET_SYSTEM_PATH ||
    pathname.startsWith(`${TICKET_SYSTEM_PATH}/`)
  )
}

/**
 * Derive the current top-level mode from the route + the operator view-as flag.
 * The ticket-system path always wins (it owns the chrome); otherwise view-as
 * vs. plain operator is decided by the operator provider's flag.
 */
export function deriveAppMode(
  pathname: string,
  viewAsActive: boolean,
): AppMode {
  if (isTicketSystemPath(pathname)) return 'tickets'
  if (viewAsActive) return 'view-as'
  return 'operator'
}

/** The ticket-system workspace sub-surfaces, in tab order. */
export type TicketSurfaceKey = 'inbox' | 'board' | 'planning'

export type TicketSurface = {
  key: TicketSurfaceKey
  /** Absolute path of the surface within the app-view. */
  path: string
  /** Whether the surface is matched on exact equality (vs. prefix). */
  exact: boolean
}

export const TICKET_SURFACES: ReadonlyArray<TicketSurface> = [
  // Inbox is the default surface (index route) — ADR 0005 makes it the staff's
  // primary workspace, so it owns the bare prefix.
  { key: 'inbox', path: TICKET_SYSTEM_PATH, exact: true },
  { key: 'board', path: `${TICKET_SYSTEM_PATH}/board`, exact: false },
  { key: 'planning', path: `${TICKET_SYSTEM_PATH}/planning`, exact: false },
]

/** Which surface a pathname maps to (null when outside the app-view). */
export function surfaceForPath(pathname: string): TicketSurfaceKey | null {
  if (!isTicketSystemPath(pathname)) return null
  // Longest-prefix-first so /board and /planning win over the bare inbox path.
  if (pathname.startsWith(`${TICKET_SYSTEM_PATH}/board`)) return 'board'
  if (pathname.startsWith(`${TICKET_SYSTEM_PATH}/planning`)) return 'planning'
  return 'inbox'
}
