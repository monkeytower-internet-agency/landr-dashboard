/**
 * Tests for lib/campaigns.ts (landr-sp4r).
 *
 * Covers the CRUD wrappers — asserts URL + method + body shape via a
 * mocked api(). Mirrors lib/tags.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  api: vi.fn(),
}))

import { api } from '@/lib/api-client'
import {
  CAMPAIGN_KINDS,
  CAMPAIGN_KIND_LABELS,
  createCampaign,
  deleteCampaign,
  fetchCampaigns,
  patchCampaign,
} from './campaigns'

const OP = 'op-1'

beforeEach(() => {
  vi.mocked(api).mockReset()
})

describe('campaign kind metadata', () => {
  it('has a label for every kind', () => {
    for (const k of CAMPAIGN_KINDS) {
      expect(CAMPAIGN_KIND_LABELS[k]).toBeTruthy()
    }
  })
})

describe('campaigns CRUD wrappers', () => {
  it('fetchCampaigns calls GET /api/staff/operators/{op}/campaigns', async () => {
    vi.mocked(api).mockResolvedValueOnce([])
    await fetchCampaigns(OP)
    expect(api).toHaveBeenCalledWith(
      'GET',
      `/api/staff/operators/${OP}/campaigns`,
    )
  })

  it('createCampaign posts the input payload', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 'c1' })
    const input = {
      code: 'SUMMER25',
      label: 'Summer 2025',
      kind: 'marketing' as const,
      start_date: '2025-06-01',
      end_date: '2025-08-31',
    }
    await createCampaign(OP, input)
    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/campaigns`,
      input,
    )
  })

  it('patchCampaign sends the partial payload', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 'c1' })
    await patchCampaign(OP, 'c1', { active: false })
    expect(api).toHaveBeenCalledWith(
      'PATCH',
      `/api/staff/operators/${OP}/campaigns/c1`,
      { active: false },
    )
  })

  it('deleteCampaign issues a DELETE', async () => {
    vi.mocked(api).mockResolvedValueOnce({ status: 'deleted' })
    await deleteCampaign(OP, 'c1')
    expect(api).toHaveBeenCalledWith(
      'DELETE',
      `/api/staff/operators/${OP}/campaigns/c1`,
    )
  })
})
