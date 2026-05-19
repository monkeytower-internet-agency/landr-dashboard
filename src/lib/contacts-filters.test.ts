// landr-pqk — per-user contact-type chip filter persistence.

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
  EMPTY_FILTERS,
  activeFilterCount,
  isEmptyFilters,
  storageKey,
  useContactsFilters,
} from './contacts-filters'

beforeEach(() => {
  window.localStorage.clear()
  authState.userId = 'user-1'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useContactsFilters', () => {
  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useContactsFilters())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
    expect(activeFilterCount(result.current.filters)).toBe(0)
    expect(result.current.filters).toEqual(EMPTY_FILTERS)
  })

  it('toggleType adds, then removes, a type from the selection', () => {
    const { result } = renderHook(() => useContactsFilters())

    act(() => result.current.toggleType('customer'))
    act(() => result.current.toggleType('employee'))
    expect(result.current.filters.types.sort()).toEqual([
      'customer',
      'employee',
    ])

    act(() => result.current.toggleType('customer'))
    expect(result.current.filters.types).toEqual(['employee'])
  })

  it('persists toggled selections to localStorage under the user key', () => {
    const { result } = renderHook(() => useContactsFilters())
    act(() => result.current.toggleType('attendee'))

    const raw = window.localStorage.getItem(storageKey('user-1'))
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ types: ['attendee'] })
  })

  it('restores stored types on a fresh mount for the same user', () => {
    window.localStorage.setItem(
      storageKey('user-1'),
      JSON.stringify({ types: ['employee', 'agent'] }),
    )
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.filters.types.sort()).toEqual(['agent', 'employee'])
    expect(activeFilterCount(result.current.filters)).toBe(2)
  })

  it('drops unknown type values from storage to stay forward-compatible', () => {
    window.localStorage.setItem(
      storageKey('user-1'),
      JSON.stringify({ types: ['customer', 'bogus', 42, null] }),
    )
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.filters.types).toEqual(['customer'])
  })

  it('isolates state between users on the same browser', () => {
    const first = renderHook(() => useContactsFilters())
    act(() => first.result.current.toggleType('customer'))

    authState.userId = 'user-2'
    const second = renderHook(() => useContactsFilters())
    expect(second.result.current.filters.types).toEqual([])

    act(() => second.result.current.toggleType('agent'))

    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-1'))!).types,
    ).toEqual(['customer'])
    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-2'))!).types,
    ).toEqual(['agent'])
  })

  it('clearAll wipes the selection and persists the empty state', () => {
    const { result } = renderHook(() => useContactsFilters())
    act(() => result.current.toggleType('customer'))
    act(() => result.current.toggleType('attendee'))
    expect(activeFilterCount(result.current.filters)).toBe(2)

    act(() => result.current.clearAll())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-1'))!),
    ).toEqual({ types: [] })
  })

  it('tolerates malformed JSON in storage without throwing', () => {
    window.localStorage.setItem(storageKey('user-1'), '{not json}')
    const { result } = renderHook(() => useContactsFilters())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
  })
})
