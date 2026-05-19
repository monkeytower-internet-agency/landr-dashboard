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

type OperatorContextValue = {
  operators: Operator[]
  currentOperator: Operator | null
  currentOperatorId: string | null
  loading: boolean
  switchOperator: (operatorId: string) => void
  refreshOperators: () => void
}

const STORAGE_KEY = 'landr.dashboard.currentOperatorId'

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

type FetchedOperators = {
  sessionUserId: string
  operators: Operator[]
}

export function OperatorProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [fetched, setFetched] = useState<FetchedOperators | null>(null)
  const [storedId, setStoredId] = useState<string | null>(() => readStored())
  const [reloadTick, setReloadTick] = useState(0)

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

  const refreshOperators = useCallback(() => {
    setReloadTick((t) => t + 1)
  }, [])

  const operators = useMemo<Operator[]>(() => {
    if (!session) return []
    if (fetched?.sessionUserId === session.user.id) return fetched.operators
    return []
  }, [session, fetched])

  const loading = !!session && fetched?.sessionUserId !== session?.user?.id

  const currentOperatorId = useMemo<string | null>(() => {
    if (!session) return null
    if (storedId && operators.some((o) => o.id === storedId)) return storedId
    return operators[0]?.id ?? null
  }, [session, operators, storedId])

  useEffect(() => {
    writeStored(currentOperatorId)
  }, [currentOperatorId])

  const switchOperator = useCallback((operatorId: string) => {
    setStoredId(operatorId)
  }, [])

  const value = useMemo<OperatorContextValue>(() => {
    const currentOperator =
      operators.find((o) => o.id === currentOperatorId) ?? null
    return {
      operators,
      currentOperator,
      currentOperatorId,
      loading,
      switchOperator,
      refreshOperators,
    }
  }, [operators, currentOperatorId, loading, switchOperator, refreshOperators])

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
