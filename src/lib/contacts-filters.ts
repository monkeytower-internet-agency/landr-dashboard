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

export type ContactsFilters = {
  /** Subset of CONTACT_TYPES; empty = match all. */
  types: ContactType[]
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
  includeErased: false,
}

export function storageKey(userId: string): string {
  return `landr.dashboard.contactsFilters.${userId}`
}

export function isEmptyFilters(f: ContactsFilters): boolean {
  return f.types.length === 0 && !f.includeErased
}

export function activeFilterCount(f: ContactsFilters): number {
  // landr-dp45 — `includeErased` is a view toggle, not a filter chip.
  // Don't count it so the "Clear filters" affordance only appears when
  // a real type chip is active (matches landr-pqk semantics).
  return f.types.length
}

function isContactType(v: unknown): v is ContactType {
  return (
    typeof v === 'string' &&
    (CONTACT_TYPES as ReadonlyArray<string>).includes(v)
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
    const includeErased =
      typeof parsed?.includeErased === 'boolean' ? parsed.includeErased : false
    return { types, includeErased }
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
    () => ({ filters, setFilters, toggleType, setIncludeErased, clearAll }),
    [filters, setFilters, toggleType, setIncludeErased, clearAll],
  )
}

// ──────────────────────────────────────────────────────────────────────
// landr-j57l — URL ⇄ filters serialization
//
// URL param shape (all optional):
//   ?type=<csv>     contact type values (customer/attendee/employee/agent)
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
  if (!params.has('type') && !params.has('erased')) return null
  const types = parseCsv(params.get('type')).filter(isContactType)
  const includeErased = parseBool(params.get('erased'))
  return { types, includeErased }
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
