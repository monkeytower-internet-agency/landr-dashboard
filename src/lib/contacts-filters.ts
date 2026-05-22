// landr-pqk — per-user contact-type filter state.
//
// Mirrors useBookingsFilters (landr-1lj): single dimension (`types`)
// with chip-style multi-select, persisted under
// `landr.dashboard.contactsFilters.<userId>` so reloads pick up where
// the user left off without leaking between accounts.
//
// Types are DERIVED on the API side (view `contacts_with_types`):
//   customer / attendee / employee / agent
//
// Empty `types` array means "show everything". Selecting multiple values
// is OR-within-dimension (union) — see fetchContacts in @/lib/contacts.
//
// landr-j57l — the primary filter dimension also round-trips through the
// URL (`?type=…&erased=1`) so a filtered view is shareable. Parse/serialise
// helpers are at the bottom of this module; routes pass URL-parsed values
// to `useContactsFilters({ initialOverride })` (URL > localStorage on first
// load). Sort lives in useContactsSort and gets `?sort=` via its own
// override hook option.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'

export const CONTACT_TYPES = [
  'customer',
  'attendee',
  'employee',
  'agent',
] as const

export type ContactType = (typeof CONTACT_TYPES)[number]

// landr-6993 — booking-window chip filter dimension. Operators want to
// answer "who's got a booking today?" or "anyone with a future booking?"
// without scanning the whole list. Empty array = no booking-window filter
// applied (default). Selecting both is a UNION (rows that match EITHER
// window pass).
export const CONTACT_BOOKING_WINDOWS = ['today', 'future'] as const

export type ContactBookingWindow = (typeof CONTACT_BOOKING_WINDOWS)[number]

export type ContactsFilters = {
  /** Subset of CONTACT_TYPES; empty = match all. */
  types: ContactType[]
  /**
   * landr-6993 — booking-window chips ('today' / 'future'). Empty array
   * means no booking-window filter is applied. The match runs client-side
   * over each row's `next_booking_date`, supplied by the parallel
   * fetchUpcomingBookingsByContact query.
   */
  bookingWindows: ContactBookingWindow[]
  /**
   * landr-dp45 — when true, GDPR-erased tombstones are included in the
   * fetched list. Default false. Persisted alongside `types` so the
   * setting survives reloads without needing a storage-shape version bump
   * (older payloads simply default to false via the parser below).
   */
  includeErased: boolean
}

export const EMPTY_FILTERS: ContactsFilters = {
  types: [],
  bookingWindows: [],
  includeErased: false,
}

export function storageKey(userId: string): string {
  return `landr.dashboard.contactsFilters.${userId}`
}

export function isEmptyFilters(f: ContactsFilters): boolean {
  return (
    f.types.length === 0 &&
    f.bookingWindows.length === 0 &&
    !f.includeErased
  )
}

export function activeFilterCount(f: ContactsFilters): number {
  // landr-dp45 — `includeErased` is a view toggle, not a filter chip.
  // Don't count it so the "Clear filters" affordance only appears when
  // a real type chip is active (matches landr-pqk semantics).
  // landr-6993 — booking-window chips count the same as type chips so
  // selecting "Has booking today" by itself still surfaces "Clear filters".
  return f.types.length + f.bookingWindows.length
}

function isContactType(v: unknown): v is ContactType {
  return (
    typeof v === 'string' &&
    (CONTACT_TYPES as ReadonlyArray<string>).includes(v)
  )
}

function isContactBookingWindow(v: unknown): v is ContactBookingWindow {
  return (
    typeof v === 'string' &&
    (CONTACT_BOOKING_WINDOWS as ReadonlyArray<string>).includes(v)
  )
}

function readStored(userId: string): ContactsFilters {
  if (typeof window === 'undefined') return EMPTY_FILTERS
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY_FILTERS
    const parsed = JSON.parse(raw) as Partial<ContactsFilters>
    const types = Array.isArray(parsed?.types)
      ? parsed.types.filter(isContactType)
      : []
    // landr-6993 — legacy payloads (pre booking-window chips) won't have
    // this key; default to empty so they still hydrate without error.
    const bookingWindows = Array.isArray(parsed?.bookingWindows)
      ? parsed.bookingWindows.filter(isContactBookingWindow)
      : []
    const includeErased =
      typeof parsed?.includeErased === 'boolean' ? parsed.includeErased : false
    return { types, bookingWindows, includeErased }
  } catch {
    return EMPTY_FILTERS
  }
}

function writeStored(userId: string, value: ContactsFilters): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(value))
  } catch {
    /* localStorage may be unavailable or full — fail silently. */
  }
}

export type UseContactsFilters = {
  filters: ContactsFilters
  setFilters: (next: ContactsFilters) => void
  toggleType: (value: ContactType) => void
  /** landr-6993 — flip a booking-window chip ('today' / 'future'). */
  toggleBookingWindow: (value: ContactBookingWindow) => void
  /** landr-dp45 — flip the "Show erased contacts" view toggle. */
  setIncludeErased: (value: boolean) => void
  clearAll: () => void
}

export type UseContactsFiltersOptions = {
  /**
   * landr-j57l — when provided, this value seeds the initial state instead
   * of reading from localStorage. Used by Contacts.tsx to hydrate from
   * `?type=…&erased=…` URL params on mount so a deep-link wins over
   * whatever was last stored. Captured once via the useState initializer;
   * subsequent reference changes are not re-applied (the route is the
   * source of URL → state hydration after that point).
   */
  initialOverride?: ContactsFilters | null
}

/**
 * Per-user contact-type filter hook. Keyed on the auth user id so the
 * same browser distinguishes accounts; falls back to in-memory state
 * when no user is signed in.
 */
