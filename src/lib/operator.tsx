import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

// landr-5eb / landr-2eh — subscription package embed. Gates which
// product_kind values an operator may sell. The dashboard hides
// disallowed kinds from the ProductForm picker; the FastAPI server
// re-enforces with 403 so direct API calls cannot bypass.
export type SubscriptionPackageRef = {
  slug: string
  name: string
  allowed_product_kinds: string[]
}

export type Operator = {
  id: string
  slug: string
  name: string | null
  onboarded_at: string | null
  // landr-f1s — calendar display prefs. The columns are NOT NULL in the DB
  // (defaults 08:00 / 20:00 / true) but we keep them optional on the client
  // type so older test fixtures and stale membership caches still type-check.
  // Consumers should funnel through useOperatorCalendarPrefs(), which
  // collapses null / undefined onto the same safe defaults.
  work_hours_start?: string | null
  work_hours_end?: string | null
  time_format_24h?: boolean | null
  // landr-m4zq — 0=Sunday..6=Saturday. NOT NULL DEFAULT 1 in the DB but
  // optional/nullable here for the same stale-cache + test-fixture reason
  // as the prefs above. Consumers should funnel through
  // useOperatorCalendarPrefs() which converges null/undefined onto
  // DEFAULT_FIRST_DAY_OF_WEEK.
  first_day_of_week?: number | null
  // landr-5eb — embed of the operator's subscription_package row. Optional
  // for the same reason as the calendar prefs (older test fixtures).
  // Consumers should use useOperatorAllowedProductKinds() which falls back
  // to the universal ['service'] default when the package isn't loaded yet.
  subscription_package?: SubscriptionPackageRef | null
  // landr-c3t — opt-in for premium-tease UX in ProductForm. Free-tier
  // operators always see teasers regardless of value (forced on visually).
  // Paid tiers toggle this from Settings. Optional on the type for parity
  // with the older optional columns above (stale-cache + test fixtures).
  show_premium_teasers?: boolean | null
}

// landr-f1s — fallback defaults when an Operator row is missing the calendar
// prefs (e.g. stale cache, race between membership fetch and migration).
// Source of truth is the operators table defaults.
export const DEFAULT_WORK_HOURS_START = '08:00'
export const DEFAULT_WORK_HOURS_END = '20:00'
export const DEFAULT_TIME_FORMAT_24H = true
// landr-m4zq — fallback default matches the DB default (1 = Monday).
// Consumed by useOperatorCalendarPrefs() so the calendar surfaces never
// render with an undefined first-day-of-week.
export const DEFAULT_FIRST_DAY_OF_WEEK = 1

// landr-2soj — a minimal operator descriptor used by the staff "View as
// operator" picker. The all-operators list comes from a SEPARATE query
// (`operators` table, RLS staff-bypass) so it stays DISTINCT from the
// membership-scoped `operators` list above (landr-69c: never widen the
// membership query, that leak must not return).
//
// landr-y7lw — `onboarded_at` is fetched so the picker can hide operators that
// never finished onboarding. Those orphaned/incomplete rows have it NULL;
// selecting one would drop the staff user on a dead /onboarding page. The
// picker filters the list to onboarded_at IS NOT NULL (see staffOperators).
export type StaffOperatorRef = {
  id: string
  slug: string
  name: string | null
  onboarded_at: string | null
}

// landr-7dya.17 — shared name-or-slug fallback, previously duplicated in
// OperatorSwitcher.tsx and ViewAsOperatorPicker.tsx. Single source here.
// eslint-disable-next-line react-refresh/only-export-components
export function displayName(name: string | null, slug: string): string {
  return name && name.trim().length > 0 ? name : slug
}

