// landr-panu — segments lib tests: storage helpers (round-trip, scoping,
// versioning, corruption), CRUD edge cases, AND-filter semantics, and the
// reactive useSegments hook.

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  SEGMENT_STORAGE_VERSION,
  applySegment,
  clearSegments,
  createSegment,
  defaultColorFor,
  deleteSegment,
  filterByTagIds,
  getSegments,
  rowMatchesTagIds,
  storageKey,
  updateSegment,
  useSegments,
  type Segment,
  type Tagged,
} from './segments'

beforeEach(() => {
  window.localStorage.clear()
})

describe('storage round-trip', () => {
  it('returns [] for a fresh operator', () => {
    expect(getSegments('op-1')).toEqual([])
  })

  it('persists and re-reads a created segment', () => {
    const seg = createSegment('op-1', { name: 'VIP', tagIds: ['t1', 't2'] })
    expect(seg).not.toBeNull()
    const fetched = getSegments('op-1')
    expect(fetched).toHaveLength(1)
    expect(fetched[0].id).toBe(seg!.id)
    expect(fetched[0].name).toBe('VIP')
    expect(fetched[0].tagIds).toEqual(['t1', 't2'])
    expect(fetched[0].color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(fetched[0].createdAt).toMatch(/T/)
  })

  it('deduplicates tagIds on create', () => {
    const seg = createSegment('op-1', { name: 'Dup', tagIds: ['a', 'a', 'b'] })
    expect(seg!.tagIds).toEqual(['a', 'b'])
  })

  it('trims the segment name', () => {
    const seg = createSegment('op-1', { name: '  Returning  ', tagIds: ['t1'] })
    expect(seg!.name).toBe('Returning')
  })

  it('rejects empty / whitespace names', () => {
    expect(createSegment('op-1', { name: '   ', tagIds: ['t1'] })).toBeNull()
    expect(getSegments('op-1')).toEqual([])
  })

  it('isolates segments per operator', () => {
    createSegment('op-1', { name: 'A', tagIds: ['a'] })
    createSegment('op-2', { name: 'B', tagIds: ['b'] })
    expect(getSegments('op-1').map((s) => s.name)).toEqual(['A'])
    expect(getSegments('op-2').map((s) => s.name)).toEqual(['B'])
  })

  it('no-ops when operatorId is null', () => {
    expect(createSegment(null, { name: 'X', tagIds: ['a'] })).toBeNull()
    expect(getSegments(null)).toEqual([])
    expect(window.localStorage.length).toBe(0)
  })

  it('survives a corrupted localStorage payload', () => {
    window.localStorage.setItem(storageKey('op-1'), 'not-json{{')
    expect(getSegments('op-1')).toEqual([])
  })

  it('ignores a future storage version', () => {
    window.localStorage.setItem(
      storageKey('op-1'),
      JSON.stringify({ v: SEGMENT_STORAGE_VERSION + 1, segments: [] }),
    )
    expect(getSegments('op-1')).toEqual([])
  })

  it('drops malformed entries inside an otherwise-valid blob', () => {
    window.localStorage.setItem(
      storageKey('op-1'),
      JSON.stringify({
        v: SEGMENT_STORAGE_VERSION,
        segments: [
          { id: 'ok', name: 'Good', tagIds: ['a'], color: '#fff000', createdAt: 'now' },
          { id: 'bad', name: 5 }, // wrong shape
          null,
        ],
      }),
    )
    const segs = getSegments('op-1')
    expect(segs).toHaveLength(1)
    expect(segs[0].id).toBe('ok')
  })
})

describe('updateSegment / deleteSegment', () => {
  it('patches name + tagIds + color in place', () => {
    const seg = createSegment('op-1', { name: 'VIP', tagIds: ['t1'] })!
    const updated = updateSegment('op-1', seg.id, {
      name: 'VIP Returning',
      tagIds: ['t1', 't2'],
      color: '#000000',
    })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('VIP Returning')
    expect(updated!.tagIds).toEqual(['t1', 't2'])
    expect(updated!.color).toBe('#000000')
    expect(getSegments('op-1')[0].name).toBe('VIP Returning')
  })

  it('keeps existing name when patch.name is blank', () => {
    const seg = createSegment('op-1', { name: 'VIP', tagIds: ['t1'] })!
    const updated = updateSegment('op-1', seg.id, { name: '   ' })
    expect(updated!.name).toBe('VIP')
  })

  it('returns null for an unknown id', () => {
    createSegment('op-1', { name: 'VIP', tagIds: ['t1'] })
    expect(updateSegment('op-1', 'missing', { name: 'X' })).toBeNull()
  })

  it('deletes by id', () => {
    const a = createSegment('op-1', { name: 'A', tagIds: ['t1'] })!
    const b = createSegment('op-1', { name: 'B', tagIds: ['t2'] })!
    expect(deleteSegment('op-1', a.id)).toBe(true)
    expect(getSegments('op-1').map((s) => s.id)).toEqual([b.id])
  })

  it('delete returns false when id is unknown', () => {
    createSegment('op-1', { name: 'A', tagIds: ['t1'] })
    expect(deleteSegment('op-1', 'missing')).toBe(false)
  })

  it('clearSegments empties the operator slot', () => {
    createSegment('op-1', { name: 'A', tagIds: ['t1'] })
    createSegment('op-1', { name: 'B', tagIds: ['t2'] })
    clearSegments('op-1')
    expect(getSegments('op-1')).toEqual([])
  })
})

describe('filter behaviour', () => {
  const rows: Tagged[] = [
    { tags: [{ id: 'vip' }, { id: 'returning' }] }, // 0 — both
    { tags: [{ id: 'vip' }] }, // 1 — only vip
    { tags: [{ id: 'returning' }] }, // 2 — only returning
    { tags: [] }, // 3 — none
    { tags: null }, // 4 — null
    {}, // 5 — undefined
  ]

  it('rowMatchesTagIds: empty list is the identity (matches all)', () => {
    rows.forEach((row) => expect(rowMatchesTagIds(row, [])).toBe(true))
  })

  it('rowMatchesTagIds: AND semantics — every requested tag must be present', () => {
    expect(rowMatchesTagIds(rows[0], ['vip', 'returning'])).toBe(true)
    expect(rowMatchesTagIds(rows[1], ['vip', 'returning'])).toBe(false)
    expect(rowMatchesTagIds(rows[2], ['vip', 'returning'])).toBe(false)
    expect(rowMatchesTagIds(rows[3], ['vip'])).toBe(false)
    expect(rowMatchesTagIds(rows[4], ['vip'])).toBe(false)
    expect(rowMatchesTagIds(rows[5], ['vip'])).toBe(false)
  })

  it('filterByTagIds: subset returned for the AND combination', () => {
    expect(filterByTagIds(rows, ['vip'])).toEqual([rows[0], rows[1]])
    expect(filterByTagIds(rows, ['returning'])).toEqual([rows[0], rows[2]])
    expect(filterByTagIds(rows, ['vip', 'returning'])).toEqual([rows[0]])
    expect(filterByTagIds(rows, ['unknown'])).toEqual([])
  })

  it('filterByTagIds: empty list returns the input untouched', () => {
    expect(filterByTagIds(rows, [])).toBe(rows)
  })

  it('applySegment delegates to filterByTagIds', () => {
    const seg: Segment = {
      id: 's1',
      name: 'VIP',
      tagIds: ['vip'],
      color: '#000000',
      createdAt: 'now',
    }
    expect(applySegment(rows, seg)).toEqual([rows[0], rows[1]])
  })
})

describe('defaultColorFor', () => {
  it('produces a hex from the palette', () => {
    const c = defaultColorFor('VIP')
    expect(c).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('is deterministic for a given name', () => {
    expect(defaultColorFor('Returning')).toBe(defaultColorFor('Returning'))
  })
})

describe('useSegments', () => {
  it('starts empty and reacts to a create on the same tab', () => {
    const { result } = renderHook(() => useSegments('op-1'))
    expect(result.current).toEqual([])
    act(() => {
      createSegment('op-1', { name: 'VIP', tagIds: ['t1'] })
    })
    expect(result.current).toHaveLength(1)
    expect(result.current[0].name).toBe('VIP')
  })

  it('reacts to updates + deletes', () => {
    const { result } = renderHook(() => useSegments('op-1'))
    let seg!: Segment
    act(() => {
      seg = createSegment('op-1', { name: 'VIP', tagIds: ['t1'] })!
    })
    act(() => {
      updateSegment('op-1', seg.id, { name: 'VIP+' })
    })
    expect(result.current[0].name).toBe('VIP+')
    act(() => {
      deleteSegment('op-1', seg.id)
    })
    expect(result.current).toEqual([])
  })

  it('returns [] when operatorId is null and skips listeners', () => {
    const { result } = renderHook(() => useSegments(null))
    expect(result.current).toEqual([])
    // Write something for op-1 — the null hook should not be affected.
    act(() => {
      createSegment('op-1', { name: 'X', tagIds: ['t1'] })
    })
    expect(result.current).toEqual([])
  })

  it('re-reads on a cross-tab storage event', () => {
    const { result } = renderHook(() => useSegments('op-1'))
    expect(result.current).toEqual([])
    act(() => {
      // Simulate a write from another tab: write into localStorage then
      // dispatch the native StorageEvent ourselves (jsdom doesn't emit
      // these automatically across tabs).
      const envelope = {
        v: SEGMENT_STORAGE_VERSION,
        segments: [
          {
            id: 'x',
            name: 'Other-tab',
            tagIds: ['t1'],
            color: '#ffffff',
            createdAt: 'now',
          },
        ],
      }
      window.localStorage.setItem(
        storageKey('op-1'),
        JSON.stringify(envelope),
      )
      window.dispatchEvent(
        new StorageEvent('storage', { key: storageKey('op-1') }),
      )
    })
    expect(result.current).toHaveLength(1)
    expect(result.current[0].name).toBe('Other-tab')
  })
})
