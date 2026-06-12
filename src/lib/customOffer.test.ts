// Minimal contract tests for customOffer.ts.
// landr-v9e4.10 coverage pass.
//
// The key things to verify: the URL builder assembles the right path,
// and putCustomOffer forwards lines + group fields verbatim to the api call.
// We do NOT test server-side computation here (that's landr-api territory).

import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock api-client
// ---------------------------------------------------------------------------

const { mockApi } = vi.hoisted(() => {
  return { mockApi: vi.fn() }
})

vi.mock('@/lib/api-client', () => ({ api: mockApi }))

import {
  clearCustomOffer,
  fetchCustomOffer,
  putCustomOffer,
  type CustomOfferInput,
} from '@/lib/customOffer'

afterEach(() => {
  vi.clearAllMocks()
})

const OP = 'op-abc'
const BOOKING = 'booking-xyz'

const EXPECTED_BASE = `/api/staff/operators/${OP}/bookings/${BOOKING}/custom-offer`

// ---------------------------------------------------------------------------
// fetchCustomOffer
// ---------------------------------------------------------------------------

describe('fetchCustomOffer', () => {
  it('calls GET on the correct URL', async () => {
    mockApi.mockResolvedValue({ booking_id: BOOKING })
    await fetchCustomOffer(OP, BOOKING)
    expect(mockApi).toHaveBeenCalledWith('GET', EXPECTED_BASE)
  })

  it('returns whatever the api resolves to', async () => {
    const stub = { booking_id: BOOKING, lines: [] }
    mockApi.mockResolvedValue(stub)
    const result = await fetchCustomOffer(OP, BOOKING)
    expect(result).toBe(stub)
  })
})

// ---------------------------------------------------------------------------
// putCustomOffer
// ---------------------------------------------------------------------------

describe('putCustomOffer', () => {
  const body: CustomOfferInput = {
    lines: [
      {
        booking_participant_id: 'p-1',
        label: 'Adult',
        unit_price: '149.00',
        is_free: false,
        sort_order: 0,
      },
      {
        booking_participant_id: null,
        label: 'Companion (free)',
        unit_price: '0.00',
        is_free: true,
        sort_order: 1,
      },
    ],
    group_threshold: 6,
    group_discount_pct: '10.00',
    tax_rate: '19.00',
  }

  it('calls PUT on the correct URL', async () => {
    mockApi.mockResolvedValue({ booking_id: BOOKING })
    await putCustomOffer(OP, BOOKING, body)
    expect(mockApi).toHaveBeenCalledWith('PUT', EXPECTED_BASE, body)
  })

  it('forwards lines array verbatim', async () => {
    mockApi.mockResolvedValue({ booking_id: BOOKING })
    await putCustomOffer(OP, BOOKING, body)
    const [, , sentBody] = mockApi.mock.calls[0] as [string, string, CustomOfferInput]
    expect(sentBody.lines).toEqual(body.lines)
  })

  it('forwards group_threshold and group_discount_pct', async () => {
    mockApi.mockResolvedValue({ booking_id: BOOKING })
    await putCustomOffer(OP, BOOKING, body)
    const [, , sentBody] = mockApi.mock.calls[0] as [string, string, CustomOfferInput]
    expect(sentBody.group_threshold).toBe(6)
    expect(sentBody.group_discount_pct).toBe('10.00')
  })

  it('forwards tax_rate', async () => {
    mockApi.mockResolvedValue({ booking_id: BOOKING })
    await putCustomOffer(OP, BOOKING, body)
    const [, , sentBody] = mockApi.mock.calls[0] as [string, string, CustomOfferInput]
    expect(sentBody.tax_rate).toBe('19.00')
  })
})

// ---------------------------------------------------------------------------
// clearCustomOffer
// ---------------------------------------------------------------------------

describe('clearCustomOffer', () => {
  it('calls DELETE on the correct URL', async () => {
    mockApi.mockResolvedValue({ booking_id: BOOKING })
    await clearCustomOffer(OP, BOOKING)
    expect(mockApi).toHaveBeenCalledWith('DELETE', EXPECTED_BASE)
  })
})

// ---------------------------------------------------------------------------
// URL construction — operator/booking ID encoding
// ---------------------------------------------------------------------------

describe('URL construction', () => {
  it('embeds operatorId and bookingId in the path for any valid IDs', async () => {
    const op = 'my-operator'
    const bk = 'my-booking-id'
    mockApi.mockResolvedValue({ booking_id: bk })
    await fetchCustomOffer(op, bk)
    expect(mockApi).toHaveBeenCalledWith(
      'GET',
      `/api/staff/operators/${op}/bookings/${bk}/custom-offer`,
    )
  })
})
