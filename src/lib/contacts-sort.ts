// landr-pqk — per-user sort preference for the Contacts list.
//
// Persisted under `landr.dashboard.contactsSort.<userId>` so a reload
// picks up where the user left off and a different account on the same
// browser starts from its own preference (mirroring useBookingsFilters
// from landr-1lj).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'

/** Sort modes offered on the contacts list page. */
export type ContactsSort =
  | 'created_at_desc' // Recently added (default)
  | 'updated_at_desc' // Recently changed
  | 'name_asc' // Alphabetical (last_name ASC + first_name ASC)
  | 'next_booking_asc' // landr-6993 — Next booking date (nulls last)

export const DEFAULT_CONTACTS_SORT: ContactsSort = 'created_at_desc'

const VALID_SORTS: ReadonlyArray<ContactsSort> = [
  'created_at_desc',
  'updated_at_desc',
  'name_asc',
  'next_booking_asc',
]

/**
 * landr-6993 — `next_booking_asc` is applied CLIENT-SIDE because
 * `next_booking_date` is not a column on `contacts_with_types` — it's
 * derived by zipping in the parallel fetchUpcomingBookingsByContact
 * query. fetchContacts maps this sort key to a stable server-side
 * fallback (created_at DESC) so the order is deterministic before the
 * client re-sorts.
 */
export function isClientSideSort(sort: ContactsSort): boolean {
  return sort === 'next_booking_asc'
}

/**
 * landr-6993 — comparator that sorts rows by `next_booking_date` ASC
 * (nearest-future first), with nulls/undefined pushed to the end. Stable
 * via the secondary key on `id` so re-sorts don't shuffle equal rows.
 * Exported for re-use by the route + unit tests; the route applies it
 * over the already-merged row set.
 */
export function compareNextBookingAsc<
  T extends { id: string; next_booking_date?: string | null },
>(a: T, b: T): number {
  const ad = a.next_booking_date ?? null
  const bd = b.next_booking_date ?? null
  if (ad === bd) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  if (ad === null) return 1 // nulls last
  if (bd === null) return -1
  if (ad < bd) return -1
  if (ad > bd) return 1
  return 0
}

export function storageKey(userId: string): string {
  return `landr.dashboard.contactsSort.${userId}`
}

function isContactsSort(v: unknown): v is ContactsSort {
  return (
    typeof v === 'string' && (VALID_SORTS as ReadonlyArray<string>).includes(v)
  )
}

function readStored(userId: string): ContactsSort {
  if (typeof window === 'undefined') return DEFAULT_CONTACTS_SORT
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (isContactsSort(raw)) return raw
    return DEFAULT_CONTACTS_SORT
  } catch {
    return DEFAULT_CONTACTS_SORT
  }
}

function writeStored(userId: string, value: ContactsSort): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), value)
  } catch {
    /* quota / disabled storage — silently ignore. */
  }
}

export type UseContactsSort = {
  sort: ContactsSort
  setSort: (next: ContactsSort) => void
}

export type UseContactsSortOptions = {
  /**
   * landr-j57l — initial sort to use instead of the localStorage default.
   * Captured once via the useState initializer; routes pass a URL-derived
   * value so `?sort=name_asc` wins over the persisted preference. We also
   * eagerly persist the override so reloads without the URL param show
   * the deep-linked sort.
   */
  initialOverride?: ContactsSort | null
}

/**
 * Parse a `?sort=…` value into a ContactsSort. Returns null on missing
 * or invalid input so the caller can fall through to the default. Pure
 * helper, no React deps — easy to unit-test.
 */
export function parseContactsSortFromUrl(
  params: URLSearchParams,
): ContactsSort | null {
  const raw = params.get('sort')
  return isContactsSort(raw) ? raw : null
}

/**
 * Apply a sort value to a URLSearchParams. We drop the param when the
 * value matches the default so a non-custom URL stays short. Returns
 * true when anything changed so the caller can skip a no-op write.
 */
export function serialiseContactsSortToUrl(
  params: URLSearchParams,
  sort: ContactsSort,
): boolean {
  if (sort === DEFAULT_CONTACTS_SORT) {
    if (params.has('sort')) {
      params.delete('sort')
      return true
    }
    return false
  }
  if (params.get('sort') !== sort) {
    params.set('sort', sort)
    return true
  }
  return false
}

/**
 * Restore-and-persist the contacts sort per user. When no user is signed
 * in we use an in-memory fallback (no persist) so the dropdown still works
 * on the login screen edge case.
 */
export function useContactsSort(
  options: UseContactsSortOptions = {},
): UseContactsSort {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // landr-j57l — URL override wins over localStorage on first mount and is
  // eagerly persisted so a same-user reload without the URL param still
  // reflects the deep-link. Captured once via the useState initializer.
  const [sort, setSortState] = useState<ContactsSort>(() => {
    const override = options.initialOverride ?? null
    if (override) {
      if (userId) writeStored(userId, override)
      return override
    }
    return userId ? readStored(userId) : DEFAULT_CONTACTS_SORT
  })

  const lastUserRef = useRef<string | null>(userId)
  useEffect(() => {
    if (lastUserRef.current === userId) return
    lastUserRef.current = userId
    setSortState(userId ? readStored(userId) : DEFAULT_CONTACTS_SORT)
  }, [userId])

  const setSort = useCallback(
    (next: ContactsSort) => {
      setSortState(next)
      if (userId) writeStored(userId, next)
    },
    [userId],
  )

  return useMemo(() => ({ sort, setSort }), [sort, setSort])
}