type OperatorContextValue = {
  operators: Operator[]
  currentOperator: Operator | null
  currentOperatorId: string | null
  loading: boolean
  switchOperator: (operatorId: string) => void
  refreshOperators: () => void
  // landr-2soj — staff "View as operator" mode. While `viewAsActive`,
  // `currentOperatorId` resolves to the viewed-as operator so every data
  // query scopes to it via the existing filters. Entitlements drop the staff
  // bypass in this mode (see entitlements.tsx) so the nav/routes become
  // exactly the viewed-as operator's tier-gated view.
  //
  // The all-operators list (`staffOperators`) is fetched from the `operators`
  // table directly, NOT the membership join — it's the staff-only picker
  // source and is empty for non-staff (the RLS bypass that fills it only
  // applies to is_landr_staff sessions; non-staff get zero rows).
  staffOperators: StaffOperatorRef[]
  staffOperatorsLoading: boolean
  /** True while a staff user is viewing the dashboard as another operator. */
  viewAsActive: boolean
  /** The operator currently being viewed-as, or null. */
  viewAsOperator: StaffOperatorRef | null
  /** Enter view-as mode for the given operator id (staff-only — no-op if the
   *  id is not in the staffOperators list). */
  enterViewAs: (operatorId: string) => void
  /** Clear view-as mode and restore the staff's own scope + full staff view. */
  exitViewAs: () => void
}

const STORAGE_KEY = 'landr.dashboard.currentOperatorId'
// landr-2soj — persisted view-as target (operator id). Kept separate from the
// currentOperatorId key so exiting view-as restores the staff's own last
// operator scope rather than collapsing the two.
const VIEW_AS_STORAGE_KEY = 'landr.dashboard.viewAsOperatorId'

const OperatorContext = createContext<OperatorContextValue | undefined>(undefined)

function readStored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage may be disabled — UX hint only, fail silently.
  }
}

