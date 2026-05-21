// landr-nnbm — coverage for the drag-to-reschedule machinery shared by the
// main /calendar (BookingsCalendar) and the Views CalendarLayout.
//
// Covers:
//   - applyRescheduleToCache writes new dates onto the matching line.
//   - formatRescheduleDateLabel renders the "Mon 8 Jun" shape.
//   - useDragReschedule does optimistic write, PATCHes via FastAPI, fires
//     a success toast with an Undo action, rolls back on error, and the
//     Undo action PATCHes back to the previous dates.

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import {
  applyRescheduleToCache,
  formatRescheduleDateLabel,
  useDragReschedule,
} from './calendar-reschedule'
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
    current_semantic_state: 'confirmed',
    current_stage: { code: 'confirmed' },
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

// --- unit tests -----------------------------------------------------------

describe('applyRescheduleToCache', () => {
  it('writes new dates onto the matching item and leaves siblings alone', () => {
    const rows: BookingRow[] = [
      makeRow({ id: 'b-1' }),
      makeRow({
        id: 'b-2',
        items: [
          {
            id: 'item-99',
            date_range_start: '2026-06-10',
            date_range_end: null,
            selected_days: null,
            products: null,
          },
        ],
      }),
    ]
    const out = applyRescheduleToCache(rows, 'item-1', '2026-06-08', '2026-06-09')
    expect(out).toBeDefined()
    expect(out![0].items[0].date_range_start).toBe('2026-06-08')
    expect(out![0].items[0].date_range_end).toBe('2026-06-09')
    // Sibling row untouched.
    expect(out![1]).toBe(rows[1])
  })

  it('returns the original array when no item matches (no-op)', () => {
    const rows: BookingRow[] = [makeRow()]
    const out = applyRescheduleToCache(rows, 'nope', '2026-06-08', null)
    expect(out).toBe(rows)
  })

  it('returns undefined when the cache is undefined', () => {
    expect(applyRescheduleToCache(undefined, 'x', '2026-06-08', null)).toBeUndefined()
  })
})

describe('formatRescheduleDateLabel', () => {
  it('renders the "Mon 8 Jun" shape for a calendar day', () => {
    // 2026-06-08 is a Monday.
    expect(formatRescheduleDateLabel('2026-06-08')).toBe('Mon 8 Jun')
  })

  it('passes garbage through untouched (defensive)', () => {
    expect(formatRescheduleDateLabel('not-a-date')).toBe('not-a-date')
  })
})

// --- integration: useDragReschedule --------------------------------------

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

describe('useDragReschedule', () => {
  it('optimistically writes the cache, PATCHes via FastAPI, and fires a success toast with an Undo action', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useDragReschedule({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.reschedule({
      bookingId: 'b-1',
      itemId: 'item-1',
      newStart: '2026-06-08',
      newEnd: '2026-06-08',
      previousStart: '2026-06-01',
      previousEnd: '2026-06-01',
      label: 'Marie Curie — Tandem flight',
    })

    // Cache flips before the network resolves — pure optimistic UI.
    const optimistic = client.getQueryData<BookingRow[]>(['bookings', 'op-1'])
    expect(optimistic?.[0].items[0].date_range_start).toBe('2026-06-08')

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/b-1/products/item-1')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({
      date_range_start: '2026-06-08',
      date_range_end: '2026-06-08',
    })

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledOnce())
    const [message, options] = toastMock.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    expect(message).toContain('Rescheduled Marie Curie — Tandem flight')
    expect(message).toContain('Mon 8 Jun')
    expect(options.action.label).toBe('Undo')
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
    const original = [makeRow()]
    client.setQueryData(['bookings', 'op-1'], original)

    const { result } = renderHook(
      () => useDragReschedule({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.reschedule({
      bookingId: 'b-1',
      itemId: 'item-1',
      newStart: '2026-06-08',
      newEnd: null,
      previousStart: '2026-06-01',
      previousEnd: '2026-06-01',
      label: 'Marie Curie — Tandem flight',
    })

    // Optimistic flip applied immediately.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0].items[0]
        .date_range_start,
    ).toBe('2026-06-08')

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    const [message, options] = toastMock.error.mock.calls[0] as [
      string,
      { description: string },
    ]
    expect(message).toMatch(/could not reschedule/i)
    expect(options.description).toMatch(/pricing engine kaput/i)

    // Rolled back to original.
    expect(
      client.getQueryData<BookingRow[]>(['bookings', 'op-1'])?.[0].items[0]
        .date_range_start,
    ).toBe('2026-06-01')
  })

  it('Undo action PATCHes back to the previous dates', async () => {
    // First PATCH (forward), then PATCH (undo).
    fetchSpy
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['bookings', 'op-1'], [makeRow()])

    const { result } = renderHook(
      () => useDragReschedule({ queryKeys: [['bookings', 'op-1']] }),
      { wrapper: makeWrapper(client) },
    )

    result.current.reschedule({
      bookingId: 'b-1',
      itemId: 'item-1',
      newStart: '2026-06-08',
      newEnd: '2026-06-08',
      previousStart: '2026-06-01',
      previousEnd: '2026-06-01',
      label: 'Marie Curie — Tandem flight',
    })

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledOnce())
    const [, options] = toastMock.success.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ]

    // Fire Undo.
    options.action.onClick()

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    const [url, opts] = fetchSpy.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/b-1/products/item-1')
    expect(JSON.parse(opts.body as string)).toEqual({
      date_range_start: '2026-06-01',
      date_range_end: '2026-06-01',
    })

    // Second success toast confirms the undo landed.
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(2))
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
        useDragReschedule({
          queryKeys: [
            ['views-bookings', 'op-1'],
            ['bookings', 'op-1'],
          ],
        }),
      { wrapper: makeWrapper(client) },
    )

    result.current.reschedule({
      bookingId: 'b-1',
      itemId: 'item-1',
      newStart: '2026-06-08',
      newEnd: null,
      previousStart: '2026-06-01',
      previousEnd: '2026-06-01',
      label: 'Marie Curie',
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
