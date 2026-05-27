// landr-7dya.10 — staff capabilities feature-detection + graceful degradation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => ({
  mock: { api: vi.fn() },
}))

vi.mock('@/lib/api-client', () => ({
  api: mock.api,
}))

import {
  fallbackCapabilities,
  fetchStaffCapabilities,
} from './staff-capabilities'

beforeEach(() => {
  mock.api.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('fallbackCapabilities', () => {
  it('grants staff every mode', () => {
    expect(fallbackCapabilities(true)).toEqual({
      can_use_ticket_system: true,
      can_view_as_operator: true,
    })
  })
  it('grants non-staff nothing', () => {
    expect(fallbackCapabilities(false)).toEqual({
      can_use_ticket_system: false,
      can_view_as_operator: false,
    })
  })
})

describe('fetchStaffCapabilities', () => {
  it('short-circuits for non-staff without hitting the endpoint', async () => {
    const caps = await fetchStaffCapabilities(false)
    expect(caps).toEqual(fallbackCapabilities(false))
    expect(mock.api).not.toHaveBeenCalled()
  })

  it('uses the server block verbatim when present', async () => {
    mock.api.mockResolvedValueOnce({
      can_use_ticket_system: true,
      can_view_as_operator: false,
    })
    const caps = await fetchStaffCapabilities(true)
    expect(caps).toEqual({
      can_use_ticket_system: true,
      can_view_as_operator: false,
    })
    expect(mock.api).toHaveBeenCalledWith(
      'GET',
      '/api/landr-staff/me/capabilities',
    )
  })

  it('fills missing fields from the staff fallback (forward-compatible)', async () => {
    mock.api.mockResolvedValueOnce({ can_view_as_operator: false })
    const caps = await fetchStaffCapabilities(true)
    expect(caps).toEqual({
      can_use_ticket_system: true, // filled from staff fallback
      can_view_as_operator: false, // from server
    })
  })

  it('degrades to staff fallback when the endpoint is missing (404)', async () => {
    mock.api.mockRejectedValueOnce(new Error('HTTP 404'))
    const caps = await fetchStaffCapabilities(true)
    expect(caps).toEqual(fallbackCapabilities(true))
  })

  it('degrades to staff fallback on "Not Found" detail', async () => {
    mock.api.mockRejectedValueOnce(new Error('Not Found'))
    const caps = await fetchStaffCapabilities(true)
    expect(caps).toEqual(fallbackCapabilities(true))
  })

  it('degrades to staff fallback on any other error (never locks staff out)', async () => {
    mock.api.mockRejectedValueOnce(new Error('HTTP 500'))
    const caps = await fetchStaffCapabilities(true)
    expect(caps).toEqual(fallbackCapabilities(true))
  })

  it('treats a null/non-object body as the staff fallback', async () => {
    mock.api.mockResolvedValueOnce(null)
    const caps = await fetchStaffCapabilities(true)
    expect(caps).toEqual(fallbackCapabilities(true))
  })
})
