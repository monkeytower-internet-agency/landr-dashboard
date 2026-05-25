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
//
// VIEW-AS (landr-2soj):
//   When a staff user enters "view as operator X", the staff bypass is
//   DROPPED for the duration. We compute `effectiveIsStaff = isLandrStaff &&
//   !viewAsActive`; gating then resolves against operator X's
//   `operator_effective_features` exactly as a real operator would see it
//   (nav/routes become X's tier-gated view). On exit, the bypass returns and
//   the full staff view is restored. This is purely a VISIBILITY change — the
//   session stays the staff user and reads still use the staff RLS bypass.
import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { useOperator } from '@/lib/operator'
import { fetchCurrentPublicUser } from '@/lib/tickets'
import { fetchEnabledFeatures } from '@/lib/entitlements-map'

type EntitlementsContextValue = {
  /** True for any feature the current operator's tier enables. Staff bypass
   *  returns true for everything — UNLESS the staff user is in "view as
   *  operator" mode (landr-2soj), where gating falls back to the viewed-as
   *  operator's effective set. Absent key ⇒ false. */
  isEnabled: (featureKey: string) => boolean
  /** True iff the current session user is Landr staff (raw flag — unaffected
   *  by view-as). Kept for surfaces that genuinely need the underlying
   *  identity. Most UI callers want `effectiveIsStaff` instead. */
  isLandrStaff: boolean
  /** landr-2soj — `isLandrStaff && !viewAsActive`. This is the flag the UI
   *  should gate staff-only surfaces on (Revenue, Settings → Tiers, Audit),
   *  so they vanish while a staff user is viewing as a (non-staff) operator
   *  and reappear on exit. */
  effectiveIsStaff: boolean
  /** True while the entitlement resolution (or staff lookup) is in flight. */
  isLoading: boolean
}

const EntitlementsContext = createContext<EntitlementsContextValue | undefined>(
  undefined,
)

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const {
    currentOperatorId,
    loading: operatorLoading,
    viewAsActive,
  } = useOperator()
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

  // landr-2soj — the EFFECTIVE staff flag. While viewing-as, the staff user
  // should see exactly what the operator sees, so we drop the staff bypass.
  const effectiveIsStaff = isLandrStaff && !viewAsActive

  // Effective entitlements for the selected operator. Skipped for staff (they
  // bypass gating) and when no operator is selected yet — but in view-as mode
  // `effectiveIsStaff` is false, so the fetch RUNS and gating applies to the
  // viewed-as operator (currentOperatorId resolves to X via OperatorProvider).
  const featuresQuery = useQuery({
    queryKey: ['operator-effective-features', currentOperatorId],
    queryFn: () => fetchEnabledFeatures(currentOperatorId as string),
    enabled: !!currentOperatorId && !effectiveIsStaff,
    staleTime: 1000 * 60 * 5,
  })

  const enabledSet = featuresQuery.data

  const isEnabled = useCallback(
    (featureKey: string): boolean => {
      // Staff bypass: never hide tooling from Landr staff — UNLESS in view-as
      // mode, where effectiveIsStaff is false and gating falls through to the
      // viewed-as operator's resolved set below.
      if (effectiveIsStaff) return true
      // While the resolution is still loading (or unavailable), default to
      // SHOWING the module. Hiding-then-revealing would flash the nav and risk
      // hiding a module the operator legitimately has. The server-side
      // defense-in-depth (RLS / endpoint guards) is the real enforcement; the
      // client gating is UX. Once resolved, absent/disabled ⇒ hidden.
      if (!enabledSet) return true
      return enabledSet.has(featureKey)
    },
    [effectiveIsStaff, enabledSet],
  )

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      isEnabled,
      isLandrStaff,
      effectiveIsStaff,
      isLoading:
        authLoading ||
        operatorLoading ||
        staffQuery.isLoading ||
        (!effectiveIsStaff && !!currentOperatorId && featuresQuery.isLoading),
    }),
    [
      isEnabled,
      isLandrStaff,
      effectiveIsStaff,
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
  effectiveIsStaff: false,
  isLoading: false,
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEntitlements(): EntitlementsContextValue {
  return useContext(EntitlementsContext) ?? PERMISSIVE_FALLBACK
}
