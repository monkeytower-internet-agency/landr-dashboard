// landr-ne58 — verify the recently-viewed trail: cap of 5, de-dup on
// re-open, per-user isolation, reactive hook, custom event for same-tab
// updates, graceful behaviour with no user.

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  RECENTLY_VIEWED_LIMIT,
  clearRecentlyViewed,
  getRecentlyViewed,
  storageKey,
  trackView,
  useRecentlyViewed,
} from './recently-viewed'

beforeEach(() => {
  window.localStorage.clear()
})

describe('trackView / getRecentlyViewed', () => {
  it('starts empty for a fresh user', () => {
    expect(getRecentlyViewed('user-1')).toEqual([])
  })

  it('records an entry and surfaces it newest-first', () => {
    trackView('user-1', 'booking', 'b-1', 'Alice — Sun Trip', '/bookings?open=b-1')
    trackView('user-1', 'contact', 'c-1', 'Alice', '/contacts?open=c-1')
    const trail = getRecentlyViewed('user-1')
    expect(trail).toHaveLength(2)
    expect(trail[0].id).toBe('c-1')
    expect(trail[1].id).toBe('b-1')
  })

  it('de-duplicates by (type, id) — re-opening bumps to top', () => {
    trackView('user-1', 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    trackView('user-1', 'contact', 'c-1', 'Alice', '/contacts?open=c-1')
    trackView('user-1', 'booking', 'b-1', 'Alice (updated)', '/bookings?open=b-1')
    const trail = getRecentlyViewed('user-1')
    expect(trail).toHaveLength(2)
    expect(trail[0].id).toBe('b-1')
    expect(trail[0].label).toBe('Alice (updated)')
  })

  it('caps the trail at RECENTLY_VIEWED_LIMIT (=5)', () => {
    for (let i = 0; i < 8; i++) {
      trackView('user-1', 'booking', `b-${i}`, `Booking ${i}`, `/bookings?open=b-${i}`)
    }
    const trail = getRecentlyViewed('user-1')
    expect(trail).toHaveLength(RECENTLY_VIEWED_LIMIT)
    // Most-recent insert is at the head; the oldest 3 fell off.
    expect(trail.map((e) => e.id)).toEqual(['b-7', 'b-6', 'b-5', 'b-4', 'b-3'])
  })

  it('isolates trails between users', () => {
    trackView('user-1', 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    trackView('user-2', 'contact', 'c-2', 'Bob', '/contacts?open=c-2')
    expect(getRecentlyViewed('user-1').map((e) => e.id)).toEqual(['b-1'])
    expect(getRecentlyViewed('user-2').map((e) => e.id)).toEqual(['c-2'])
  })

  it('no-ops when userId is null', () => {
    trackView(null, 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    expect(window.localStorage.length).toBe(0)
    expect(getRecentlyViewed(null)).toEqual([])
  })

  it('no-ops when id is empty', () => {
    trackView('user-1', 'booking', '', 'Alice', '/bookings?open=')
    expect(getRecentlyViewed('user-1')).toEqual([])
  })

  it('falls back to em-dash when the label is blank/whitespace', () => {
    trackView('user-1', 'booking', 'b-1', '   ', '/bookings?open=b-1')
    expect(getRecentlyViewed('user-1')[0].label).toBe('—')
  })

  it('survives a corrupted localStorage payload (returns empty)', () => {
    window.localStorage.setItem(storageKey('user-1'), 'not json{{')
    expect(getRecentlyViewed('user-1')).toEqual([])
  })

  it('ignores non-array stored payloads', () => {
    window.localStorage.setItem(storageKey('user-1'), JSON.stringify({ foo: 1 }))
    expect(getRecentlyViewed('user-1')).toEqual([])
  })

  it('strips entries that fail the shape check', () => {
    const mixed = [
      { type: 'booking', id: 'good', label: 'OK', href: '/x', ts: 1 },
      { type: 'unknown-kind', id: 'bad', label: 'X', href: '/y', ts: 2 },
      { id: 'missing-type', label: 'X', href: '/y', ts: 3 },
    ]
    window.localStorage.setItem(storageKey('user-1'), JSON.stringify(mixed))
    const trail = getRecentlyViewed('user-1')
    expect(trail).toHaveLength(1)
    expect(trail[0].id).toBe('good')
  })
})

describe('clearRecentlyViewed', () => {
  it('removes the stored trail for the given user', () => {
    trackView('user-1', 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    clearRecentlyViewed('user-1')
    expect(getRecentlyViewed('user-1')).toEqual([])
    expect(window.localStorage.getItem(storageKey('user-1'))).toBeNull()
  })

  it('no-ops when userId is null', () => {
    trackView('user-1', 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    clearRecentlyViewed(null)
    expect(getRecentlyViewed('user-1').length).toBe(1)
  })
})

describe('useRecentlyViewed', () => {
  it('returns the current trail and updates on same-tab writes', () => {
    const { result } = renderHook(() => useRecentlyViewed('user-1'))
    expect(result.current).toEqual([])

    act(() => {
      trackView('user-1', 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    })
    expect(result.current.map((e) => e.id)).toEqual(['b-1'])

    act(() => {
      trackView('user-1', 'contact', 'c-1', 'Bob', '/contacts?open=c-1')
    })
    expect(result.current.map((e) => e.id)).toEqual(['c-1', 'b-1'])
  })

  it('re-reads from localStorage when userId changes', () => {
    trackView('user-1', 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    trackView('user-2', 'contact', 'c-2', 'Bob', '/contacts?open=c-2')

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useRecentlyViewed(id),
      { initialProps: { id: 'user-1' } },
    )
    expect(result.current.map((e) => e.id)).toEqual(['b-1'])

    rerender({ id: 'user-2' })
    expect(result.current.map((e) => e.id)).toEqual(['c-2'])
  })

  it('responds to cross-tab storage events', () => {
    const { result } = renderHook(() => useRecentlyViewed('user-1'))
    expect(result.current).toEqual([])

    act(() => {
      // Simulate another tab writing to our user's slot.
      const next = JSON.stringify([
        {
          type: 'booking',
          id: 'b-99',
          label: 'Remote',
          href: '/bookings?open=b-99',
          ts: 1,
        },
      ])
      window.localStorage.setItem(storageKey('user-1'), next)
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: storageKey('user-1'),
          newValue: next,
        }),
      )
    })

    expect(result.current.map((e) => e.id)).toEqual(['b-99'])
  })

  it('returns [] when userId is null and does not crash on writes', () => {
    const { result } = renderHook(() => useRecentlyViewed(null))
    expect(result.current).toEqual([])
    act(() => {
      trackView(null, 'booking', 'b-1', 'Alice', '/bookings?open=b-1')
    })
    expect(result.current).toEqual([])
  })
})
