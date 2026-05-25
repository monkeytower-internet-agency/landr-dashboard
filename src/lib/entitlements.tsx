// landr-sbhz.6 — feature gating from effective entitlements (React context).
//
// This module holds the React surface: the EntitlementsProvider + the
// useEntitlements() hook. The pure key→surface maps and the resolver RPC fetch
// live in entitlements-map.ts (a plain .ts, no JSX) so the React-refresh lint
// rule (only-export-components) is satisfied. Callers import featureForRoute /
// featureForSection from here for convenience (re-exported below).
//
// CONTRACT (from landr-sbhz.1 migration 20260525160000_feature_entitlements):
//   - The RPC `operator_effective_features` returns rows for ACTIVE features
//     only. A key ABSENT from the result is treated as DISABLED.
//   - Gating is GENERIC: any feature whose effective `enabled` is false (or
//     absent) is hidden. Nothing here is hardcoded to Para42.
//
// STAFF BYPASS:
//   Landr staff (users.is_landr_staff = true) are NEVER feature-gated. Staff
//   manage every operator and need their full tooling regardless of which tier
//   the currently-selected operator sits on, so `isEnabled` short-circuits to
//   true for staff. Per-feature staff-only surfaces keep whatever RLS /
//   visibility rules they already have — this module only hides tenant modules
//   disabled by tier; it adds no staff-only gating.
import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { useOperator } from '@/lib/operator'
import { fetchCurrentPublicUser } from '@/lib/tickets'
import { fetchEnabledFeatures } from '@/lib/entitlements-map'

type EntitlementsContextValue = {
  /** True for any feature the current operator's tier enables. Staff bypass
   *  returns true for everything. Absent key ⇒ false. */
  isEnabled: (featureKey: string) => boolean
  /** True iff the current session user is Landr staff (gating bypass). */
  isLandrStaff: boolean
  /** True while the entitlement resolution (or staff lookup) is in flight. */
  isLoading: boolean
}

const EntitlementsContext = createContext<EntitlementsContextValue | undefined>(
  undefined,
)

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const { currentOperatorId, loading: operatorLoading } = useOperator()
  const authUid = session?.user?.id ?? null

  // Staff flag for the current session user. Staff are never feature-gated, so
  // resolving this is part of the gating decision.
  const staffQuery = useQuery({
    queryKey: ['current-public-user', authUid],
    queryFn: () => fetchCurrentPublicUser(authUid as string),
    enabled: !!authUid,
    staleTime: 1000 * 60 * 5,
  })
  const isLandrStaff = staffQuery.data?.is_landr_staff ?? false

  // Effective entitlements for the selected operator. Skipped for staff (they
  // bypass gating) and when no operator is selected yet.
  const featuresQuery = useQuery({
    queryKey: ['operator-effective-features', currentOperatorId],
    queryFn: () => fetchEnabledFeatures(currentOperatorId as string),
    enabled: !!currentOperatorId && !isLandrStaff,
    staleTime: 1000 * 60 * 5,
  })

  const enabledSet = featuresQuery.data

  const isEnabled = useCallback(
    (featureKey: string): boolean => {
      // Staff bypass: never hide tooling from Landr staff.
      if (isLandrStaff) return true
      // While the resolution is still loading (or unavailable), default to
      // SHOWING the module. Hiding-then-revealing would flash the nav and risk
      // hiding a module the operator legitimately has. The server-side
      // defense-in-depth (RLS / endpoint guards) is the real enforcement; the
      // client gating is UX. Once resolved, absent/disabled ⇒ hidden.
      if (!enabledSet) return true
      return enabledSet.has(featureKey)
    },
    [isLandrStaff, enabledSet],
  )

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      isEnabled,
      isLandrStaff,
      isLoading:
        authLoading ||
        operatorLoading ||
        staffQuery.isLoading ||
        (!isLandrStaff && !!currentOperatorId && featuresQuery.isLoading),
    }),
    [
      isEnabled,
      isLandrStaff,
      authLoading,
      operatorLoading,
      staffQuery.isLoading,
      featuresQuery.isLoading,
      currentOperatorId,
    ],
  )

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  )
}

// Permissive fallback used when a consumer renders OUTSIDE an
// EntitlementsProvider (e.g. a route/sidebar component mounted in isolation by
// a unit test). Feature gating is UX-only — the real enforcement is server-side
// RLS + endpoint guards — so the safe degradation is to SHOW everything rather
// than crash or hide modules. The full App always mounts the provider, so this
// fallback never fires in production.
const PERMISSIVE_FALLBACK: EntitlementsContextValue = {
  isEnabled: () => true,
  isLandrStaff: false,
  isLoading: false,
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEntitlements(): EntitlementsContextValue {
  return useContext(EntitlementsContext) ?? PERMISSIVE_FALLBACK
}
