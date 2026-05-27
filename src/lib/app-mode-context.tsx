// landr-7dya.10 — React surface for the top-level app-mode switch.
//
// Provides the current mode (derived from the route + the operator view-as
// flag), the staff capability block (feature-detected, degrades gracefully —
// see staff-capabilities.ts), and the switch actions the mode-switcher UI
// calls. Lives ABOVE the chrome split so both the operator AppShell and the
// ticket-system shell can read it.
//
// Capability gating (landr-7dya.14 may be unmerged → DEGRADE GRACEFULLY):
//   • `canUseTicketSystem` / `canViewAsOperator` come from
//     GET /api/landr-staff/me/capabilities when present, else the conservative
//     staff fallback (staff = all modes, non-staff = none). The switch UI hides
//     a mode whose capability is false, so a non-staff user never sees modes
//     2/3 and the whole switcher collapses to nothing for them.

import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useEntitlements } from '@/lib/entitlements'
import { useOperator } from '@/lib/operator'
import {
  deriveAppMode,
  TICKET_SYSTEM_PATH,
  type AppMode,
} from '@/lib/app-mode'
import {
  fallbackCapabilities,
  fetchStaffCapabilities,
  type StaffCapabilities,
} from '@/lib/staff-capabilities'

type AppModeContextValue = {
  /** The current top-level mode (operator · view-as · tickets). */
  mode: AppMode
  /** Capability block (server when available, conservative fallback else). */
  capabilities: StaffCapabilities
  /** True while the capability probe is in flight (staff only). */
  capabilitiesLoading: boolean
  /** Whether the mode SWITCHER should render at all. Only staff with at least
   *  one staff-only capability get a switch; everyone else stays implicitly in
   *  the single operator mode with no chrome change. */
  showSwitcher: boolean
  /** Enter the plain operator dashboard (mode 1). Exits view-as if active and
   *  navigates out of the ticket-system app-view if inside it. */
  enterOperatorMode: () => void
  /** Enter the ticket-system workspace (mode 3). No-op without the capability. */
  enterTicketSystem: () => void
}

const AppModeContext = createContext<AppModeContextValue | undefined>(undefined)

export function AppModeProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isLandrStaff } = useEntitlements()
  const { viewAsActive, exitViewAs } = useOperator()

  // Feature-detect the staff capability endpoint. Disabled for non-staff (they
  // have no staff capabilities; the fetch short-circuits anyway). The query
  // never rejects — fetchStaffCapabilities resolves to a usable block even when
  // the endpoint is missing (landr-7dya.14 unmerged).
  const capabilitiesQuery = useQuery({
    queryKey: ['staff-capabilities', isLandrStaff],
    queryFn: () => fetchStaffCapabilities(isLandrStaff),
    enabled: isLandrStaff,
    staleTime: 1000 * 60 * 5,
  })

  const capabilities =
    capabilitiesQuery.data ?? fallbackCapabilities(isLandrStaff)

  const mode = deriveAppMode(pathname, viewAsActive)

  const enterOperatorMode = useCallback(() => {
    if (viewAsActive) exitViewAs()
    // If we're inside the ticket-system app-view, leave it back to the operator
    // dashboard home. Otherwise we're already on an operator-chrome route — stay
    // put (just dropping view-as above is enough).
    if (pathname.startsWith(TICKET_SYSTEM_PATH)) {
      navigate('/', { replace: false })
    }
  }, [viewAsActive, exitViewAs, pathname, navigate])

  const enterTicketSystem = useCallback(() => {
    if (!capabilities.can_use_ticket_system) return
    // Leaving view-as on the way in keeps the chrome clean (the ticket
    // workspace is the staff's own scope, not a customer preview).
    if (viewAsActive) exitViewAs()
    navigate(TICKET_SYSTEM_PATH)
  }, [capabilities.can_use_ticket_system, viewAsActive, exitViewAs, navigate])

  // The switcher only appears for staff who can reach at least one staff-only
  // mode. Non-staff get no switcher (they are implicitly always in mode 1).
  const showSwitcher =
    isLandrStaff &&
    (capabilities.can_use_ticket_system || capabilities.can_view_as_operator)

  const value = useMemo<AppModeContextValue>(
    () => ({
      mode,
      capabilities,
      capabilitiesLoading: isLandrStaff && capabilitiesQuery.isLoading,
      showSwitcher,
      enterOperatorMode,
      enterTicketSystem,
    }),
    [
      mode,
      capabilities,
      isLandrStaff,
      capabilitiesQuery.isLoading,
      showSwitcher,
      enterOperatorMode,
      enterTicketSystem,
    ],
  )

  return (
    <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext)
  if (!ctx) {
    throw new Error('useAppMode must be used inside <AppModeProvider>')
  }
  return ctx
}
