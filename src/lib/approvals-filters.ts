// landr-aqn4 — per-user filter state for the Approvals queue.
//
// Mirrors src/lib/bookings-filters.ts (landr-1lj / knz3) but with a
// different dimension set tailored to manual review:
//   1. reason          — derived from approval_trace.applied_rules
//   2. productIds      — products.id from booking_products
//   3. customerStatus  — 'new' / 'returning' (derived from
//                        first_time_customer rule firing)
//   4. urgency         — 'urgent' / 'soon' / 'later' / 'unknown' bucket
//                        of days-until-activity_date
//   5. price           — 'low' / 'mid' / 'high' bucket of gross_total
//
// State is persisted per-user in localStorage so the operator's filter
// chips survive reloads. Cross-account isolation is by storage key
// (we re-read when the auth user changes).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'

export type ApprovalsFilters = {
  /** Reason buckets — see ApprovalReasonBucket in src/lib/bookings.ts. */
  reasons: string[]
  /** products.id values. */
  productIds: string[]
  /** 'new' | 'returning'. */
  customerStatus: string[]
  /** UrgencyBucket — see src/lib/bookings.ts. */
  urgency: string[]
  /** PriceBucket — see src/lib/bookings.ts. */
  price: string[]
  /** landr-qmdo — ApprovalStage ('general' | 'secondary' | 'hotel').
   *  Filters rows by current_stage.code via stageOf(). */
  stages: string[]
}

export const EMPTY_APPROVALS_FILTERS: ApprovalsFilters = {
  reasons: [],
  productIds: [],
  customerStatus: [],
  urgency: [],
  price: [],
  stages: [],
}

const FILTER_KEYS: ReadonlyArray<keyof ApprovalsFilters> = [
  'reasons',
  'productIds',
  'customerStatus',
  'urgency',
  'price',
  'stages',
]

export function approvalsStorageKey(userId: string): string {
  return `landr.dashboard.approvalsFilters.${userId}`
}

export function isEmptyApprovalsFilters(f: ApprovalsFilters): boolean {
  return FILTER_KEYS.every((k) => f[k].length === 0)
}

export function activeApprovalsFilterCount(f: ApprovalsFilters): number {
  return FILTER_KEYS.reduce((sum, k) => sum + f[k].length, 0)
}

function readStored(userId: string): ApprovalsFilters {
  if (typeof window === 'undefined') return EMPTY_APPROVALS_FILTERS
  try {
    const raw = window.localStorage.getItem(approvalsStorageKey(userId))
    if (!raw) return EMPTY_APPROVALS_FILTERS
    const parsed = JSON.parse(raw) as Partial<ApprovalsFilters>
    const out: ApprovalsFilters = { ...EMPTY_APPROVALS_FILTERS }
    for (const k of FILTER_KEYS) {
      const v = parsed?.[k]
      if (Array.isArray(v)) {
        out[k] = v.filter((x): x is string => typeof x === 'string')
      }
    }
    return out
  } catch {
    return EMPTY_APPROVALS_FILTERS
  }
}

function writeStored(userId: string, value: ApprovalsFilters): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      approvalsStorageKey(userId),
      JSON.stringify(value),
    )
  } catch {
    /* localStorage may be unavailable or full — fail silently. */
  }
}

export type UseApprovalsFilters = {
  filters: ApprovalsFilters
  setFilters: (next: ApprovalsFilters) => void
  toggle: (dimension: keyof ApprovalsFilters, value: string) => void
  clearDimension: (dimension: keyof ApprovalsFilters) => void
  clearAll: () => void
}

/** Per-user filter hook. Reads/writes localStorage keyed on the auth user id.
 *  When no user is signed in we fall back to an in-memory state (no persist).
 */
export function useApprovalsFilters(): UseApprovalsFilters {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [filters, setFiltersState] = useState<ApprovalsFilters>(() =>
    userId ? readStored(userId) : EMPTY_APPROVALS_FILTERS,
  )

  const lastUserRef = useRef<string | null>(userId)
  useEffect(() => {
    if (lastUserRef.current === userId) return
    lastUserRef.current = userId
    setFiltersState(userId ? readStored(userId) : EMPTY_APPROVALS_FILTERS)
  }, [userId])

  const setFilters = useCallback(
    (next: ApprovalsFilters) => {
      setFiltersState(next)
      if (userId) writeStored(userId, next)
    },
    [userId],
  )

  const toggle = useCallback(
    (dimension: keyof ApprovalsFilters, value: string) => {
      setFiltersState((current) => {
        const existing = current[dimension]
        const next: ApprovalsFilters = {
          ...current,
          [dimension]: existing.includes(value)
            ? existing.filter((v) => v !== value)
            : [...existing, value],
        }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  const clearDimension = useCallback(
    (dimension: keyof ApprovalsFilters) => {
      setFiltersState((current) => {
        const next: ApprovalsFilters = { ...current, [dimension]: [] }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  const clearAll = useCallback(() => {
    setFiltersState(EMPTY_APPROVALS_FILTERS)
    if (userId) writeStored(userId, EMPTY_APPROVALS_FILTERS)
  }, [userId])

  return useMemo(
    () => ({ filters, setFilters, toggle, clearDimension, clearAll }),
    [filters, setFilters, toggle, clearDimension, clearAll],
  )
}
