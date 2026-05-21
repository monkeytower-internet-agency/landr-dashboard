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
  createTag,
  defaultColorFor,
  deleteTag,
  fetchTags,
  patchTag,
  readableTextOn,
  setBookingTags,
  setContactTags,
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
