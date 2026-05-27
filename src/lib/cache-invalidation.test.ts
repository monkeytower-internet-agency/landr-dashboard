// landr-399m — invalidateBookingCaches(qc) regression guard.
//
// Bookings are read through two query-key prefixes that DO NOT match each
// other under @tanstack/react-query's `queryKey` prefix matching:
//   - ['bookings']        → fetchBookings / fetchPendingGeneralApprovals
//   - ['views-bookings']  → lib/views-bookings-data.ts:useViewBookings
//
// Any write that mutates a booking (or a contact denormalised into one)
// must invalidate BOTH so the Views layer doesn't go stale. This test
// asserts the helper hits both prefixes; the per-surface tests assert
// each call site routes its invalidations through the helper.

import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { invalidateBookingCaches } from './bookings'

describe('invalidateBookingCaches', () => {
  it('invalidates both [bookings] and [views-bookings]', async () => {
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await invalidateBookingCaches(qc)

    const keys = spy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    )
    expect(keys).toContainEqual(['bookings'])
    expect(keys).toContainEqual(['views-bookings'])
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('returns a Promise that resolves after both invalidations settle', async () => {
    const qc = new QueryClient()
    const result = invalidateBookingCaches(qc)
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })
})
