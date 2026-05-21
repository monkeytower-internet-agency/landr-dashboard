import { describe, expect, it } from 'vitest'
import type { BookingRow } from '@/lib/bookings'
import {
  bucketForRange,
  computeAnalyticsKpis,
  daysAgoUtcIso,
  filterByCreatedAt,
  rangeWindowDays,
  shapeBookingsPerProduct,
  shapeConversionFunnel,
  shapeOccupancyHeatmap,
  shapeRevenueOverTime,
  shapeTopCustomers,
  todayUtcIso,
} from './analytics'

function makeRow(over: Partial<BookingRow> & { id: string }): BookingRow {
  return {
    id: over.id,
    created_at: over.created_at ?? '2026-05-01T10:00:00.000Z',
    current_semantic_state: over.current_semantic_state ?? 'confirmed',
    current_stage: over.current_stage ?? null,
    gross_total: over.gross_total ?? 100,
    currency: over.currency ?? 'EUR',
    customer:
      over.customer ?? {
        id: `c-${over.id}`,
        first_name: 'Test',
        last_name: 'Person',
        email: `t-${over.id}@example.com`,
        phone: null,
      },
    items: over.items ?? [],
  }
}

describe('rangeWindowDays + bucketForRange', () => {
  it('maps presets to expected window sizes', () => {
    expect(rangeWindowDays('last30')).toBe(30)
    expect(rangeWindowDays('last90')).toBe(90)
    expect(rangeWindowDays('last365')).toBe(365)
  })

  it('picks an appropriate bucket per preset', () => {
    expect(bucketForRange('last30')).toBe('day')
    expect(bucketForRange('last90')).toBe('week')
    expect(bucketForRange('last365')).toBe('month')
  })
})

describe('todayUtcIso + daysAgoUtcIso', () => {
  it('formats today and N days ago as YYYY-MM-DD', () => {
    const now = new Date('2026-05-21T12:00:00.000Z')
    expect(todayUtcIso(now)).toBe('2026-05-21')
    expect(daysAgoUtcIso(0, now)).toBe('2026-05-21')
    expect(daysAgoUtcIso(29, now)).toBe('2026-04-22')
  })
})

describe('filterByCreatedAt', () => {
  it('keeps rows inside the inclusive window only', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', created_at: '2026-04-01T00:00:00.000Z' }),
      makeRow({ id: '2', created_at: '2026-04-15T00:00:00.000Z' }),
      makeRow({ id: '3', created_at: '2026-05-15T00:00:00.000Z' }),
    ]
    const out = filterByCreatedAt(rows, '2026-04-10', '2026-05-10')
    expect(out.map((r) => r.id)).toEqual(['2'])
  })

  it('includes window endpoints', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', created_at: '2026-04-10T00:00:00.000Z' }),
      makeRow({ id: '2', created_at: '2026-05-10T23:59:59.000Z' }),
      makeRow({ id: '3', created_at: '2026-05-11T00:00:00.000Z' }),
    ]
    const out = filterByCreatedAt(rows, '2026-04-10', '2026-05-10')
    expect(out.map((r) => r.id)).toEqual(['1', '2'])
  })
})

