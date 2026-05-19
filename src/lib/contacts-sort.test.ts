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
})
