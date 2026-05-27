// landr-pugm — per-user product_kind chip filter persistence.

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
  useProductsFilters,
} from './products-filters'

beforeEach(() => {
  window.localStorage.clear()
  authState.userId = 'user-1'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useProductsFilters', () => {
  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useProductsFilters())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
    expect(activeFilterCount(result.current.filters)).toBe(0)
    expect(result.current.filters).toEqual(EMPTY_FILTERS)
  })

  it('toggleKind adds, then removes, a kind from the selection', () => {
    const { result } = renderHook(() => useProductsFilters())

    act(() => result.current.toggleKind('service'))
    act(() => result.current.toggleKind('subscription'))
    expect(result.current.filters.kinds.slice().sort()).toEqual([
      'service',
      'subscription',
    ])

    act(() => result.current.toggleKind('service'))
    expect(result.current.filters.kinds).toEqual(['subscription'])
  })

  it('persists toggled selections to localStorage under the user key', () => {
    const { result } = renderHook(() => useProductsFilters())
    act(() => result.current.toggleKind('hotel_room'))

    const raw = window.localStorage.getItem(storageKey('user-1'))
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ kinds: ['hotel_room'] })
  })

  it('restores stored kinds on a fresh mount for the same user', () => {
    window.localStorage.setItem(
      storageKey('user-1'),
      JSON.stringify({ kinds: ['service', 'gift_card'] }),
    )
    const { result } = renderHook(() => useProductsFilters())
    expect(result.current.filters.kinds.slice().sort()).toEqual([
      'gift_card',
      'service',
    ])
    expect(activeFilterCount(result.current.filters)).toBe(2)
  })

  it('drops unknown kind values from storage to stay forward-compatible', () => {
    window.localStorage.setItem(
      storageKey('user-1'),
      JSON.stringify({ kinds: ['service', 'bogus', 42, null] }),
    )
    const { result } = renderHook(() => useProductsFilters())
    expect(result.current.filters.kinds).toEqual(['service'])
  })

  it('isolates state between users on the same browser', () => {
    const first = renderHook(() => useProductsFilters())
    act(() => first.result.current.toggleKind('service'))

    authState.userId = 'user-2'
    const second = renderHook(() => useProductsFilters())
    expect(second.result.current.filters.kinds).toEqual([])

    act(() => second.result.current.toggleKind('subscription'))

    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-1'))!).kinds,
    ).toEqual(['service'])
    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-2'))!).kinds,
    ).toEqual(['subscription'])
  })

  it('clearAll wipes the selection and persists the empty state', () => {
    const { result } = renderHook(() => useProductsFilters())
    act(() => result.current.toggleKind('service'))
    act(() => result.current.toggleKind('hotel_room'))
    expect(activeFilterCount(result.current.filters)).toBe(2)

    act(() => result.current.clearAll())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-1'))!),
    ).toEqual({ kinds: [] })
  })

  it('tolerates malformed JSON in storage without throwing', () => {
    window.localStorage.setItem(storageKey('user-1'), '{not json}')
    const { result } = renderHook(() => useProductsFilters())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
  })
})