describe('shapeRevenueOverTime', () => {
  it('buckets by day and fills empty days with zero', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', created_at: '2026-05-01T10:00:00Z', gross_total: 100 }),
      makeRow({ id: '2', created_at: '2026-05-01T12:00:00Z', gross_total: 50 }),
      makeRow({ id: '3', created_at: '2026-05-03T10:00:00Z', gross_total: 200 }),
    ]
    const out = shapeRevenueOverTime(rows, {
      from: '2026-05-01',
      to: '2026-05-03',
      bucket: 'day',
    })
    expect(out).toEqual([
      { key: '2026-05-01', label: 'May 1', revenue: 150 },
      { key: '2026-05-02', label: 'May 2', revenue: 0 },
      { key: '2026-05-03', label: 'May 3', revenue: 200 },
    ])
  })

  it('excludes cancelled bookings from revenue', () => {
    const rows: BookingRow[] = [
      makeRow({
        id: '1',
        created_at: '2026-05-01T10:00:00Z',
        gross_total: 100,
        current_semantic_state: 'cancelled',
      }),
      makeRow({ id: '2', created_at: '2026-05-01T12:00:00Z', gross_total: 50 }),
    ]
    const out = shapeRevenueOverTime(rows, {
      from: '2026-05-01',
      to: '2026-05-01',
      bucket: 'day',
    })
    expect(out).toEqual([{ key: '2026-05-01', label: 'May 1', revenue: 50 }])
  })

  it('buckets by week (Monday-anchored)', () => {
    const rows: BookingRow[] = [
      // 2026-05-04 is a Monday → bucket key is 2026-05-04.
      makeRow({ id: '1', created_at: '2026-05-04T10:00:00Z', gross_total: 100 }),
      // 2026-05-07 is a Thursday in the same week.
      makeRow({ id: '2', created_at: '2026-05-07T10:00:00Z', gross_total: 50 }),
    ]
    const out = shapeRevenueOverTime(rows, {
      from: '2026-05-04',
      to: '2026-05-07',
      bucket: 'week',
    })
    expect(out).toEqual([{ key: '2026-05-04', label: 'May 4', revenue: 150 }])
  })

  it('buckets by month', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', created_at: '2026-04-15T10:00:00Z', gross_total: 200 }),
      makeRow({ id: '2', created_at: '2026-05-15T10:00:00Z', gross_total: 300 }),
    ]
    const out = shapeRevenueOverTime(rows, {
      from: '2026-04-01',
      to: '2026-05-31',
      bucket: 'month',
    })
    expect(out).toEqual([
      { key: '2026-04', label: 'Apr 26', revenue: 200 },
      { key: '2026-05', label: 'May 26', revenue: 300 },
    ])
  })
})

describe('shapeBookingsPerProduct', () => {
  it('counts each line item once and shares revenue across lines', () => {
    const rows: BookingRow[] = [
      makeRow({
        id: '1',
        gross_total: 100,
        items: [
          {
            id: 'i-1',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'p-1',
              name: 'Tandem',
              product_kind: 'service',
              service_time_shape: null,
            },
          },
          {
            id: 'i-2',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'p-2',
              name: 'Course',
              product_kind: 'service',
              service_time_shape: null,
            },
          },
        ],
      }),
      makeRow({
        id: '2',
        gross_total: 80,
        items: [
          {
            id: 'i-3',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'p-1',
              name: 'Tandem',
              product_kind: 'service',
              service_time_shape: null,
            },
          },
        ],
      }),
    ]
    const out = shapeBookingsPerProduct(rows)
    expect(out).toHaveLength(2)
    // Tandem: 2 bookings, revenue = 50 + 80 = 130.
    expect(out[0]).toEqual({
      productId: 'p-1',
      productName: 'Tandem',
      bookings: 2,
      revenue: 130,
    })
    // Course: 1 booking, revenue = 50 (half of 100).
    expect(out[1]).toEqual({
      productId: 'p-2',
      productName: 'Course',
      bookings: 1,
      revenue: 50,
    })
  })

  it('excludes cancelled bookings', () => {
    const rows: BookingRow[] = [
      makeRow({
        id: '1',
        current_semantic_state: 'cancelled',
        items: [
          {
            id: 'i-1',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'p-1',
              name: 'Tandem',
              product_kind: 'service',
              service_time_shape: null,
            },
          },
        ],
      }),
    ]
    expect(shapeBookingsPerProduct(rows)).toEqual([])
  })
})

