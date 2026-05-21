/**
 * Tests for lib/tags.ts (landr-iz58).
 *
 * Covers:
 *   - defaultColorFor — deterministic palette pick from name hash.
 *   - readableTextOn  — contrast helper (black on light bg, white on dark bg).
 *   - CRUD wrappers   — assert URL + method + body shape via mocked api().
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  api: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { api } from '@/lib/api-client'
import {
  TAG_PALETTE,
  bulkApplyTagsToBookings,
  bulkApplyTagsToContacts,
  createTag,
  defaultColorFor,
  deleteTag,
  fetchTags,
  patchTag,
  readableTextOn,
  setBookingTags,
  setContactTags,
  unionTagIds,
} from './tags'

beforeEach(() => {
  vi.mocked(api).mockReset()
})

describe('defaultColorFor', () => {
  it('returns a palette colour', () => {
    expect(TAG_PALETTE).toContain(defaultColorFor('VIP'))
  })
  it('is deterministic for the same name', () => {
    expect(defaultColorFor('Returning')).toBe(defaultColorFor('Returning'))
  })
  it('distributes different names across the palette', () => {
    const buckets = new Set<string>()
    for (const name of ['VIP', 'Returning', 'Hen party', 'Birthday', 'Stag', 'School trip', 'Group', 'Trial']) {
      buckets.add(defaultColorFor(name))
    }
    // 8 names against an 8-slot palette → not perfect, but at least 3 distinct.
    expect(buckets.size).toBeGreaterThanOrEqual(3)
  })
})

describe('readableTextOn', () => {
  it('returns white on dark backgrounds', () => {
    expect(readableTextOn('#000000')).toBe('#ffffff')
    expect(readableTextOn('#3b82f6')).toBe('#ffffff') // blue-500
  })
  it('returns black on light backgrounds', () => {
    expect(readableTextOn('#ffffff')).toBe('#000000')
    expect(readableTextOn('#f0f0f0')).toBe('#000000')
  })
  it('defaults to white on malformed input', () => {
    expect(readableTextOn('not-hex')).toBe('#ffffff')
    expect(readableTextOn('#abc')).toBe('#ffffff')
  })
})

describe('CRUD wrappers', () => {
  const OP = 'op-1'

  it('fetchTags calls GET /api/staff/operators/{op}/tags', async () => {
    vi.mocked(api).mockResolvedValueOnce([])
    await fetchTags(OP)
    expect(api).toHaveBeenCalledWith('GET', `/api/staff/operators/${OP}/tags`)
  })

  it('createTag posts the name + color', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 't1' })
    await createTag(OP, { name: 'VIP', color: '#3b82f6' })
    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/tags`,
      { name: 'VIP', color: '#3b82f6' },
    )
  })

  it('patchTag sends the partial payload', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 't1' })
    await patchTag(OP, 't1', { name: 'VIP+' })
    expect(api).toHaveBeenCalledWith(
      'PATCH',
      `/api/staff/operators/${OP}/tags/t1`,
      { name: 'VIP+' },
    )
  })

  it('deleteTag issues a DELETE', async () => {
    vi.mocked(api).mockResolvedValueOnce({ status: 'deleted' })
    await deleteTag(OP, 't1')
    expect(api).toHaveBeenCalledWith(
      'DELETE',
      `/api/staff/operators/${OP}/tags/t1`,
    )
  })

  it('setBookingTags posts full-replace tag_ids', async () => {
    vi.mocked(api).mockResolvedValueOnce({ tag_ids: ['t1'] })
    await setBookingTags(OP, 'b1', ['t1', 't2'])
    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/bookings/b1/tags`,
      { tag_ids: ['t1', 't2'] },
    )
  })

  it('setContactTags posts full-replace tag_ids', async () => {
    vi.mocked(api).mockResolvedValueOnce({ tag_ids: [] })
    await setContactTags(OP, 'c1', [])
    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/contacts/c1/tags`,
      { tag_ids: [] },
    )
  })
})

// landr-uqr2 — bulk-apply helpers fan setBookingTags / setContactTags out
// across the selected row set. Each helper unions the chosen tag ids with
// the row's existing tag ids so bulk-apply ADDs rather than replaces.
describe('unionTagIds (landr-uqr2)', () => {
  it('returns the inputs unchanged when there is no overlap', () => {
    expect(unionTagIds(['a', 'b'], ['c'])).toEqual(['a', 'b', 'c'])
  })
  it('keeps existing order and drops duplicates from the add set', () => {
    expect(unionTagIds(['a', 'b'], ['b', 'c', 'a'])).toEqual(['a', 'b', 'c'])
  })
  it('handles empty current ids', () => {
    expect(unionTagIds([], ['x'])).toEqual(['x'])
  })
  it('handles empty add ids', () => {
    expect(unionTagIds(['x', 'y'], [])).toEqual(['x', 'y'])
  })
})

describe('bulkApplyTagsToBookings (landr-uqr2)', () => {
  const OP = 'op-1'

  it('POSTs setBookingTags for every row with the union of current+new tag ids', async () => {
    vi.mocked(api).mockResolvedValue({ tag_ids: [] })
    const result = await bulkApplyTagsToBookings(
      OP,
      [
        { id: 'b1', currentTagIds: ['t-existing'] },
        { id: 'b2', currentTagIds: [] },
      ],
      ['t-new'],
    )

    expect(result).toEqual({ ok: 2, failed: [] })
    expect(api).toHaveBeenCalledTimes(2)
    expect(api).toHaveBeenNthCalledWith(
      1,
      'POST',
      `/api/staff/operators/${OP}/bookings/b1/tags`,
      { tag_ids: ['t-existing', 't-new'] },
    )
    expect(api).toHaveBeenNthCalledWith(
      2,
      'POST',
      `/api/staff/operators/${OP}/bookings/b2/tags`,
      { tag_ids: ['t-new'] },
    )
  })

  it('surfaces row-level failures via Promise.allSettled without aborting the batch', async () => {
    // First call resolves, second rejects, third resolves.
    vi.mocked(api)
      .mockResolvedValueOnce({ tag_ids: [] })
      .mockRejectedValueOnce(new Error('cross-tenant id'))
      .mockResolvedValueOnce({ tag_ids: [] })

    const result = await bulkApplyTagsToBookings(
      OP,
      [
        { id: 'b1', currentTagIds: [] },
        { id: 'b2', currentTagIds: [] },
        { id: 'b3', currentTagIds: [] },
      ],
      ['t-new'],
    )

    expect(result.ok).toBe(2)
    expect(result.failed).toEqual(['b2'])
  })

  it('does not duplicate the new tag when the row already carries it', async () => {
    vi.mocked(api).mockResolvedValue({ tag_ids: [] })
    await bulkApplyTagsToBookings(
      OP,
      [{ id: 'b1', currentTagIds: ['t-new', 't-x'] }],
      ['t-new'],
    )
    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/bookings/b1/tags`,
      { tag_ids: ['t-new', 't-x'] },
    )
  })
})

describe('bulkApplyTagsToContacts (landr-uqr2)', () => {
  const OP = 'op-1'

  it('POSTs setContactTags for every row with the union of current+new tag ids', async () => {
    vi.mocked(api).mockResolvedValue({ tag_ids: [] })
    const result = await bulkApplyTagsToContacts(
      OP,
      [
        { id: 'c1', currentTagIds: ['t-existing'] },
        { id: 'c2', currentTagIds: [] },
      ],
      ['t-new-a', 't-new-b'],
    )

    expect(result).toEqual({ ok: 2, failed: [] })
    expect(api).toHaveBeenCalledTimes(2)
    expect(api).toHaveBeenNthCalledWith(
      1,
      'POST',
      `/api/staff/operators/${OP}/contacts/c1/tags`,
      { tag_ids: ['t-existing', 't-new-a', 't-new-b'] },
    )
    expect(api).toHaveBeenNthCalledWith(
      2,
      'POST',
      `/api/staff/operators/${OP}/contacts/c2/tags`,
      { tag_ids: ['t-new-a', 't-new-b'] },
    )
  })

  it('records every row id that fails in `failed`', async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))

    const result = await bulkApplyTagsToContacts(
      OP,
      [
        { id: 'c1', currentTagIds: [] },
        { id: 'c2', currentTagIds: [] },
      ],
      ['t-new'],
    )

    expect(result.ok).toBe(0)
    expect(result.failed).toEqual(['c1', 'c2'])
  })
})
