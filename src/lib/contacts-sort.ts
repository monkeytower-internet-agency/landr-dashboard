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

export const DEFAULT_CONTACTS_SORT: ContactsSort = 'created_at_desc'

const VALID_SORTS: ReadonlyArray<ContactsSort> = [
  'created_at_desc',
  'updated_at_desc',
  'name_asc',
]

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

/**
 * Restore-and-persist the contacts sort per user. When no user is signed
 * in we use an in-memory fallback (no persist) so the dropdown still works
 * on the login screen edge case.
 */
export function useContactsSort(): UseContactsSort {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [sort, setSortState] = useState<ContactsSort>(() =>
    userId ? readStored(userId) : DEFAULT_CONTACTS_SORT,
  )

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
