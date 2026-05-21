// landr-n2j2 — coverage for the Bookings inline-edit write hook + helpers.
//
// Mirrors the calendar-reschedule.test.tsx shape so both pattern siblings
// stay easy to compare. Covers:
//   - applyApprovalToCache: optimistic state flip on the matching row.
//   - decisionFromSelection / statusOptionsFor pure helpers.
//   - useInlineEditBooking.rescheduleEarliestItem: optimistic write,
//     PATCH via FastAPI, rollback on error.
//   - useInlineEditBooking.applyApprovalDecision: optimistic flip, POST
//     to the right branch (general vs hotel), rollback on error.

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import {
  applyApprovalToCache,
  applyPriceOverrideToCache,
  decisionFromSelection,
  statusOptionsFor,
  useInlineEditBooking,
} from './inline-edit-booking'
import type { BookingRow } from './bookings'

// --- mocks ----------------------------------------------------------------

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(async () => ({
      data: { session: { access_token: 'test-token' } },
    })),
  },
}))
vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  getSupabase: () => supabaseMock,
}))

// --- fixtures -------------------------------------------------------------

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b-1',
    created_at: '2026-05-15T10:00:00Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Marie',
      last_name: 'Curie',
      email: 'marie@example.com',
      phone: null,
    },
    items: [
      {
        id: 'item-1',
        date_range_start: '2026-06-01',
        date_range_end: '2026-06-01',
        selected_days: null,
        products: {
          id: 'p-1',
          name: 'Tandem flight',
          product_kind: 'service',
          service_time_shape: 'single_date',
        },
      },
    ],
    ...overrides,
  }
}

// --- pure helpers ---------------------------------------------------------

describe('applyApprovalToCache', () => {
  it('flips the row to confirmed on approve', () => {
    const rows = [makeRow()]
    const out = applyApprovalToCache(rows, 'b-1', 'approve')
    expect(out?.[0].current_semantic_state).toBe('confirmed')
  })

  it('flips the row to cancelled on reject', () => {
    const rows = [makeRow()]
    const out = applyApprovalToCache(rows, 'b-1', 'reject')
    expect(out?.[0].current_semantic_state).toBe('cancelled')
  })

  it('returns the original array when no row matches', () => {
    const rows = [makeRow()]
    const out = applyApprovalToCache(rows, 'nope', 'approve')
    expect(out).toBe(rows)
  })

  it('returns undefined when the cache is undefined', () => {
    expect(applyApprovalToCache(undefined, 'b-1', 'approve')).toBeUndefined()
  })
})

describe('decisionFromSelection', () => {
  it('maps approve → approve and reject → reject', () => {
    expect(decisionFromSelection('awaiting_general_approval', 'approve')).toBe(
      'approve',
    )
    expect(decisionFromSelection('awaiting_general_approval', 'reject')).toBe(
      'reject',
    )
  })

  it('returns null for the noop placeholder', () => {
    expect(decisionFromSelection('awaiting_general_approval', 'noop')).toBeNull()
  })

  it('returns null when fromStage is null', () => {
    expect(decisionFromSelection(null, 'approve')).toBeNull()
  })
})

describe('statusOptionsFor', () => {
  it('returns the approve/reject options for awaiting_general_approval', () => {
    const opts = statusOptionsFor(
      makeRow({ current_stage: { code: 'awaiting_general_approval' } }),
    )
    expect(opts.map((o) => o.value)).toEqual(['noop', 'approve', 'reject'])
  })

  it('returns the approve/reject options for awaiting_hotel_approval', () => {
    const opts = statusOptionsFor(
      makeRow({ current_stage: { code: 'awaiting_hotel_approval' } }),
    )
    expect(opts.map((o) => o.value)).toEqual(['noop', 'approve', 'reject'])
  })

  it('returns an empty list when no transition is wired (read-only cell)', () => {
    expect(
      statusOptionsFor(makeRow({ current_stage: { code: 'confirmed' } })),
    ).toEqual([])
    expect(
      statusOptionsFor(makeRow({ current_stage: null })),
    ).toEqual([])
  })
})

