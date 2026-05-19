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
}

export const EMPTY_FILTERS: ContactsFilters = { types: [] }

export function storageKey(userId: string): string {
  return `landr.dashboard.contactsFilters.${userId}`
}

export function isEmptyFilters(f: ContactsFilters): boolean {
  return f.types.length === 0
}

export function activeFilterCount(f: ContactsFilters): number {
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
    return { types }
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
  clearAll: () => void
}

/**
 * Per-user contact-type filter hook. Keyed on the auth user id so the
 * same browser distinguishes accounts; falls back to in-memory state
 * when no user is signed in.
 */
export function useContactsFilters(): UseContactsFilters {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [filters, setFiltersState] = useState<ContactsFilters>(() =>
    userId ? readStored(userId) : EMPTY_FILTERS,
  )

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

  const clearAll = useCallback(() => {
    setFiltersState(EMPTY_FILTERS)
    if (userId) writeStored(userId, EMPTY_FILTERS)
  }, [userId])

  return useMemo(
    () => ({ filters, setFilters, toggleType, clearAll }),
    [filters, setFilters, toggleType, clearAll],
  )
}