describe('shapeConversionFunnel', () => {
  it('counts stage membership inclusively', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', current_semantic_state: 'pending' }),
      makeRow({ id: '2', current_semantic_state: 'confirmed' }),
      makeRow({ id: '3', current_semantic_state: 'finalised' }),
      makeRow({ id: '4', current_semantic_state: 'cancelled' }),
      makeRow({ id: '5', current_semantic_state: 'no_show' }),
    ]
    const f = shapeConversionFunnel(rows)
    // initiated = 4 (everything except cancelled).
    expect(f.stages[0]).toMatchObject({ key: 'initiated', count: 4 })
    // confirmed = confirmed + finalised + no_show = 3.
    expect(f.stages[1]).toMatchObject({ key: 'confirmed', count: 3 })
    // completed = finalised only = 1.
    expect(f.stages[2]).toMatchObject({ key: 'completed', count: 1 })
    expect(f.cancelled).toBe(1)
    expect(f.noShow).toBe(1)
  })

  it('reports zero conversions when there are no bookings', () => {
    const f = shapeConversionFunnel([])
    expect(f.stages[0].count).toBe(0)
    expect(f.stages[0].conversionFromPrev).toBe(0)
    expect(f.stages[0].conversionFromTop).toBe(0)
  })
})

describe('shapeTopCustomers', () => {
  it('sorts by revenue desc and caps at the limit', () => {
    const rows: BookingRow[] = [
      makeRow({
        id: '1',
        gross_total: 100,
        customer: {
          id: 'c-A',
          first_name: 'A',
          last_name: 'lice',
          email: 'a@x',
          phone: null,
        },
      }),
      makeRow({
        id: '2',
        gross_total: 50,
        customer: {
          id: 'c-A',
          first_name: 'A',
          last_name: 'lice',
          email: 'a@x',
          phone: null,
        },
      }),
      makeRow({
        id: '3',
        gross_total: 200,
        customer: {
          id: 'c-B',
          first_name: 'Bob',
          last_name: null,
          email: 'b@x',
          phone: null,
        },
      }),
    ]
    const out = shapeTopCustomers(rows, 2)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ customerId: 'c-B', revenue: 200, bookings: 1 })
    expect(out[1]).toMatchObject({ customerId: 'c-A', revenue: 150, bookings: 2 })
  })
})

describe('shapeOccupancyHeatmap', () => {
  it('returns a 7×24 grid and reports the per-cell max', () => {
    // 2026-05-04 (Monday) at 10:00 UTC for both rows → cell (Mon, 10).
    const rows: BookingRow[] = [
      makeRow({
        id: '1',
        created_at: '2026-05-04T10:00:00Z',
        items: [
          {
            id: 'i-1',
            date_range_start: '2026-05-04',
            date_range_end: null,
            selected_days: null,
            products: null,
          },
        ],
      }),
      makeRow({
        id: '2',
        created_at: '2026-05-04T10:30:00Z',
        items: [
          {
            id: 'i-2',
            date_range_start: '2026-05-04',
            date_range_end: null,
            selected_days: null,
            products: null,
          },
        ],
      }),
    ]
    const { cells, max } = shapeOccupancyHeatmap(rows)
    expect(cells).toHaveLength(7 * 24)
    expect(max).toBe(2)
    const monday10 = cells.find((c) => c.weekday === 0 && c.hour === 10)
    expect(monday10?.count).toBe(2)
  })
})

describe('computeAnalyticsKpis', () => {
  it('matches the reporting KPI semantics (cancelled excluded from revenue)', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', gross_total: 100 }),
      makeRow({ id: '2', gross_total: 200 }),
      makeRow({
        id: '3',
        gross_total: 500,
        current_semantic_state: 'cancelled',
      }),
    ]
    const k = computeAnalyticsKpis(rows)
    expect(k.bookingCount).toBe(3)
    expect(k.revenueTotal).toBe(300)
    expect(k.averageTicket).toBe(150)
    expect(k.cancelledExcluded).toBe(1)
    expect(k.currency).toBe('EUR')
    expect(k.mixedCurrency).toBe(false)
  })

  it('flags mixed-currency operators', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', currency: 'EUR' }),
      makeRow({ id: '2', currency: 'USD' }),
    ]
    expect(computeAnalyticsKpis(rows).mixedCurrency).toBe(true)
  })
})
