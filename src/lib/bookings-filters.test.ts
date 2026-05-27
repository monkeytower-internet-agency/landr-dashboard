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
  EMPTY_FILTERS,
  isEmptyFilters,
  parseBookingsFiltersFromUrl,
  serialiseBookingsFiltersToUrl,
  storageKey,
  useBookingsFilters,
  type BookingsFilters,
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
      // landr-qhi0 — showPast is part of the persisted shape; clearAll
      // resets it to the default (false).
      showPast: false,
      // landr-68a9 — serviceDateRange preset; null = no date constraint.
      serviceDateRange: null,
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

  // ----- landr-qhi0 — showPast view toggle -----------------------------
  describe('showPast (landr-qhi0)', () => {
    it('defaults to false on a fresh mount', () => {
      const { result } = renderHook(() => useBookingsFilters())
      expect(result.current.filters.showPast).toBe(false)
    })

    it('setShowPast(true) persists and survives reload', () => {
      const first = renderHook(() => useBookingsFilters())
      act(() => first.result.current.setShowPast(true))
      expect(first.result.current.filters.showPast).toBe(true)

      const raw = window.localStorage.getItem(storageKey('user-1'))
      expect(JSON.parse(raw!).showPast).toBe(true)

      // Fresh mount picks up the stored value.
      const second = renderHook(() => useBookingsFilters())
      expect(second.result.current.filters.showPast).toBe(true)
    })

    it('older stored payloads without showPast default to false', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({
          lifecycleStates: ['cancelled'],
          productIds: [],
          pickupLocationIds: [],
          productKinds: [],
          serviceTimeShapes: [],
          // showPast intentionally omitted — emulates pre-qhi0 payload.
        }),
      )
      const { result } = renderHook(() => useBookingsFilters())
      expect(result.current.filters.showPast).toBe(false)
      // Chip dimensions still hydrate normally.
      expect(result.current.filters.lifecycleStates).toEqual(['cancelled'])
    })

    it('setShowPast is not reflected in activeFilterCount', () => {
      const { result } = renderHook(() => useBookingsFilters())
      act(() => result.current.setShowPast(true))
      expect(activeFilterCount(result.current.filters)).toBe(0)
      expect(isEmptyFilters(result.current.filters)).toBe(true)
    })
  })

  // ----- landr-68a9 — serviceDateRange preset --------------------------
  describe('serviceDateRange (landr-68a9)', () => {
    it('defaults to null', () => {
      const { result } = renderHook(() => useBookingsFilters())
      expect(result.current.filters.serviceDateRange).toBeNull()
    })

    it('setServiceDateRange persists and survives reload', () => {
      const first = renderHook(() => useBookingsFilters())
      act(() => first.result.current.setServiceDateRange('this_week'))
      expect(first.result.current.filters.serviceDateRange).toBe('this_week')

      const raw = window.localStorage.getItem(storageKey('user-1'))
      expect(JSON.parse(raw!).serviceDateRange).toBe('this_week')

      const second = renderHook(() => useBookingsFilters())
      expect(second.result.current.filters.serviceDateRange).toBe('this_week')
    })

    it('setServiceDateRange(null) clears the preset', () => {
      const { result } = renderHook(() => useBookingsFilters())
      act(() => result.current.setServiceDateRange('today'))
      act(() => result.current.setServiceDateRange(null))
      expect(result.current.filters.serviceDateRange).toBeNull()
    })

    it('serviceDateRange is not counted as a chip', () => {
      const { result } = renderHook(() => useBookingsFilters())
      act(() => result.current.setServiceDateRange('today'))
      expect(activeFilterCount(result.current.filters)).toBe(0)
      expect(isEmptyFilters(result.current.filters)).toBe(true)
    })

    it('rejects malformed stored values and falls back to null', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({
          lifecycleStates: [],
          productIds: [],
          pickupLocationIds: [],
          productKinds: [],
          serviceTimeShapes: [],
          showPast: false,
          serviceDateRange: 'nonsense',
        }),
      )
      const { result } = renderHook(() => useBookingsFilters())
      expect(result.current.filters.serviceDateRange).toBeNull()
    })

    it('older payloads without serviceDateRange default to null', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({
          lifecycleStates: ['cancelled'],
          productIds: [],
          pickupLocationIds: [],
          productKinds: [],
          serviceTimeShapes: [],
          // serviceDateRange intentionally omitted (pre-68a9 payload).
        }),
      )
      const { result } = renderHook(() => useBookingsFilters())
      expect(result.current.filters.serviceDateRange).toBeNull()
      expect(result.current.filters.lifecycleStates).toEqual(['cancelled'])
    })
  })

  // ----- landr-j57l — URL parse/serialise + initialOverride ------------
  describe('URL round-trip (landr-j57l)', () => {
    it('parseBookingsFiltersFromUrl returns null when no filter params present', () => {
      const out = parseBookingsFiltersFromUrl(new URLSearchParams('?open=abc'))
      expect(out).toBeNull()
    })

    it('parses status/product/location/kind/shape CSVs', () => {
      const params = new URLSearchParams(
        '?status=confirmed_paid,cancelled&product=p-1,p-2&location=loc-a&kind=service,gift_card&shape=time_slot',
      )
      const out = parseBookingsFiltersFromUrl(params)
      expect(out).not.toBeNull()
      expect(out!.lifecycleStates).toEqual(['confirmed_paid', 'cancelled'])
      expect(out!.productIds).toEqual(['p-1', 'p-2'])
      expect(out!.pickupLocationIds).toEqual(['loc-a'])
      expect(out!.productKinds).toEqual(['service', 'gift_card'])
      expect(out!.serviceTimeShapes).toEqual(['time_slot'])
      expect(out!.serviceDateRange).toBeNull()
      expect(out!.showPast).toBe(false)
    })

    it('parses dateRange enum + past flag', () => {
      const out = parseBookingsFiltersFromUrl(
        new URLSearchParams('?dateRange=this_week&past=1'),
      )!
      expect(out.serviceDateRange).toBe('this_week')
      expect(out.showPast).toBe(true)
    })

    it('rejects unknown enum values silently', () => {
      const out = parseBookingsFiltersFromUrl(
        new URLSearchParams('?kind=service,bogus&shape=hocuspocus&dateRange=eternity'),
      )!
      expect(out.productKinds).toEqual(['service'])
      expect(out.serviceTimeShapes).toEqual([])
      expect(out.serviceDateRange).toBeNull()
    })

    it('dedupes + trims CSV entries and skips empties', () => {
      const out = parseBookingsFiltersFromUrl(
        new URLSearchParams('?status=,a,, b ,a,c'),
      )!
      expect(out.lifecycleStates).toEqual(['a', 'b', 'c'])
    })

    it('serialiseBookingsFiltersToUrl writes non-empty dimensions', () => {
      const filters: BookingsFilters = {
        ...EMPTY_FILTERS,
        lifecycleStates: ['confirmed_paid', 'cancelled'],
        productIds: ['p-1'],
        productKinds: ['service'],
        serviceDateRange: 'today',
        showPast: true,
      }
      const params = new URLSearchParams()
      const dirty = serialiseBookingsFiltersToUrl(params, filters)
      expect(dirty).toBe(true)
      expect(params.get('status')).toBe('confirmed_paid,cancelled')
      expect(params.get('product')).toBe('p-1')
      expect(params.get('kind')).toBe('service')
      expect(params.get('dateRange')).toBe('today')
      expect(params.get('past')).toBe('1')
      expect(params.has('location')).toBe(false)
      expect(params.has('shape')).toBe(false)
    })

    it('serialise drops keys when their dimension is empty', () => {
      const params = new URLSearchParams(
        '?status=old&product=x&dateRange=today&past=1',
      )
      const dirty = serialiseBookingsFiltersToUrl(params, EMPTY_FILTERS)
      expect(dirty).toBe(true)
      expect(params.has('status')).toBe(false)
      expect(params.has('product')).toBe(false)
      expect(params.has('dateRange')).toBe(false)
      expect(params.has('past')).toBe(false)
    })

    it('serialise is a no-op when URL already matches state', () => {
      const filters: BookingsFilters = {
        ...EMPTY_FILTERS,
        lifecycleStates: ['confirmed_paid'],
      }
      const params = new URLSearchParams('?status=confirmed_paid')
      expect(serialiseBookingsFiltersToUrl(params, filters)).toBe(false)
    })

    it('initialOverride wins over localStorage on first mount', () => {
      // Seed localStorage with one selection…
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({
          lifecycleStates: ['cancelled'],
          productIds: [],
          pickupLocationIds: [],
          productKinds: [],
          serviceTimeShapes: [],
          showPast: false,
          serviceDateRange: null,
        }),
      )
      // …then mount with an override (URL-derived). The override should
      // win on first paint AND get persisted so a reload-without-URL still
      // reflects it.
      const override: BookingsFilters = {
        ...EMPTY_FILTERS,
        lifecycleStates: ['confirmed_paid'],
        productKinds: ['service'],
      }
      const { result } = renderHook(() =>
        useBookingsFilters({ initialOverride: override }),
      )
      expect(result.current.filters.lifecycleStates).toEqual(['confirmed_paid'])
      expect(result.current.filters.productKinds).toEqual(['service'])
      const persisted = JSON.parse(
        window.localStorage.getItem(storageKey('user-1'))!,
      )
      expect(persisted.lifecycleStates).toEqual(['confirmed_paid'])
      expect(persisted.productKinds).toEqual(['service'])
    })

    it('with no override, falls back to localStorage as before', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({
          lifecycleStates: ['pending'],
          productIds: [],
          pickupLocationIds: [],
          productKinds: [],
          serviceTimeShapes: [],
        }),
      )
      const { result } = renderHook(() =>
        useBookingsFilters({ initialOverride: null }),
      )
      expect(result.current.filters.lifecycleStates).toEqual(['pending'])
    })
  })
})
