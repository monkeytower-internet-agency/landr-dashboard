/**
 * Tests for lib/serviceRoles.ts (landr-1tqx).
 *
 * Covers:
 *   - labelToCode  — slugify-to-code (lowercase, underscores, diacritics).
 *   - CRUD wrappers — assert URL + method + body shape via mocked api().
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  api: vi.fn(),
}))

import { api } from '@/lib/api-client'
import {
  createServiceRole,
  deleteServiceRole,
  fetchServiceRoles,
  labelToCode,
  updateServiceRole,
} from './serviceRoles'

const OP = '00000000-0000-0000-0000-0000000000a1'
const ROLE = '00000000-0000-0000-0000-0000000000bb'

beforeEach(() => {
  vi.mocked(api).mockReset()
})

describe('labelToCode', () => {
  it('lowercases and underscores spaces', () => {
    expect(labelToCode('Tandem Pilot')).toBe('tandem_pilot')
  })
  it('strips diacritics', () => {
    expect(labelToCode('Begleitperson über')).toBe('begleitperson_uber')
  })
  it('collapses runs of non-alphanumerics and trims edges', () => {
    expect(labelToCode('  Diver / Buddy!! ')).toBe('diver_buddy')
  })
  it('returns empty string for punctuation-only input', () => {
    expect(labelToCode('!!! ')).toBe('')
  })
  it('caps at 64 chars', () => {
    expect(labelToCode('x'.repeat(100)).length).toBe(64)
  })
})

describe('CRUD wrappers', () => {
  it('fetchServiceRoles GETs the operator-scoped collection', async () => {
    vi.mocked(api).mockResolvedValueOnce([])
    await fetchServiceRoles(OP)
    expect(api).toHaveBeenCalledWith(
      'GET',
      `/api/staff/operators/${OP}/service-roles`,
    )
  })

  it('createServiceRole POSTs the body', async () => {
    vi.mocked(api).mockResolvedValueOnce({})
    await createServiceRole(OP, { code: 'pilot', label: 'Pilot', sort_order: 2 })
    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/service-roles`,
      { code: 'pilot', label: 'Pilot', sort_order: 2 },
    )
  })

  it('updateServiceRole PATCHes the role path with the patch body', async () => {
    vi.mocked(api).mockResolvedValueOnce({})
    await updateServiceRole(OP, ROLE, { label: 'Tandem Pilot' })
    expect(api).toHaveBeenCalledWith(
      'PATCH',
      `/api/staff/operators/${OP}/service-roles/${ROLE}`,
      { label: 'Tandem Pilot' },
    )
  })

  it('updateServiceRole forwards an active toggle', async () => {
    vi.mocked(api).mockResolvedValueOnce({})
    await updateServiceRole(OP, ROLE, { active: false })
    expect(api).toHaveBeenCalledWith(
      'PATCH',
      `/api/staff/operators/${OP}/service-roles/${ROLE}`,
      { active: false },
    )
  })

  it('deleteServiceRole DELETEs the role path', async () => {
    vi.mocked(api).mockResolvedValueOnce({ status: 'deleted' })
    await deleteServiceRole(OP, ROLE)
    expect(api).toHaveBeenCalledWith(
      'DELETE',
      `/api/staff/operators/${OP}/service-roles/${ROLE}`,
    )
  })
})