// landr-2soj — persistence for the view-as target.
function readViewAs(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(VIEW_AS_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeViewAs(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(VIEW_AS_STORAGE_KEY, id)
    else window.localStorage.removeItem(VIEW_AS_STORAGE_KEY)
  } catch {
    // localStorage may be disabled — UX hint only, fail silently.
  }
}

type FetchedOperators = {
  sessionUserId: string
  operators: Operator[]
}

type FetchedStaffOperators = {
  sessionUserId: string
  operators: StaffOperatorRef[]
}

export function OperatorProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [fetched, setFetched] = useState<FetchedOperators | null>(null)
  const [storedId, setStoredId] = useState<string | null>(() => readStored())
  const [reloadTick, setReloadTick] = useState(0)
  // landr-2soj — view-as target (persisted). Hydrated from localStorage on
  // mount; only honoured once the operator is confirmed present in the
  // staffOperators list (so a stale id or a downgraded-from-staff session
  // can never leave the user stuck in a phantom view-as).
  const [viewAsId, setViewAsId] = useState<string | null>(() => readViewAs())
  const [staffFetched, setStaffFetched] = useState<FetchedStaffOperators | null>(
    null,
  )

  useEffect(() => {
    if (authLoading || !session) return

    let cancelled = false

    // landr-69c: filter to the caller's own memberships. RLS bypass for
    // is_landr_staff makes a no-filter query leak every membership row in
    // the system, producing duplicate dropdown entries + accidental
    // tenant-switches into operators the user doesn't own. The auth.uid()
    // is the supabase_auth_id; resolve it to public.users.id via the
    // bridge table, then filter operator_memberships.user_id by that.
    ;(async () => {
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('id')
        .eq('supabase_auth_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (userErr || !userRow) {
        setFetched({ sessionUserId: session.user.id, operators: [] })
        return
      }

      // landr-5eb: embed subscription_package so the ProductForm can gate the
      // product_kind picker without a second round-trip. PostgREST embed
      // syntax `subscription_package:subscription_packages(...)` aliases the
      // joined row to `subscription_package` on the operator object.
      const { data, error } = await supabase
        .from('operator_memberships')
        .select(
          'operator_id, operators!inner ( id, slug, name, onboarded_at, ' +
            'work_hours_start, work_hours_end, time_format_24h, ' +
            'first_day_of_week, ' +
            'show_premium_teasers, ' +
            'subscription_package:subscription_packages ( slug, name, allowed_product_kinds ) )',
        )
        .eq('user_id', userRow.id)
      if (cancelled) return
      if (error || !data) {
        setFetched({ sessionUserId: session.user.id, operators: [] })
        return
      }
      const rows = data as unknown as Array<{
        operators: Operator | Operator[] | null
      }>
      const seen = new Set<string>()
      const next: Operator[] = []
      for (const row of rows) {
        const op = Array.isArray(row.operators) ? row.operators[0] : row.operators
        if (op && !seen.has(op.id)) {
          seen.add(op.id)
          next.push(op)
        }
      }
      setFetched({ sessionUserId: session.user.id, operators: next })
    })()

    return () => {
      cancelled = true
    }
  }, [session, authLoading, reloadTick])

  // landr-2soj — STAFF-ONLY all-operators list for the "View as operator"
  // picker. SEPARATE query against the `operators` table (NOT the membership
  // join above — landr-69c: never widen that membership query). For
  // is_landr_staff sessions the RLS bypass returns every operator row; for a
  // non-staff session RLS restricts the same query to operators the user can
  // already see (typically their own / none), so the picker is effectively
  // empty for them and the staff-only UI never appears. This runs for every
  // session (cheap, RLS-bounded) so the staff flag does not need threading in
  // here — entitlements.tsx owns the is_landr_staff decision and the UI gates
  // the picker on it.
  useEffect(() => {
    if (authLoading || !session) return
    let cancelled = false
    ;(async () => {
      // landr-y7lw — fetch onboarded_at too so the picker can filter to
      // operators that actually finished onboarding (see the staffOperators
      // memo below).
      const { data, error } = await supabase
        .from('operators')
        .select('id, slug, name, onboarded_at')
        .order('slug', { ascending: true })
      if (cancelled) return
      if (error || !data) {
        setStaffFetched({ sessionUserId: session.user.id, operators: [] })
        return
      }
      setStaffFetched({
        sessionUserId: session.user.id,
        operators: data as StaffOperatorRef[],
      })
    })()
    return () => {
      cancelled = true
    }
  }, [session, authLoading, reloadTick])

  const refreshOperators = useCallback(() => {
    setReloadTick((t) => t + 1)
  }, [])

  const staffOperators = useMemo<StaffOperatorRef[]>(() => {
    if (!session) return []
    if (staffFetched?.sessionUserId !== session.user.id) return []
    // landr-y7lw — hide operators that never finished onboarding. The signal
    // for a real/usable operator is operators.onboarded_at IS NOT NULL;
    // orphaned/incomplete rows have it null and selecting one drops the staff
    // user on a dead /onboarding page. Filtering here also guards enterViewAs
    // and the persisted-id resolution (both derive from staffOperators), so a
    // stale view-as can never resolve to an un-onboarded operator.
    return staffFetched.operators.filter((o) => o.onboarded_at != null)
  }, [session, staffFetched])

  const staffOperatorsLoading =
    !!session && staffFetched?.sessionUserId !== session?.user?.id

  const operators = useMemo<Operator[]>(() => {
    if (!session) return []
    if (fetched?.sessionUserId === session.user.id) return fetched.operators
    return []
  }, [session, fetched])

  const loading = !!session && fetched?.sessionUserId !== session?.user?.id

  // landr-2soj — the view-as target is only honoured when it resolves to a
  // real operator in the staffOperators list (guards a stale localStorage id
  // or a session that lost staff and therefore gets an empty staff list).
  const viewAsOperator = useMemo<StaffOperatorRef | null>(() => {
    if (!session || !viewAsId) return null
    return staffOperators.find((o) => o.id === viewAsId) ?? null
  }, [session, viewAsId, staffOperators])

  // While the staff list is still loading we keep view-as PENDING (active flag
  // false) rather than tearing down — once resolved, an unmatched id is
  // dropped below. This avoids a flash of the staff view between mount and the
  // staffOperators fetch landing.
  const viewAsActive = viewAsOperator !== null

  // The operator the user's OWN scope would land on (membership-based), used
  // when not in view-as.
  const ownOperatorId = useMemo<string | null>(() => {
    if (!session) return null
    if (storedId && operators.some((o) => o.id === storedId)) return storedId
    return operators[0]?.id ?? null
  }, [session, operators, storedId])

  // landr-2soj — in view-as mode currentOperatorId resolves to X so every
  // data query scopes to it through the existing currentOperatorId filters.
  const currentOperatorId = viewAsActive ? viewAsOperator!.id : ownOperatorId

  useEffect(() => {
    // Persist only the OWN scope so exiting view-as restores it. The view-as
    // target has its own key.
    writeStored(ownOperatorId)
  }, [ownOperatorId])

  // landr-2soj — note: a STALE / unresolvable persisted view-as id (removed
  // operator, or a session that lost staff so the staff list came back empty)
  // needs no cleanup effect. `viewAsOperator` is derived by matching `viewAsId`
  // against the (RLS-bounded) staffOperators list, so an unmatched id simply
  // resolves to viewAsActive=false on every render — the staff/own view shows
  // and the harmless id stays in localStorage until the next enter/exit
  // rewrites it. Avoiding a setState-in-effect here keeps the provider clean
  // (react-hooks/set-state-in-effect) and there's no cascading-render hazard.

  const switchOperator = useCallback((operatorId: string) => {
    setStoredId(operatorId)
  }, [])

  const enterViewAs = useCallback(
    (operatorId: string) => {
      // Only enter for an operator the staff list actually contains (a
      // non-staff caller's list is empty, so this is a no-op for them).
      if (!staffOperators.some((o) => o.id === operatorId)) return
      setViewAsId(operatorId)
      writeViewAs(operatorId)
    },
    [staffOperators],
  )

  const exitViewAs = useCallback(() => {
    setViewAsId(null)
    writeViewAs(null)
  }, [])

  const value = useMemo<OperatorContextValue>(() => {
    // Resolve the current Operator object. In view-as mode the target may not
    // be in the membership list, so fall back to a minimal Operator built from
    // the staff ref (id/slug/name) — calendar prefs etc. funnel through their
    // convenience hooks which already default safely when the columns are
    // absent. When the membership list DOES contain X (a staff who also owns
    // X), prefer the fully-hydrated row.
    let currentOperator = operators.find((o) => o.id === currentOperatorId) ?? null
    if (!currentOperator && viewAsActive && viewAsOperator) {
      currentOperator = {
        id: viewAsOperator.id,
        slug: viewAsOperator.slug,
        name: viewAsOperator.name,
        // landr-y7lw — carry the real onboarded_at from the staff ref (the
        // staff list is now onboarded-only, so this is always set). Previously
        // hardcoded null, which made OnboardingGuard redirect every view-as
        // target into the onboarding wizard.
        onboarded_at: viewAsOperator.onboarded_at,
      }
    }
    return {
      operators,
      currentOperator,
      currentOperatorId,
      loading,
      switchOperator,
      refreshOperators,
      staffOperators,
      staffOperatorsLoading,
      viewAsActive,
      viewAsOperator,
      enterViewAs,
      exitViewAs,
    }
  }, [
    operators,
    currentOperatorId,
    loading,
    switchOperator,
    refreshOperators,
    staffOperators,
    staffOperatorsLoading,
    viewAsActive,
    viewAsOperator,
    enterViewAs,
    exitViewAs,
  ])

  return (
    <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOperator(): OperatorContextValue {
  const ctx = useContext(OperatorContext)
  if (!ctx) {
    throw new Error('useOperator must be used inside <OperatorProvider>')
  }
  return ctx
}

/**
 * landr-f1s — convenience hook returning the current operator's calendar
 * display prefs with safe defaults. Use this rather than reading
 * `currentOperator.time_format_24h` directly so that null / stale-cache
 * cases all converge on the same fallback.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useOperatorCalendarPrefs(): {
  workHoursStart: string
  workHoursEnd: string
  hour12: boolean
  /** landr-m4zq — 0=Sunday..6=Saturday. Defaults to 1 (Monday). */
  firstDayOfWeek: number
} {
  const { currentOperator } = useOperator()
  return {
    workHoursStart: currentOperator?.work_hours_start ?? DEFAULT_WORK_HOURS_START,
    workHoursEnd: currentOperator?.work_hours_end ?? DEFAULT_WORK_HOURS_END,
    hour12:
      currentOperator?.time_format_24h !== null &&
      currentOperator?.time_format_24h !== undefined
        ? !currentOperator.time_format_24h
        : !DEFAULT_TIME_FORMAT_24H,
    firstDayOfWeek:
      currentOperator?.first_day_of_week !== null &&
      currentOperator?.first_day_of_week !== undefined
        ? currentOperator.first_day_of_week
        : DEFAULT_FIRST_DAY_OF_WEEK,
  }
}

/**
 * landr-5eb — convenience hook returning the operator's allowed product_kind
 * values, derived from the embedded subscription_package row. Falls back to
 * ['service'] (the universal v1 kind) when the package isn't loaded yet so
 * the form never hides every option mid-render.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useOperatorAllowedProductKinds(): string[] {
  const { currentOperator } = useOperator()
  const kinds = currentOperator?.subscription_package?.allowed_product_kinds
  if (kinds && kinds.length > 0) return kinds
  return ['service']
}