// --- integration: useInlineEditBooking -----------------------------------

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const fetchSpy = vi.fn()

beforeEach(() => {
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useInlineEditBooking.rescheduleEarliestItem', () => {
  it('optimistically writes the cache and PATCHes via FastAPI', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.rescheduleEarliestItem({
      bookingId: 'b-1',
      itemId: 'item-1',
      previousStart: '2026-06-01',
      previousEnd: '2026-06-01',
      newStart: '2026-06-08',
      newEnd: '2026-06-08',
    })

    // Cache flips before fetch resolves.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0].items[0]
        .date_range_start,
    ).toBe('2026-06-08')

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/b-1/products/item-1')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({
      date_range_start: '2026-06-08',
      date_range_end: '2026-06-08',
    })

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledOnce())
    expect(toastMock.success.mock.calls[0][0]).toMatch(/dates updated/i)
  })

  it('rolls back the optimistic cache and fires an error toast when the PATCH fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'pricing engine kaput' }), {
        status: 500,
      }),
    )

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.rescheduleEarliestItem({
      bookingId: 'b-1',
      itemId: 'item-1',
      previousStart: '2026-06-01',
      previousEnd: '2026-06-01',
      newStart: '2026-06-08',
      newEnd: null,
    })

    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0].items[0]
        .date_range_start,
    ).toBe('2026-06-08')

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    const [, options] = toastMock.error.mock.calls[0] as [
      string,
      { description: string },
    ]
    expect(options.description).toMatch(/pricing engine kaput/i)

    // Rolled back.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0].items[0]
        .date_range_start,
    ).toBe('2026-06-01')
  })

  it('writes optimistic updates to ALL registered query keys', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])
    client.setQueryData(['views-bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () =>
        useInlineEditBooking({
          queryKeys: [
            ['bookings', 'op-1'],
            ['views-bookings', 'op-1'],
          ],
        }),
      { wrapper: makeWrapper(client) },
    )

    result.current.rescheduleEarliestItem({
      bookingId: 'b-1',
      itemId: 'item-1',
      previousStart: '2026-06-01',
      previousEnd: '2026-06-01',
      newStart: '2026-06-08',
      newEnd: null,
    })

    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0].items[0]
        .date_range_start,
    ).toBe('2026-06-08')
    expect(
      client.getQueryData<BookingRow[]>(['views-bookings', 'op-1'])?.[0]
        .items[0].date_range_start,
    ).toBe('2026-06-08')
  })
})

describe('useInlineEditBooking.applyApprovalDecision', () => {
  it('flips status to confirmed and POSTs branch=general for awaiting_general_approval', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.applyApprovalDecision({
      bookingId: 'b-1',
      decision: 'approve',
      fromStage: 'awaiting_general_approval',
    })

    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0]
        .current_semantic_state,
    ).toBe('confirmed')

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/b-1/approval')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toMatchObject({
      branch: 'general',
      decision: 'approve',
    })
  })

  it('POSTs branch=secondary for awaiting_hotel_approval', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [
      makeRow({ current_stage: { code: 'awaiting_hotel_approval' } }),
    ])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.applyApprovalDecision({
      bookingId: 'b-1',
      decision: 'reject',
      fromStage: 'awaiting_hotel_approval',
    })

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toMatchObject({
      branch: 'secondary',
      decision: 'reject',
    })
  })

  it('rolls back the optimistic flip and fires an error toast when the POST fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'capacity violated' }), {
        status: 400,
      }),
    )

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.applyApprovalDecision({
      bookingId: 'b-1',
      decision: 'approve',
      fromStage: 'awaiting_general_approval',
    })

    // Optimistic flip applied.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0]
        .current_semantic_state,
    ).toBe('confirmed')

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    expect(toastMock.error.mock.calls[0][1]).toMatchObject({
      description: expect.stringMatching(/capacity violated/i),
    })

    // Rolled back.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0]
        .current_semantic_state,
    ).toBe('pending')
  })

  it('refuses to POST when fromStage has no approval endpoint and fires an error toast', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [
      makeRow({ current_stage: { code: 'confirmed' } }),
    ])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.applyApprovalDecision({
      bookingId: 'b-1',
      decision: 'approve',
      fromStage: 'confirmed',
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledOnce()
    expect(toastMock.error.mock.calls[0][1]).toMatchObject({
      description: expect.stringMatching(/no status change/i),
    })
  })
})

