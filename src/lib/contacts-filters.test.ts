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
  matchesBookingWindowFilter,
  parseContactsFiltersFromUrl,
  serialiseContactsFiltersToUrl,
  storageKey,
  useContactsFilters,
  type ContactsFilters,
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
    expect(JSON.parse(raw!)).toEqual({
      types: ['attendee'],
      bookingWindows: [],
      includeErased: false,
    })
  })

  it('restores stored types on a fresh mount for the same user', () => {
    window.localStorage.setItem(
      storageKey('user-1'),
      JSON.stringify({ types: ['employee', 'agent'] }),
    )
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.filters.types.sort()).toEqual(['agent', 'employee'])
    expect(activeFilterCount(result.current.filters)).toBe(2)
    // landr-dp45 — legacy payload without `includeErased` defaults to false.
    expect(result.current.filters.includeErased).toBe(false)
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
    ).toEqual({ types: [], bookingWindows: [], includeErased: false })
  })

  it('tolerates malformed JSON in storage without throwing', () => {
    window.localStorage.setItem(storageKey('user-1'), '{not json}')
    const { result } = renderHook(() => useContactsFilters())
    expect(isEmptyFilters(result.current.filters)).toBe(true)
  })

  // landr-dp45 — "Show erased contacts" view toggle.
  describe('includeErased toggle', () => {
    it('defaults to false and is not counted as an active filter', () => {
      const { result } = renderHook(() => useContactsFilters())
      expect(result.current.filters.includeErased).toBe(false)
      expect(activeFilterCount(result.current.filters)).toBe(0)
      expect(isEmptyFilters(result.current.filters)).toBe(true)
    })

    it('setIncludeErased(true) flips the flag and persists it', () => {
      const { result } = renderHook(() => useContactsFilters())
      act(() => result.current.setIncludeErased(true))
      expect(result.current.filters.includeErased).toBe(true)
      expect(
        JSON.parse(window.localStorage.getItem(storageKey('user-1'))!),
      ).toEqual({ types: [], bookingWindows: [], includeErased: true })
    })

    it('preserves selected types when flipping includeErased', () => {
      const { result } = renderHook(() => useContactsFilters())
      act(() => result.current.toggleType('customer'))
      act(() => result.current.setIncludeErased(true))
      expect(result.current.filters.types).toEqual(['customer'])
      expect(result.current.filters.includeErased).toBe(true)
    })

    it('restores includeErased on remount for the same user', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({ types: [], includeErased: true }),
      )
      const { result } = renderHook(() => useContactsFilters())
      expect(result.current.filters.includeErased).toBe(true)
    })

    it('ignores non-boolean includeErased values in storage', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({ types: [], includeErased: 'yes' }),
      )
      const { result } = renderHook(() => useContactsFilters())
      expect(result.current.filters.includeErased).toBe(false)
    })

    it('clearAll also resets includeErased back to false', () => {
      const { result } = renderHook(() => useContactsFilters())
      act(() => result.current.setIncludeErased(true))
      act(() => result.current.toggleType('customer'))
      act(() => result.current.clearAll())
      expect(result.current.filters.includeErased).toBe(false)
      expect(result.current.filters.types).toEqual([])
    })
  })

  // ----- landr-j57l — URL parse/serialise + initialOverride ------------
  describe('URL round-trip (landr-j57l)', () => {
    it('parseContactsFiltersFromUrl returns null when no filter params present', () => {
      expect(
        parseContactsFiltersFromUrl(new URLSearchParams('?open=abc')),
      ).toBeNull()
    })

    it('parses type CSV + erased flag', () => {
      const out = parseContactsFiltersFromUrl(
        new URLSearchParams('?type=customer,attendee&erased=1'),
      )!
      expect(out.types).toEqual(['customer', 'attendee'])
      expect(out.includeErased).toBe(true)
    })

    it('drops unknown type values silently', () => {
      const out = parseContactsFiltersFromUrl(
        new URLSearchParams('?type=customer,bogus,employee'),
      )!
      expect(out.types).toEqual(['customer', 'employee'])
    })

    it('serialiseContactsFiltersToUrl writes non-empty filters', () => {
      const filters: ContactsFilters = {
        types: ['agent', 'employee'],
        bookingWindows: [],
        includeErased: true,
      }
      const params = new URLSearchParams()
      const dirty = serialiseContactsFiltersToUrl(params, filters)
      expect(dirty).toBe(true)
      expect(params.get('type')).toBe('agent,employee')
      expect(params.get('erased')).toBe('1')
    })

    it('serialise drops keys when filters are empty', () => {
      const params = new URLSearchParams('?type=customer&erased=1')
      const dirty = serialiseContactsFiltersToUrl(params, EMPTY_FILTERS)
      expect(dirty).toBe(true)
      expect(params.has('type')).toBe(false)
      expect(params.has('erased')).toBe(false)
    })

    it('serialise is a no-op when URL already matches state', () => {
      const params = new URLSearchParams('?type=customer')
      expect(
        serialiseContactsFiltersToUrl(params, {
          types: ['customer'],
          bookingWindows: [],
          includeErased: false,
        }),
      ).toBe(false)
    })

    it('initialOverride wins over localStorage on first mount', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({ types: ['employee'], includeErased: false }),
      )
      const override: ContactsFilters = {
        types: ['customer', 'attendee'],
        bookingWindows: [],
        includeErased: true,
      }
      const { result } = renderHook(() =>
        useContactsFilters({ initialOverride: override }),
      )
      expect(result.current.filters.types).toEqual(['customer', 'attendee'])
      expect(result.current.filters.includeErased).toBe(true)
      // Eagerly persisted so a same-user reload without the URL still
      // reflects the deep-linked view.
      expect(
        JSON.parse(window.localStorage.getItem(storageKey('user-1'))!),
      ).toEqual({
        types: ['customer', 'attendee'],
        bookingWindows: [],
        includeErased: true,
      })
    })

    it('with no override, falls back to localStorage as before', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({ types: ['agent'], includeErased: false }),
      )
      const { result } = renderHook(() =>
        useContactsFilters({ initialOverride: null }),
      )
      expect(result.current.filters.types).toEqual(['agent'])
    })
  })

  // ----- landr-6993 — booking-window chip dimension ----------------------
  describe('bookingWindows (landr-6993)', () => {
    it('defaults to empty and is counted in activeFilterCount when populated', () => {
      const { result } = renderHook(() => useContactsFilters())
      expect(result.current.filters.bookingWindows).toEqual([])
      expect(activeFilterCount(result.current.filters)).toBe(0)
    })

    it('toggleBookingWindow adds, then removes, a window from the selection', () => {
      const { result } = renderHook(() => useContactsFilters())
      act(() => result.current.toggleBookingWindow('today'))
      act(() => result.current.toggleBookingWindow('future'))
      expect(result.current.filters.bookingWindows.sort()).toEqual([
        'future',
        'today',
      ])
      act(() => result.current.toggleBookingWindow('today'))
      expect(result.current.filters.bookingWindows).toEqual(['future'])
    })

    it('toggleBookingWindow contributes to activeFilterCount', () => {
      const { result } = renderHook(() => useContactsFilters())
      act(() => result.current.toggleBookingWindow('today'))
      expect(activeFilterCount(result.current.filters)).toBe(1)
      act(() => result.current.toggleType('customer'))
      expect(activeFilterCount(result.current.filters)).toBe(2)
    })

    it('persists toggled windows to localStorage', () => {
      const { result } = renderHook(() => useContactsFilters())
      act(() => result.current.toggleBookingWindow('today'))
      expect(
        JSON.parse(window.localStorage.getItem(storageKey('user-1'))!),
      ).toEqual({ types: [], bookingWindows: ['today'], includeErased: false })
    })

    it('restores bookingWindows on remount, with legacy payloads defaulting to empty', () => {
      // Legacy payload without bookingWindows still hydrates cleanly.
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({ types: ['customer'], includeErased: false }),
      )
      const { result } = renderHook(() => useContactsFilters())
      expect(result.current.filters.bookingWindows).toEqual([])
      expect(result.current.filters.types).toEqual(['customer'])
    })

    it('drops unknown booking-window values from storage', () => {
      window.localStorage.setItem(
        storageKey('user-1'),
        JSON.stringify({
          types: [],
          bookingWindows: ['today', 'next-week', 42, null],
          includeErased: false,
        }),
      )
      const { result } = renderHook(() => useContactsFilters())
      expect(result.current.filters.bookingWindows).toEqual(['today'])
    })

    it('clearAll wipes booking-window chips alongside types', () => {
      const { result } = renderHook(() => useContactsFilters())
      act(() => result.current.toggleBookingWindow('today'))
      act(() => result.current.toggleType('customer'))
      act(() => result.current.clearAll())
      expect(result.current.filters.bookingWindows).toEqual([])
      expect(result.current.filters.types).toEqual([])
      expect(isEmptyFilters(result.current.filters)).toBe(true)
    })
  })

  // ----- landr-6993 — URL round-trip for ?bw= ----------------------------
  describe('booking-window URL round-trip (landr-6993)', () => {
    it('parses ?bw=today,future into bookingWindows', () => {
      const out = parseContactsFiltersFromUrl(
        new URLSearchParams('?bw=today,future'),
      )!
      expect(out.bookingWindows).toEqual(['today', 'future'])
    })

    it('drops unknown ?bw= values silently', () => {
      const out = parseContactsFiltersFromUrl(
        new URLSearchParams('?bw=today,never,bogus'),
      )!
      expect(out.bookingWindows).toEqual(['today'])
    })

    it('serialises bookingWindows to ?bw= CSV and drops when empty', () => {
      const filters: ContactsFilters = {
        types: [],
        bookingWindows: ['today', 'future'],
        includeErased: false,
      }
      const params = new URLSearchParams()
      expect(serialiseContactsFiltersToUrl(params, filters)).toBe(true)
      expect(params.get('bw')).toBe('today,future')

      const drop = new URLSearchParams('?bw=today')
      expect(serialiseContactsFiltersToUrl(drop, EMPTY_FILTERS)).toBe(true)
      expect(drop.has('bw')).toBe(false)
    })

    it('returns null when only unrelated params are present (incl. just ?bw= still parses)', () => {
      // bw alone DOES trigger parse (so a deep-link with only ?bw= works).
      expect(
        parseContactsFiltersFromUrl(new URLSearchParams('?bw=today')),
      ).not.toBeNull()
      // Just ?open= alone does NOT trigger parse.
      expect(
        parseContactsFiltersFromUrl(new URLSearchParams('?open=abc')),
      ).toBeNull()
    })
  })
})

