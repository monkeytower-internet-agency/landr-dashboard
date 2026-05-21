// landr-1lj — per-user filter state for the Bookings table + calendar.
//
// State is persisted in localStorage under
// `landr.dashboard.bookingsFilters.<userId>` so reloads pick up where the
// user left off without leaking between accounts on a shared machine.
// Filters are USER-level (not operator-level): the same user filtering
// similarly across operators is intentional.
//
// landr-j57l — primary filter dimensions also round-trip through the URL
// (`?status=`, `?product=`, `?location=`, `?kind=`, `?shape=`,
// `?dateRange=`, `?past=`) so a filtered view can be shared / bookmarked.
// URL parse/serialise helpers live in this module (parseBookingsFiltersFromUrl
// / serialiseBookingsFiltersToUrl) and are wired up in src/routes/Bookings.tsx.
// URL > localStorage on first load — the route passes the URL-parsed value
// to `useBookingsFilters({ initialOverride })`.
//
// Empty array on a dimension means "match all" — see matchesFilters().

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'

/**
 * landr-68a9 — service-date preset for the quick-filter strip above the
 * Bookings table. A small enum of named windows rather than an arbitrary
 * date range so the filter is round-trippable through localStorage and
 * the active preset is easy to highlight in the strip. `null` means "no
 * date constraint" (every booking matches).
 */
export type ServiceDateRangePreset = 'today' | 'this_week' | 'next_30d'

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
  /**
   * landr-68a9 — service-date preset driven by the quick-filter strip.
   * `null` means no date constraint. Treated as a view toggle (not a
   * chip) so it doesn't count toward activeFilterCount / isEmptyFilters,
   * matching the showPast precedent.
   */
  serviceDateRange: ServiceDateRangePreset | null
}

export const EMPTY_FILTERS: BookingsFilters = {
  lifecycleStates: [],
  productIds: [],
  pickupLocationIds: [],
  productKinds: [],
  serviceTimeShapes: [],
  showPast: false,
  serviceDateRange: null,
}

const SERVICE_DATE_RANGE_VALUES: ReadonlyArray<ServiceDateRangePreset> = [
  'today',
  'this_week',
  'next_30d',
]

function isServiceDateRangePreset(v: unknown): v is ServiceDateRangePreset {
  return (
    typeof v === 'string' &&
    (SERVICE_DATE_RANGE_VALUES as ReadonlyArray<string>).includes(v)
  )
}

type ChipDimension = Exclude<
  keyof BookingsFilters,
  'showPast' | 'serviceDateRange'
>

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
    // landr-68a9 — preset parser is strict (enum-or-null) so a corrupted
    // stored value falls back to "no constraint" rather than throwing.
    if (
      parsed?.serviceDateRange === null ||
      isServiceDateRangePreset(parsed?.serviceDateRange)
    ) {
      out.serviceDateRange = parsed.serviceDateRange ?? null
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
  /** landr-68a9 — apply (or clear) the service-date preset. */
  setServiceDateRange: (value: ServiceDateRangePreset | null) => void
}

export type UseBookingsFiltersOptions = {
  /**
   * landr-j57l — when provided, this value seeds the initial state instead
   * of reading from localStorage. Used by routes that hydrate from URL
   * params on mount so a `?status=…&product=…` link wins over whatever was
   * last stored. Subsequent toggles still persist to localStorage as usual
   * (so leaving + returning without the URL params keeps the link's view).
   * Captured once via the useState initializer — later changes to this
   * reference do not re-run the hydration.
   */
  initialOverride?: BookingsFilters | null
}

/**
 * Per-user filter hook. Reads/writes localStorage keyed on the auth user id.
 * When no user is signed in we fall back to an in-memory state (no persist).
 */
