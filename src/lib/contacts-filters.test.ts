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
    ).toEqual({ types: [], includeErased: false })
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
      ).toEqual({ types: [], includeErased: true })
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
      ).toEqual({ types: ['customer', 'attendee'], includeErased: true })
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
})
