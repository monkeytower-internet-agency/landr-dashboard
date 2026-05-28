// landr-7dya.11 — shared ticket-filter context for the ticket-system app-view.
//
// The TicketSystemShell owns ONE filter bar that spans BOTH the Inbox and the
// Board surfaces. This provider is the single source of truth for that filter:
//
//   • Filter state lives in the URL (deep-linkable) — the provider reads it
//     from useSearchParams and writes back through filterToParams. A reload or
//     a shared link reproduces the exact filtered view.
//   • The provider resolves the current public-user id (for assigned-to-me /
//     watching / mentioned-me) and the derived-state id Sets once.
//   • It exposes a `matches(ticket)` predicate the surfaces apply to their own
//     already-loaded rows, plus the server-side filtered id Set so a surface can
//     pre-narrow if it wishes. Both surfaces fetch their OWN rows (operator-
//     scoped) — the predicate intersects; we never re-route their data through
//     here, keeping this change additive and conflict-free with the surfaces.
//
// Mounted by TicketSystemShell ABOVE the <Outlet />, so every surface below has
// access via useTicketFilter().

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/lib/auth'
import { fetchCurrentPublicUser } from '@/lib/tickets'
import {
  TICKET_FILTER_DEFAULTS,
  filterFromParams,
  filterToParams,
  resolveTimeFloorISO,
  ticketMatchesFilter,
  type FilterMatchContext,
  type TicketFilter,
  type TicketLike,
} from '@/lib/ticket-filters'
import {
  EMPTY_DERIVED_SETS,
  fetchFilterDerivedSets,
  fetchFilteredStaffTicketIds,
} from '@/lib/ticket-filter-data'

type TicketFilterContextValue = {
  /** The active filter, derived from the URL. */
  filter: TicketFilter
  /** Replace the entire filter (writes the URL; preserves unrelated params). */
  setFilter: (next: TicketFilter) => void
  /** Patch a subset of facets (merges over the current filter). */
  patchFilter: (patch: Partial<TicketFilter>) => void
  /** Reset to DEFAULT (clears all filter params from the URL). */
  clearFilter: () => void
  /** True iff `ticket` passes every active facet (AND). Stable identity. */
  matches: (ticket: TicketLike) => boolean
  /**
   * Server-filtered id Set for the row-intrinsic facets, or null when no
   * row-intrinsic facet is active (= match everything). Surfaces MAY intersect
   * with this to pre-narrow; the predicate alone is sufficient for correctness.
   */
  serverFilteredIds: ReadonlySet<string> | null
  /** True while the derived sets / server ids are loading. */
  isResolving: boolean
}

const TicketFilterContext = createContext<TicketFilterContextValue | undefined>(
  undefined,
)

export function TicketFilterProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { session } = useAuth()
  const authUid = session?.user?.id ?? null

  // Filter is DERIVED from the URL — the URL is the single source of truth, so
  // a reload / deep-link reproduces the view. Memo on the serialized string so
  // identity is stable across unrelated re-renders.
  const paramsKey = searchParams.toString()
  const filter = useMemo(
    () => filterFromParams(new URLSearchParams(paramsKey)),
    [paramsKey],
  )

  const setFilter = useCallback(
    (next: TicketFilter) => {
      setSearchParams(
        (prev) => filterToParams(next, prev),
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const patchFilter = useCallback(
    (patch: Partial<TicketFilter>) => {
      setSearchParams(
        (prev) => filterToParams({ ...filterFromParams(prev), ...patch }, prev),
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const clearFilter = useCallback(() => {
    setSearchParams(
      (prev) => filterToParams(TICKET_FILTER_DEFAULTS, prev),
      { replace: true },
    )
  }, [setSearchParams])

  // Resolve the current public-user id (for assigned-to-me / derived sets).
  const userQuery = useQuery({
    queryKey: ['current-public-user', authUid],
    queryFn: () => fetchCurrentPublicUser(authUid as string),
    enabled: !!authUid,
    staleTime: 1000 * 60 * 5,
  })
  const currentUserId = userQuery.data?.id ?? null

  // Derived-state sets (assigned / unread / watching / mentioned). One fetch,
  // cached; the chips become O(1) set lookups.
  const derivedQuery = useQuery({
    queryKey: ['ticket-filter-derived', currentUserId],
    queryFn: () => fetchFilterDerivedSets(currentUserId),
    enabled: !!currentUserId,
    staleTime: 30 * 1000,
  })
  const derived = derivedQuery.data ?? EMPTY_DERIVED_SETS

  // Server-side filtered id Set for the row-intrinsic facets. Keyed on the
  // serialized filter so it refetches when a facet changes. Returns null when
  // no row-intrinsic facet is active (no round-trip).
  const serverQuery = useQuery({
    queryKey: ['ticket-filter-server-ids', paramsKey, currentUserId],
    queryFn: () => fetchFilteredStaffTicketIds(filter, currentUserId),
    staleTime: 15 * 1000,
  })
  const serverFilteredIds = serverQuery.data ?? null

  // Stable match context — the time floor is resolved once per filter change.
  const matchCtx = useMemo<FilterMatchContext>(
    () => ({
      currentUserId,
      assignedToMeIds: derived.assignedToMeIds,
      unreadIds: derived.unreadIds,
      watchingIds: derived.watchingIds,
      mentionedMeIds: derived.mentionedMeIds,
      timeFloorISO: resolveTimeFloorISO(filter.timeRange),
    }),
    [currentUserId, derived, filter.timeRange],
  )

  const matches = useCallback(
    (ticket: TicketLike) => ticketMatchesFilter(ticket, filter, matchCtx),
    [filter, matchCtx],
  )

  const value = useMemo<TicketFilterContextValue>(
    () => ({
      filter,
      setFilter,
      patchFilter,
      clearFilter,
      matches,
      serverFilteredIds,
      isResolving: derivedQuery.isLoading || serverQuery.isLoading,
    }),
    [
      filter,
      setFilter,
      patchFilter,
      clearFilter,
      matches,
      serverFilteredIds,
      derivedQuery.isLoading,
      serverQuery.isLoading,
    ],
  )

  return (
    <TicketFilterContext.Provider value={value}>
      {children}
    </TicketFilterContext.Provider>
  )
}

/**
 * Access the shared ticket filter. Surfaces inside the ticket-system app-view
 * call this to read the active filter + the `matches` predicate.
 *
 * Returns a SAFE no-op fallback when used OUTSIDE the provider (e.g. the
 * standalone operator-chrome /tickets board, which is the same TicketBoard
 * component but mounted without the shell). The fallback matches everything, so
 * the board behaves exactly as before when there is no shell filter bar.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTicketFilter(): TicketFilterContextValue {
  const ctx = useContext(TicketFilterContext)
  if (ctx !== undefined) return ctx
  return FALLBACK
}

const FALLBACK: TicketFilterContextValue = {
  filter: TICKET_FILTER_DEFAULTS,
  setFilter: () => {},
  patchFilter: () => {},
  clearFilter: () => {},
  matches: () => true,
  serverFilteredIds: null,
  isResolving: false,
}
