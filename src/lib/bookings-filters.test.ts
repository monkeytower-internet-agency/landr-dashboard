// landr-1lj — verifies per-user persistence + isolation of the filter
// chips state. We mock useAuth so the test can flip users on demand.

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
  activeFilterCount,
  isEmptyFilters,
  storageKey,
  useBookingsFilters,
} from './bookings-filters'

beforeEach(() => {
  window.localStorage.clear()
  authState.userId = 'user-1'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useBookingsFilters', () => {
  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useBookingsFilters())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
    expect(activeFilterCount(result.current.filters)).toBe(0)
  })

  it('persists a toggled selection to localStorage under the user key', () => {
    const { result } = renderHook(() => useBookingsFilters())

    act(() => result.current.toggle('lifecycleStates', 'confirmed_paid'))
    act(() => result.current.toggle('productIds', 'p-1'))

    expect(result.current.filters.lifecycleStates).toEqual(['confirmed_paid'])
    expect(result.current.filters.productIds).toEqual(['p-1'])

    const raw = window.localStorage.getItem(storageKey('user-1'))
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.lifecycleStates).toEqual(['confirmed_paid'])
    expect(parsed.productIds).toEqual(['p-1'])
  })

  it('restores state on a fresh mount for the same user', () => {
    window.localStorage.setItem(
      storageKey('user-1'),
      JSON.stringify({
        lifecycleStates: ['cancelled'],
        productIds: [],
        pickupLocationIds: ['loc-7'],
        productKinds: ['service'],
        serviceTimeShapes: ['days_range'],
      }),
    )

    const { result } = renderHook(() => useBookingsFilters())
    expect(result.current.filters.lifecycleStates).toEqual(['cancelled'])
    expect(result.current.filters.pickupLocationIds).toEqual(['loc-7'])
    expect(result.current.filters.productKinds).toEqual(['service'])
    expect(result.current.filters.serviceTimeShapes).toEqual(['days_range'])
    expect(activeFilterCount(result.current.filters)).toBe(4)
  })

  it('isolates state between users on the same browser', () => {
    // user-1 stores something.
    const first = renderHook(() => useBookingsFilters())
    act(() => first.result.current.toggle('lifecycleStates', 'pending'))

    // Different user mounts — should NOT see user-1's chips.
    authState.userId = 'user-2'
    const second = renderHook(() => useBookingsFilters())
    expect(second.result.current.filters.lifecycleStates).toEqual([])

    // user-2 stores their own selection.
    act(() => second.result.current.toggle('productKinds', 'gift_card'))

    // Storage for both users coexists.
    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-1'))!)
        .lifecycleStates,
    ).toEqual(['pending'])
    expect(
      JSON.parse(window.localStorage.getItem(storageKey('user-2'))!)
        .productKinds,
    ).toEqual(['gift_card'])
  })

  it('toggle adds then removes a value within a dimension', () => {
    const { result } = renderHook(() => useBookingsFilters())
    act(() => result.current.toggle('productIds', 'p-1'))
    act(() => result.current.toggle('productIds', 'p-2'))
    expect(result.current.filters.productIds.sort()).toEqual(['p-1', 'p-2'])

    act(() => result.current.toggle('productIds', 'p-1'))
    expect(result.current.filters.productIds).toEqual(['p-2'])
  })

  it('clearAll wipes every dimension', () => {
    const { result } = renderHook(() => useBookingsFilters())
    act(() => result.current.toggle('lifecycleStates', 'pending'))
    act(() => result.current.toggle('productKinds', 'service'))

    expect(activeFilterCount(result.current.filters)).toBe(2)

    act(() => result.current.clearAll())
    expect(isEmptyFilters(result.current.filters)).toBe(true)

    const raw = window.localStorage.getItem(storageKey('user-1'))
    expect(JSON.parse(raw!)).toEqual({
      lifecycleStates: [],
      productIds: [],
      pickupLocationIds: [],
      productKinds: [],
      serviceTimeShapes: [],
    })
  })

  it('clearDimension empties only that dimension', () => {
    const { result } = renderHook(() => useBookingsFilters())
    act(() => result.current.toggle('lifecycleStates', 'pending'))
    act(() => result.current.toggle('productKinds', 'service'))

    act(() => result.current.clearDimension('lifecycleStates'))
    expect(result.current.filters.lifecycleStates).toEqual([])
    expect(result.current.filters.productKinds).toEqual(['service'])
  })

  it('tolerates malformed stored JSON without throwing', () => {
    window.localStorage.setItem(storageKey('user-1'), 'not valid json')
    const { result } = renderHook(() => useBookingsFilters())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
  })
})