export function useBookingsFilters(
  options: UseBookingsFiltersOptions = {},
): UseBookingsFilters {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Lazy init keyed on userId so a different account on the same browser
  // starts from its own stored state. landr-j57l — when an `initialOverride`
  // (URL-derived) is passed, it wins over localStorage so deep-links round-
  // trip predictably. The override is captured once via the useState
  // initializer; later changes to options.initialOverride are not
  // re-applied (the route writes back to the URL on user interaction).
  const [filters, setFiltersState] = useState<BookingsFilters>(() => {
    const override = options.initialOverride ?? null
    if (override) {
      // Persist the override so a same-user reload (without the URL params)
      // still shows the deep-linked view — matches the localStorage-is-
      // memory expectation users already have from landr-1lj.
      if (userId) writeStored(userId, override)
      return override
    }
    return userId ? readStored(userId) : EMPTY_FILTERS
  })

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

  const setServiceDateRange = useCallback(
    (value: ServiceDateRangePreset | null) => {
      setFiltersState((current) => {
        if (current.serviceDateRange === value) return current
        const next: BookingsFilters = { ...current, serviceDateRange: value }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  return useMemo(
    () => ({
      filters,
      setFilters,
      toggle,
      clearDimension,
      clearAll,
      setShowPast,
      setServiceDateRange,
    }),
    [
      filters,
      setFilters,
      toggle,
      clearDimension,
      clearAll,
      setShowPast,
      setServiceDateRange,
    ],
  )
}

// ──────────────────────────────────────────────────────────────────────
// landr-j57l — URL ⇄ filters serialization
//
// URL param shape (all optional):
//   ?status=<csv>      booking_lifecycle_stages.code values
//   ?product=<csv>     products.id values
//   ?location=<csv>    locations.id values
//   ?kind=<csv>        product_kind enum values
//   ?shape=<csv>       service_time_shape enum values
//   ?dateRange=<enum>  today | this_week | next_30d
//   ?past=1            include past bookings (showPast view toggle)
//
// CSV values are deduped + empty entries dropped. Unknown enum values
// (kind/shape/dateRange) are silently rejected — the URL is treated as
// untrusted user input, never as a schema oracle.
// ──────────────────────────────────────────────────────────────────────

const PRODUCT_KIND_VALUES = [
  'service',
  'digital_good',
  'physical_good',
  'gift_card',
] as const
const SERVICE_TIME_SHAPE_VALUES = [
  'single_date',
  'days_range',
  'fixed_window',
  'time_slot',
] as const

function parseCsv(raw: string | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function parseEnumCsv<T extends string>(
  raw: string | null,
  allowed: ReadonlyArray<T>,
): T[] {
  const allow = new Set<string>(allowed)
  return parseCsv(raw).filter((v): v is T => allow.has(v))
}

function parseBool(raw: string | null): boolean {
  // Accept `1` / `true` (case-insensitive). Everything else (including
  // `0`/`false`/missing) parses as false so the URL stays compact when
  // the toggle is in its default position.
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true'
}

/**
 * landr-j57l — parse a URLSearchParams into a BookingsFilters value. All
 * dimensions are optional; missing keys map to EMPTY_FILTERS defaults.
 * Returns null when the URL carries no relevant filter params, so the
 * caller can fall through to the localStorage-backed default.
 */
export function parseBookingsFiltersFromUrl(
  params: URLSearchParams,
): BookingsFilters | null {
  const hasAny =
    params.has('status') ||
    params.has('product') ||
    params.has('location') ||
    params.has('kind') ||
    params.has('shape') ||
    params.has('dateRange') ||
    params.has('past')
  if (!hasAny) return null

  const dateRangeRaw = params.get('dateRange')
  const serviceDateRange: ServiceDateRangePreset | null =
    dateRangeRaw && isServiceDateRangePreset(dateRangeRaw)
      ? dateRangeRaw
      : null

  return {
    lifecycleStates: parseCsv(params.get('status')),
    productIds: parseCsv(params.get('product')),
    pickupLocationIds: parseCsv(params.get('location')),
    productKinds: parseEnumCsv(params.get('kind'), PRODUCT_KIND_VALUES),
    serviceTimeShapes: parseEnumCsv(
      params.get('shape'),
      SERVICE_TIME_SHAPE_VALUES,
    ),
    showPast: parseBool(params.get('past')),
    serviceDateRange,
  }
}

/**
 * landr-j57l — apply a BookingsFilters value to a URLSearchParams. Mutates
 * `params` in place: sets each dimension key when non-empty, deletes it
 * when empty so the URL stays compact (no `?status=&product=` noise).
 * Returns true when any key was added/removed/changed, so the caller can
 * skip the setSearchParams write when nothing moved (avoids router thrash).
 */
export function serialiseBookingsFiltersToUrl(
  params: URLSearchParams,
  filters: BookingsFilters,
): boolean {
  let dirty = false

  const csvFields: Array<[string, readonly string[]]> = [
    ['status', filters.lifecycleStates],
    ['product', filters.productIds],
    ['location', filters.pickupLocationIds],
    ['kind', filters.productKinds],
    ['shape', filters.serviceTimeShapes],
  ]
  for (const [key, values] of csvFields) {
    if (values.length > 0) {
      const next = values.join(',')
      if (params.get(key) !== next) {
        params.set(key, next)
        dirty = true
      }
    } else if (params.has(key)) {
      params.delete(key)
      dirty = true
    }
  }

  if (filters.serviceDateRange) {
    if (params.get('dateRange') !== filters.serviceDateRange) {
      params.set('dateRange', filters.serviceDateRange)
      dirty = true
    }
  } else if (params.has('dateRange')) {
    params.delete('dateRange')
    dirty = true
  }

  if (filters.showPast) {
    if (params.get('past') !== '1') {
      params.set('past', '1')
      dirty = true
    }
  } else if (params.has('past')) {
    params.delete('past')
    dirty = true
  }

  return dirty
}