// --- landr-puix: price-override op ---------------------------------------

describe('applyPriceOverrideToCache', () => {
  it('stamps override_gross_total + reason + balance_due on the matching row', () => {
    const rows = [makeRow()]
    const out = applyPriceOverrideToCache(rows, 'b-1', 75, 'loyalty discount')
    expect(out?.[0].override_gross_total).toBe(75)
    expect(out?.[0].override_reason).toBe('loyalty discount')
    expect(out?.[0].balance_due).toBe(75)
    expect(out?.[0].override_applied_at).toBeTypeOf('string')
    // Engine gross is left untouched.
    expect(out?.[0].gross_total).toBe(100)
  })

  it('returns the original array when no row matches', () => {
    const rows = [makeRow()]
    const out = applyPriceOverrideToCache(rows, 'nope', 50, 'x')
    expect(out).toBe(rows)
  })

  it('returns undefined when the cache is undefined', () => {
    expect(
      applyPriceOverrideToCache(undefined, 'b-1', 50, 'x'),
    ).toBeUndefined()
  })
})

describe('useInlineEditBooking.overridePrice', () => {
  it('optimistically writes the cache and POSTs the override + reason', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.overridePrice({
      bookingId: 'b-1',
      operatorId: 'op-1',
      newGrossTotal: 75,
      reason: 'loyalty discount',
      previousGrossTotal: 100,
    })

    // Cache flips before fetch resolves — override + balance_due both pre-stamped.
    const cached = client.getQueryData<BookingRow[]>(['bookings', 'op-1'])
    expect(cached?.[0].override_gross_total).toBe(75)
    expect(cached?.[0].override_reason).toBe('loyalty discount')
    expect(cached?.[0].balance_due).toBe(75)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(
      '/api/staff/operators/op-1/bookings/b-1/price-override',
    )
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({
      override_gross_total: 75,
      reason: 'loyalty discount',
    })

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledOnce())
    expect(toastMock.success.mock.calls[0][0]).toMatch(/override applied/i)
  })

  it('rolls back the optimistic cache and fires an error toast when the POST fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'booking cancelled' }), {
        status: 409,
      }),
    )

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.overridePrice({
      bookingId: 'b-1',
      operatorId: 'op-1',
      newGrossTotal: 75,
      reason: 'comp',
      previousGrossTotal: 100,
    })

    // Optimistic stamp.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0]
        .override_gross_total,
    ).toBe(75)

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())

    // Rolled back — override_gross_total returns to undefined.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0]
        .override_gross_total,
    ).toBeUndefined()
  })

  it('bails with an error toast when no operatorId is supplied', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.overridePrice({
      bookingId: 'b-1',
      operatorId: null,
      newGrossTotal: 75,
      reason: 'comp',
      previousGrossTotal: 100,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledOnce()
    expect(toastMock.error.mock.calls[0][1]).toMatchObject({
      description: expect.stringMatching(/select an operator/i),
    })
  })

  it('bails when reason is whitespace-only', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.overridePrice({
      bookingId: 'b-1',
      operatorId: 'op-1',
      newGrossTotal: 75,
      reason: '   ',
      previousGrossTotal: 100,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledOnce()
    expect(toastMock.error.mock.calls[0][1]).toMatchObject({
      description: expect.stringMatching(/reason is required/i),
    })
  })

  it('bails when newGrossTotal is negative', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useInlineEditBooking({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.overridePrice({
      bookingId: 'b-1',
      operatorId: 'op-1',
      newGrossTotal: -5,
      reason: 'oops',
      previousGrossTotal: 100,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledOnce()
    expect(toastMock.error.mock.calls[0][1]).toMatchObject({
      description: expect.stringMatching(/non-negative/i),
    })
  })
})
