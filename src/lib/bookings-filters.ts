// landr-1lj — per-user filter state for the Bookings table + calendar.
//
// State is persisted in localStorage under
// `landr.dashboard.bookingsFilters.<userId>` so reloads pick up where the
// user left off without leaking between accounts on a shared machine.
// Filters are USER-level (not operator-level): the same user filtering
// similarly across operators is intentional.
//
// Empty array on a dimension means "match all" — see matchesFilters().

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'

export type BookingsFilters = {
  /** booking_lifecycle_stages.code values (free-text per operator). */
  lifecycleStates: string[]
  /** products.id values. */
  productIds: string[]
  /** locations.id values (pickup_location_id on booking_participants). */
  pickupLocationIds: string[]
  /** product_kind enum values. */
  productKinds: string[]
  /** service_time_shape enum values. */
  serviceTimeShapes: string[]
  /**
   * landr-qhi0 — when true, bookings whose latest activity date is in the
   * past are kept in the list. Default false (past bookings are hidden so
   * the operator focuses on upcoming work). Persisted alongside the chip
   * dimensions; older stored payloads simply default to false via the
   * parser below.
   */
  showPast: boolean
}

export const EMPTY_FILTERS: BookingsFilters = {
  lifecycleStates: [],
  productIds: [],
  pickupLocationIds: [],
  productKinds: [],
  serviceTimeShapes: [],
  showPast: false,
}

type ChipDimension = Exclude<keyof BookingsFilters, 'showPast'>

const FILTER_KEYS: ReadonlyArray<ChipDimension> = [
  'lifecycleStates',
  'productIds',
  'pickupLocationIds',
  'productKinds',
  'serviceTimeShapes',
]

export function storageKey(userId: string): string {
  return `landr.dashboard.bookingsFilters.${userId}`
}

/** True when no dimension has any selection (i.e. "show everything").
 *  landr-qhi0 — `showPast` is a view toggle, not a chip, so we ignore it
 *  here (matches the includeErased precedent in contacts-filters.ts). */
export function isEmptyFilters(f: BookingsFilters): boolean {
  return FILTER_KEYS.every((k) => f[k].length === 0)
}

/** Total count of active filter selections across all chip dimensions.
 *  landr-qhi0 — `showPast` is intentionally NOT counted: same reasoning
 *  as `includeErased` in contacts-filters — keeps the "Clear filters"
 *  affordance reserved for the chip selections. */
export function activeFilterCount(f: BookingsFilters): number {
  return FILTER_KEYS.reduce((sum, k) => sum + f[k].length, 0)
}

function readStored(userId: string): BookingsFilters {
  if (typeof window === 'undefined') return EMPTY_FILTERS
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY_FILTERS
    const parsed = JSON.parse(raw) as Partial<BookingsFilters>
    // Tolerate older / malformed shapes: every chip dimension is normalised
    // to a string[]; unknown keys are dropped. `showPast` defaults to false
    // when missing so older payloads behave like the new "hide past" default.
    const out: BookingsFilters = { ...EMPTY_FILTERS }
    for (const k of FILTER_KEYS) {
      const v = parsed?.[k]
      if (Array.isArray(v)) {
        out[k] = v.filter((x): x is string => typeof x === 'string')
      }
    }
    if (typeof parsed?.showPast === 'boolean') {
      out.showPast = parsed.showPast
    }
    return out
  } catch {
    return EMPTY_FILTERS
  }
}

function writeStored(userId: string, value: BookingsFilters): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(value))
  } catch {
    /* localStorage may be unavailable or full — fail silently. */
  }
}

export type UseBookingsFilters = {
  filters: BookingsFilters
  setFilters: (next: BookingsFilters) => void
  toggle: (dimension: ChipDimension, value: string) => void
  clearDimension: (dimension: ChipDimension) => void
  clearAll: () => void
  /** landr-qhi0 — flip the "Show past bookings" view toggle. */
  setShowPast: (value: boolean) => void
}

/**
 * Per-user filter hook. Reads/writes localStorage keyed on the auth user id.
 * When no user is signed in we fall back to an in-memory state (no persist).
 */
export function useBookingsFilters(): UseBookingsFilters {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Lazy init keyed on userId so a different account on the same browser
  // starts from its own stored state.
  const [filters, setFiltersState] = useState<BookingsFilters>(() =>
    userId ? readStored(userId) : EMPTY_FILTERS,
  )

  // When the user changes (sign-in/out, account switch), re-read storage so
  // the bar reflects the new identity rather than the previous user's chips.
  const lastUserRef = useRef<string | null>(userId)
  useEffect(() => {
    if (lastUserRef.current === userId) return
    lastUserRef.current = userId
    setFiltersState(userId ? readStored(userId) : EMPTY_FILTERS)
  }, [userId])

  const setFilters = useCallback(
    (next: BookingsFilters) => {
      setFiltersState(next)
      if (userId) writeStored(userId, next)
    },
    [userId],
  )

  const toggle = useCallback(
    (dimension: ChipDimension, value: string) => {
      setFiltersState((current) => {
        const existing = current[dimension]
        const next: BookingsFilters = {
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
    (dimension: ChipDimension) => {
      setFiltersState((current) => {
        const next: BookingsFilters = { ...current, [dimension]: [] }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  const clearAll = useCallback(() => {
    setFiltersState(EMPTY_FILTERS)
    if (userId) writeStored(userId, EMPTY_FILTERS)
  }, [userId])

  const setShowPast = useCallback(
    (value: boolean) => {
      setFiltersState((current) => {
        if (current.showPast === value) return current
        const next: BookingsFilters = { ...current, showPast: value }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  return useMemo(
    () => ({ filters, setFilters, toggle, clearDimension, clearAll, setShowPast }),
    [filters, setFilters, toggle, clearDimension, clearAll, setShowPast],
  )
}
