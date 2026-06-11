import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock ONLY the api() helper (keep the rest of api-client real). This lets us
// drive the REAL fetchPlaceAutocomplete/fetchPlaceDetails path: api() throws a
// plain Error carrying the server's `detail` on any non-2xx (incl. the backend
// 503 {configured:false, detail:"...not configured"}) BEFORE the body is read —
// so these tests exercise the actual 503 contract, not a lib-level mock that
// pre-rejects with PlacesNotConfiguredError (the false-confidence gap the
// review flagged).
vi.mock('@/lib/api-client', async (orig) => ({
  ...(await orig<typeof import('@/lib/api-client')>()),
  api: vi.fn(),
}))

import { api } from '@/lib/api-client'
import {
  fetchPlaceAutocomplete,
  fetchPlaceDetails,
  PlacesNotConfiguredError,
} from '@/lib/hotels'

const mockApi = vi.mocked(api)

describe('hotel-places lib — backend 503 not-configured translation', () => {
  beforeEach(() => mockApi.mockReset())

  it('autocomplete maps the 503 detail (api throws "...not configured") to PlacesNotConfiguredError', async () => {
    mockApi.mockRejectedValueOnce(new Error('Google Places lookup not configured'))
    await expect(
      fetchPlaceAutocomplete('op1', 'Hotel Mirador', 'tok'),
    ).rejects.toBeInstanceOf(PlacesNotConfiguredError)
  })

  it('details maps the 503 not-configured to PlacesNotConfiguredError', async () => {
    mockApi.mockRejectedValueOnce(new Error('Google Places lookup not configured'))
    await expect(
      fetchPlaceDetails('op1', 'place123', 'tok'),
    ).rejects.toBeInstanceOf(PlacesNotConfiguredError)
  })

  it('rethrows non-not-configured errors unchanged (e.g. a real 500)', async () => {
    mockApi.mockRejectedValueOnce(new Error('HTTP 500'))
    const err = await fetchPlaceAutocomplete('op1', 'Hotel', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(PlacesNotConfiguredError)
    expect((err as Error).message).toBe('HTTP 500')
  })

  it('returns suggestions on a normal 200', async () => {
    mockApi.mockResolvedValueOnce({
      suggestions: [{ placeId: 'p1', mainText: 'Hotel X', secondaryText: 'Tenerife' }],
    })
    await expect(
      fetchPlaceAutocomplete('op1', 'Hotel', 'tok'),
    ).resolves.toEqual([{ placeId: 'p1', mainText: 'Hotel X', secondaryText: 'Tenerife' }])
  })
})