export function useContactsFilters(
  options: UseContactsFiltersOptions = {},
): UseContactsFilters {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // landr-j57l — `initialOverride` (URL-derived) takes priority over the
  // localStorage default on first mount, and we eagerly persist it so a
  // same-user reload without the URL params still reflects the deep-link.
  // Captured once via the useState initializer.
  const [filters, setFiltersState] = useState<ContactsFilters>(() => {
    const override = options.initialOverride ?? null
    if (override) {
      if (userId) writeStored(userId, override)
      return override
    }
    return userId ? readStored(userId) : EMPTY_FILTERS
  })

  const lastUserRef = useRef<string | null>(userId)
  useEffect(() => {
    if (lastUserRef.current === userId) return
    lastUserRef.current = userId
    setFiltersState(userId ? readStored(userId) : EMPTY_FILTERS)
  }, [userId])

  const setFilters = useCallback(
    (next: ContactsFilters) => {
      setFiltersState(next)
      if (userId) writeStored(userId, next)
    },
    [userId],
  )

  const toggleType = useCallback(
    (value: ContactType) => {
      setFiltersState((current) => {
        const exists = current.types.includes(value)
        const next: ContactsFilters = {
          ...current,
          types: exists
            ? current.types.filter((t) => t !== value)
            : [...current.types, value],
        }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  const toggleBookingWindow = useCallback(
    (value: ContactBookingWindow) => {
      setFiltersState((current) => {
        const exists = current.bookingWindows.includes(value)
        const next: ContactsFilters = {
          ...current,
          bookingWindows: exists
            ? current.bookingWindows.filter((w) => w !== value)
            : [...current.bookingWindows, value],
        }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  const setIncludeErased = useCallback(
    (value: boolean) => {
      setFiltersState((current) => {
        if (current.includeErased === value) return current
        const next: ContactsFilters = { ...current, includeErased: value }
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
    () => ({
      filters,
      setFilters,
      toggleType,
      toggleBookingWindow,
      setIncludeErased,
      clearAll,
    }),
    [
      filters,
      setFilters,
      toggleType,
      toggleBookingWindow,
      setIncludeErased,
      clearAll,
    ],
  )
}

// ──────────────────────────────────────────────────────────────────────
// landr-j57l — URL ⇄ filters serialization
//
// URL param shape (all optional):
//   ?type=<csv>     contact type values (customer/attendee/employee/agent)
//   ?bw=<csv>       booking-window chips (today/future) — landr-6993
//   ?erased=1       include GDPR-erased tombstones (includeErased toggle)
//
// Unknown type values are silently dropped (forward-compat with future
// derived types). Sort lives in useContactsSort and uses ?sort= separately.
// ──────────────────────────────────────────────────────────────────────

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

function parseBool(raw: string | null): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true'
}

/**
 * landr-j57l — parse a URLSearchParams into a ContactsFilters value.
 * Returns null when no relevant param is present so the caller falls
 * back to the localStorage-backed default.
 */
export function parseContactsFiltersFromUrl(
  params: URLSearchParams,
): ContactsFilters | null {
  if (!params.has('type') && !params.has('bw') && !params.has('erased')) {
    return null
  }
  const types = parseCsv(params.get('type')).filter(isContactType)
  const bookingWindows = parseCsv(params.get('bw')).filter(
    isContactBookingWindow,
  )
  const includeErased = parseBool(params.get('erased'))
  return { types, bookingWindows, includeErased }
}

/**
 * landr-j57l — apply a ContactsFilters value to a URLSearchParams.
 * Mutates `params` in place and returns true when anything changed so
 * the caller can skip an unnecessary setSearchParams write.
 */
export function serialiseContactsFiltersToUrl(
  params: URLSearchParams,
  filters: ContactsFilters,
): boolean {
  let dirty = false
  if (filters.types.length > 0) {
    const next = filters.types.join(',')
    if (params.get('type') !== next) {
      params.set('type', next)
      dirty = true
    }
  } else if (params.has('type')) {
    params.delete('type')
    dirty = true
  }
  // landr-6993 — `?bw=today,future` round-trip for the booking-window chips.
  if (filters.bookingWindows.length > 0) {
    const next = filters.bookingWindows.join(',')
    if (params.get('bw') !== next) {
      params.set('bw', next)
      dirty = true
    }
  } else if (params.has('bw')) {
    params.delete('bw')
    dirty = true
  }
  if (filters.includeErased) {
    if (params.get('erased') !== '1') {
      params.set('erased', '1')
      dirty = true
    }
  } else if (params.has('erased')) {
    params.delete('erased')
    dirty = true
  }
  return dirty
}

// ──────────────────────────────────────────────────────────────────────
// landr-6993 — booking-window client-side filter
//
// `bookingWindows` is applied client-side because it depends on the
// merged-in `next_booking_date` field, which the contacts query itself
// doesn't know about (fetched via fetchUpcomingBookingsByContact).
// Empty selection = pass-through (don't narrow the result).
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns true if the row's `next_booking_date` matches at least one of
 * the selected booking-window chips. Empty `bookingWindows` always passes.
 * `today` defaults to the local-clock today (YYYY-MM-DD).
 */
export function matchesBookingWindowFilter(
  nextBookingDate: string | null | undefined,
  bookingWindows: ContactBookingWindow[],
  today: string,
): boolean {
  if (bookingWindows.length === 0) return true
  const d = nextBookingDate ?? null
  if (!d) return false
  if (bookingWindows.includes('today') && d === today) return true
  if (bookingWindows.includes('future') && d > today) return true
  return false
}
