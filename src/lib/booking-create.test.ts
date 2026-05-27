// landr-eaqr — tests for the quick-create API client.
//
// Pure unit test: stubs the shared api() helper so we verify path +
// payload shaping without round-tripping to FastAPI. Mirrors how
// booking-notes.test.ts exercises createBookingNote.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const apiMock = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
}))

import { quickCreateBooking } from './booking-create'

beforeEach(() => {
  apiMock.mockReset()
})

describe('quickCreateBooking', () => {
  it('POSTs to the operator-scoped quick-create endpoint with the 4-field payload', async () => {
    apiMock.mockResolvedValue({
      booking_id: 'b-42',
      contact_id: 'c-7',
    })

    const result = await quickCreateBooking('op-1', {
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      product_id: 'p-1',
      date: '2026-06-15',
    })

    expect(apiMock).toHaveBeenCalledTimes(1)
    expect(apiMock).toHaveBeenCalledWith(
      'POST',
      '/api/staff/operators/op-1/bookings/quick-create',
      {
        customer_name: 'Jane Doe',
        customer_email: 'jane@example.com',
        product_id: 'p-1',
        date: '2026-06-15',
      },
    )
    expect(result).toEqual({ booking_id: 'b-42', contact_id: 'c-7' })
  })

  it('propagates errors thrown by the shared api() helper', async () => {
    apiMock.mockRejectedValue(new Error('product_not_found'))

    await expect(
      quickCreateBooking('op-1', {
        customer_name: 'Jane',
        customer_email: 'jane@example.com',
        product_id: 'p-1',
        date: '2026-06-15',
      }),
    ).rejects.toThrow('product_not_found')
  })
})
