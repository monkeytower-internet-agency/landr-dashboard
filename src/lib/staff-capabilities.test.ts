// landr-7dya.10 / landr-7dya.13 — staff capabilities feature-detection + graceful degradation.
// Shape reconciled with the REAL API endpoint (landr-api PR #171):
//   { is_staff, is_owner, can_triage_tickets, can_admin_roles,
//     can_view_as_operator, roles }
// canUseTicketSystem(caps) = caps.is_staff || caps.can_triage_tickets
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => ({
  mock: { api: vi.fn() },
}))

vi.mock('@/lib/api-client', () => ({
  api: mock.api,
}))

import {
  canUseTicketSystem,
  fallbackCapabilities,
  fetchStaffCapabilities,
  type StaffCapabilities,
} from './staff-capabilities'

beforeEach(() => {
  mock.api.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('fallbackCapabilities', () => {
  it('grants staff every mode', () => {
    const caps = fallbackCapabilities(true)
    expect(caps.is_staff).toBe(true)
    expect(caps.can_triage_tickets).toBe(true)
    expect(caps.can_view_as_operator).toBe(true)
    expect(caps.can_admin_roles).toBe(false)
    expect(caps.is_owner).toBe(false)
    expect(caps.roles).toEqual([])
  })

  it('grants non-staff nothing', () => {
    const caps = fallbackCapabilities(false)
    expect(caps.is_staff).toBe(false)
    expect(caps.can_triage_tickets).toBe(false)
    expect(caps.can_view_as_operator).toBe(false)
  })
})

describe('canUseTicketSystem', () => {
  it('is true when is_staff is true', () => {
    const caps: StaffCapabilities = {
      ...fallbackCapabilities(false),
      is_staff: true,
      can_triage_tickets: false,
    }
    expect(canUseTicketSystem(caps)).toBe(true)
  })

  it('is true when can_triage_tickets is true (even without is_staff)', () => {
    const caps: StaffCapabilities = {
      ...fallbackCapabilities(false),
      is_staff: false,
      can_triage_tickets: true,
    }
    expect(canUseTicketSystem(caps)).toBe(true)
  })

  it('is false when neither is_staff nor can_triage_tickets', () => {
    const caps: StaffCapabilities = {
      ...fallbackCapabilities(false),
      is_staff: false,
      can_triage_tickets: false,
    }
    expect(canUseTicketSystem(caps)).toBe(false)
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
      is_staff: true,
      is_owner: false,
      can_triage_tickets: false,
      can_admin_roles: true,
      can_view_as_operator: false,
      roles: ['helpdesk'],
    })
    const caps = await fetchStaffCapabilities(true)
    expect(caps).toEqual({
      is_staff: true,
      is_owner: false,
      can_triage_tickets: false,
      can_admin_roles: true,
      can_view_as_operator: false,
      roles: ['helpdesk'],
    })
    expect(mock.api).toHaveBeenCalledWith(
      'GET',
      '/api/landr-staff/me/capabilities',
    )
  })

  it('fills missing fields from the staff fallback (forward-compatible)', async () => {
    // Endpoint only returns can_view_as_operator; everything else is missing.
    mock.api.mockResolvedValueOnce({ can_view_as_operator: false })
    const caps = await fetchStaffCapabilities(true)
    expect(caps.is_staff).toBe(true)          // filled from staff fallback
    expect(caps.can_triage_tickets).toBe(true) // filled from staff fallback
    expect(caps.can_view_as_operator).toBe(false) // from server
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

  it('accepts roles array from server', async () => {
    mock.api.mockResolvedValueOnce({
      is_staff: true,
      can_view_as_operator: true,
      roles: ['developer', 'accountant'],
    })
    const caps = await fetchStaffCapabilities(true)
    expect(caps.roles).toEqual(['developer', 'accountant'])
  })

  it('falls back roles to [] when server returns a non-array', async () => {
    mock.api.mockResolvedValueOnce({ is_staff: true, roles: null })
    const caps = await fetchStaffCapabilities(true)
    expect(caps.roles).toEqual([])
  })
})
