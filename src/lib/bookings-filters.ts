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
}

export const EMPTY_FILTERS: BookingsFilters = {
  lifecycleStates: [],
  productIds: [],
  pickupLocationIds: [],
  productKinds: [],
  serviceTimeShapes: [],
}

const FILTER_KEYS: ReadonlyArray<keyof BookingsFilters> = [
  'lifecycleStates',
  'productIds',
  'pickupLocationIds',
  'productKinds',
  'serviceTimeShapes',
]

export function storageKey(userId: string): string {
  return `landr.dashboard.bookingsFilters.${userId}`
}

/** True when no dimension has any selection (i.e. "show everything"). */
export function isEmptyFilters(f: BookingsFilters): boolean {
  return FILTER_KEYS.every((k) => f[k].length === 0)
}

/** Total count of active filter selections across all dimensions. */
export function activeFilterCount(f: BookingsFilters): number {
  return FILTER_KEYS.reduce((sum, k) => sum + f[k].length, 0)
}

function readStored(userId: string): BookingsFilters {
  if (typeof window === 'undefined') return EMPTY_FILTERS
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY_FILTERS
    const parsed = JSON.parse(raw) as Partial<BookingsFilters>
    // Tolerate older / malformed shapes: every key is normalised to a
    // string[]; unknown keys are dropped.
    const out: BookingsFilters = { ...EMPTY_FILTERS }
    for (const k of FILTER_KEYS) {
      const v = parsed?.[k]
      if (Array.isArray(v)) {
        out[k] = v.filter((x): x is string => typeof x === 'string')
      }
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
  toggle: (dimension: keyof BookingsFilters, value: string) => void
  clearDimension: (dimension: keyof BookingsFilters) => void
  clearAll: () => void
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
    (dimension: keyof BookingsFilters, value: string) => {
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
    (dimension: keyof BookingsFilters) => {
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

  return useMemo(
    () => ({ filters, setFilters, toggle, clearDimension, clearAll }),
    [filters, setFilters, toggle, clearDimension, clearAll],
  )
}