// ──────────────────────────────────────────────────────────────────────
// landr-6993 — matchesBookingWindowFilter (client-side predicate)
// ──────────────────────────────────────────────────────────────────────

describe('matchesBookingWindowFilter (landr-6993)', () => {
  const today = '2026-05-22'

  it('passes through when no booking windows are selected', () => {
    expect(matchesBookingWindowFilter(null, [], today)).toBe(true)
    expect(matchesBookingWindowFilter('2026-05-30', [], today)).toBe(true)
  })

  it("matches 'today' chip when date equals today", () => {
    expect(matchesBookingWindowFilter(today, ['today'], today)).toBe(true)
    expect(matchesBookingWindowFilter('2026-05-30', ['today'], today)).toBe(
      false,
    )
  })

  it("matches 'future' chip when date is after today", () => {
    expect(matchesBookingWindowFilter('2026-06-01', ['future'], today)).toBe(
      true,
    )
    expect(matchesBookingWindowFilter(today, ['future'], today)).toBe(false)
  })

  it("matches union when both chips are selected", () => {
    expect(
      matchesBookingWindowFilter(today, ['today', 'future'], today),
    ).toBe(true)
    expect(
      matchesBookingWindowFilter('2026-06-15', ['today', 'future'], today),
    ).toBe(true)
    expect(
      matchesBookingWindowFilter(null, ['today', 'future'], today),
    ).toBe(false)
  })

  it('rejects past dates even when a chip is selected', () => {
    expect(
      matchesBookingWindowFilter('2026-05-01', ['today', 'future'], today),
    ).toBe(false)
  })
})
