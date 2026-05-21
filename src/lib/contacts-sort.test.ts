// landr-pqk — per-user persistence of the contacts list sort mode.

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = {
  userId: 'user-1' as string | null,
}

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: authState.userId ? { id: authState.userId } : null,
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}))

import {
  DEFAULT_CONTACTS_SORT,
  parseContactsSortFromUrl,
  serialiseContactsSortToUrl,
  storageKey,
  useContactsSort,
} from './contacts-sort'

beforeEach(() => {
  window.localStorage.clear()
  authState.userId = 'user-1'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useContactsSort', () => {
  it('defaults to Recently added when no preference is stored', () => {
    const { result } = renderHook(() => useContactsSort())
    expect(result.current.sort).toBe(DEFAULT_CONTACTS_SORT)
    expect(result.current.sort).toBe('created_at_desc')
  })

  it('persists a new sort selection to localStorage under the user key', () => {
    const { result } = renderHook(() => useContactsSort())
    act(() => result.current.setSort('updated_at_desc'))
    expect(result.current.sort).toBe('updated_at_desc')
    expect(window.localStorage.getItem(storageKey('user-1'))).toBe(
      'updated_at_desc',
    )
  })

  it('restores a stored value on a fresh mount for the same user', () => {
    window.localStorage.setItem(storageKey('user-1'), 'name_asc')
    const { result } = renderHook(() => useContactsSort())
    expect(result.current.sort).toBe('name_asc')
  })

  it('falls back to the default when stored value is garbage', () => {
    window.localStorage.setItem(storageKey('user-1'), 'nonsense_sort_mode')
    const { result } = renderHook(() => useContactsSort())
    expect(result.current.sort).toBe(DEFAULT_CONTACTS_SORT)
  })

  it('isolates state between users on the same browser', () => {
    const first = renderHook(() => useContactsSort())
    act(() => first.result.current.setSort('name_asc'))

    authState.userId = 'user-2'
    const second = renderHook(() => useContactsSort())
    // user-2 sees the default, not user-1's selection
    expect(second.result.current.sort).toBe(DEFAULT_CONTACTS_SORT)

    act(() => second.result.current.setSort('updated_at_desc'))

    // Both selections coexist in storage
    expect(window.localStorage.getItem(storageKey('user-1'))).toBe('name_asc')
    expect(window.localStorage.getItem(storageKey('user-2'))).toBe(
      'updated_at_desc',
    )
  })

  // ----- landr-j57l — URL parse/serialise + initialOverride ------------
  describe('URL round-trip (landr-j57l)', () => {
    it('parseContactsSortFromUrl returns null on missing/invalid', () => {
      expect(parseContactsSortFromUrl(new URLSearchParams(''))).toBeNull()
      expect(
        parseContactsSortFromUrl(new URLSearchParams('?sort=bogus')),
      ).toBeNull()
    })

    it('parses each valid sort value', () => {
      expect(
        parseContactsSortFromUrl(new URLSearchParams('?sort=name_asc')),
      ).toBe('name_asc')
      expect(
        parseContactsSortFromUrl(new URLSearchParams('?sort=updated_at_desc')),
      ).toBe('updated_at_desc')
    })

    it('serialise omits the default sort to keep the URL short', () => {
      const params = new URLSearchParams('?sort=name_asc')
      const dirty = serialiseContactsSortToUrl(params, DEFAULT_CONTACTS_SORT)
      expect(dirty).toBe(true)
      expect(params.has('sort')).toBe(false)
    })

    it('serialise writes a non-default sort', () => {
      const params = new URLSearchParams()
      const dirty = serialiseContactsSortToUrl(params, 'name_asc')
      expect(dirty).toBe(true)
      expect(params.get('sort')).toBe('name_asc')
    })

    it('serialise is a no-op when URL already matches', () => {
      const params = new URLSearchParams('?sort=name_asc')
      expect(serialiseContactsSortToUrl(params, 'name_asc')).toBe(false)
    })

    it('initialOverride wins over localStorage on first mount', () => {
      window.localStorage.setItem(storageKey('user-1'), 'updated_at_desc')
      const { result } = renderHook(() =>
        useContactsSort({ initialOverride: 'name_asc' }),
      )
      expect(result.current.sort).toBe('name_asc')
      // Persisted so a reload-without-URL still reflects the deep-link.
      expect(window.localStorage.getItem(storageKey('user-1'))).toBe('name_asc')
    })

    it('with no override, falls back to localStorage as before', () => {
      window.localStorage.setItem(storageKey('user-1'), 'name_asc')
      const { result } = renderHook(() =>
        useContactsSort({ initialOverride: null }),
      )
      expect(result.current.sort).toBe('name_asc')
    })
  })
})
