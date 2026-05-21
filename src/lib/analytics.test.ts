import { describe, expect, it } from 'vitest'
import type { BookingRow } from '@/lib/bookings'
import type {
  BookingDayProviderAssignmentRow,
  ProviderRow,
} from '@/lib/assignments'
import type {
  VoucherRedemptionRow,
  VoucherRow,
} from '@/lib/vouchers-analytics'
import {
  bucketForRange,
  computeAnalyticsKpis,
  daysAgoUtcIso,
  filterByCreatedAt,
  rangeWindowDays,
  shapeBookingsPerProduct,
  shapeConversionFunnel,
  shapeOccupancyHeatmap,
  shapePerStaffRevenue,
  shapeRevenueOverTime,
  shapeTopCustomers,
  shapeVoucherPerformance,
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

// ---------------------------------------------------------------------------
// shapePerStaffRevenue (landr-ce45)
// ---------------------------------------------------------------------------

function makeProvider(over: Partial<ProviderRow> & { id: string }): ProviderRow {
  return {
    id: over.id,
    operator_id: over.operator_id ?? 'op-1',
    display_name: over.display_name ?? `Provider ${over.id}`,
    active: over.active ?? true,
    sort_order: over.sort_order ?? 0,
  }
}

function makeAssignment(
  over: Partial<BookingDayProviderAssignmentRow> & {
    id: string
    booking_id: string
    provider_id: string
    assignment_date: string
  },
): BookingDayProviderAssignmentRow {
  return {
    id: over.id,
    operator_id: over.operator_id ?? 'op-1',
    booking_id: over.booking_id,
    provider_id: over.provider_id,
    assignment_date: over.assignment_date,
  }
}

describe('shapePerStaffRevenue', () => {
  it('attributes a single-provider, single-day booking entirely to that provider', () => {
    const bookings = [makeRow({ id: 'b-1', gross_total: 200 })]
    const providers = [makeProvider({ id: 'p-1', display_name: 'Martin' })]
    const assignments = [
      makeAssignment({
        id: 'a-1',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-10',
      }),
    ]
    const out = shapePerStaffRevenue({ bookings, providers, assignments })
    expect(out).toEqual([
      {
        providerId: 'p-1',
        providerName: 'Martin',
        bookings: 1,
        revenue: 200,
        averagePerBooking: 200,
      },
    ])
  })

  it('splits a single-day booking with two providers evenly between them', () => {
    const bookings = [makeRow({ id: 'b-1', gross_total: 300 })]
    const providers = [
      makeProvider({ id: 'p-1', display_name: 'Martin' }),
      makeProvider({ id: 'p-2', display_name: 'Oz' }),
    ]
    const assignments = [
      makeAssignment({
        id: 'a-1',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-10',
      }),
      makeAssignment({
        id: 'a-2',
        booking_id: 'b-1',
        provider_id: 'p-2',
        assignment_date: '2026-05-10',
      }),
    ]
    const out = shapePerStaffRevenue({ bookings, providers, assignments })
    // Both providers tied on revenue → sort falls through to name asc.
    expect(out.map((r) => r.providerName)).toEqual(['Martin', 'Oz'])
    expect(out.every((r) => r.revenue === 150)).toBe(true)
    expect(out.every((r) => r.bookings === 1)).toBe(true)
    expect(out.every((r) => r.averagePerBooking === 150)).toBe(true)
    // Totals reconcile back to gross_total.
    const sum = out.reduce((a, r) => a + r.revenue, 0)
    expect(sum).toBeCloseTo(300)
  })

  it('splits a multi-day booking across the days it spans', () => {
    // 2-day booking, one provider per day → each row carries half the gross.
    const bookings = [makeRow({ id: 'b-1', gross_total: 400 })]
    const providers = [
      makeProvider({ id: 'p-1', display_name: 'Alice' }),
      makeProvider({ id: 'p-2', display_name: 'Bob' }),
    ]
    const assignments = [
      makeAssignment({
        id: 'a-1',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-10',
      }),
      makeAssignment({
        id: 'a-2',
        booking_id: 'b-1',
        provider_id: 'p-2',
        assignment_date: '2026-05-11',
      }),
    ]
    const out = shapePerStaffRevenue({ bookings, providers, assignments })
    expect(out).toEqual([
      {
        providerId: 'p-1',
        providerName: 'Alice',
        bookings: 1,
        revenue: 200,
        averagePerBooking: 200,
      },
      {
        providerId: 'p-2',
        providerName: 'Bob',
        bookings: 1,
        revenue: 200,
        averagePerBooking: 200,
      },
    ])
  })

  it('excludes revenue from cancelled bookings but still counts the assignment', () => {
    const bookings = [
      makeRow({ id: 'b-1', gross_total: 500, current_semantic_state: 'cancelled' }),
      makeRow({ id: 'b-2', gross_total: 100, current_semantic_state: 'finalised' }),
    ]
    const providers = [makeProvider({ id: 'p-1', display_name: 'Carla' })]
    const assignments = [
      makeAssignment({
        id: 'a-1',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-10',
      }),
      makeAssignment({
        id: 'a-2',
        booking_id: 'b-2',
        provider_id: 'p-1',
        assignment_date: '2026-05-11',
      }),
    ]
    const out = shapePerStaffRevenue({ bookings, providers, assignments })
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      providerId: 'p-1',
      providerName: 'Carla',
      bookings: 2, // both bookings counted
      revenue: 100, // cancelled booking contributes 0
      averagePerBooking: 50, // 100 / 2 distinct bookings
    })
  })

  it('sorts results by revenue desc and resolves unknown provider ids gracefully', () => {
    const bookings = [
      makeRow({ id: 'b-1', gross_total: 100 }),
      makeRow({ id: 'b-2', gross_total: 300 }),
    ]
    // p-2 is intentionally absent from the providers list (e.g. soft-deleted
    // since the assignment was made) — the shaper must still emit a row.
    const providers = [makeProvider({ id: 'p-1', display_name: 'Anna' })]
    const assignments = [
      makeAssignment({
        id: 'a-1',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-10',
      }),
      makeAssignment({
        id: 'a-2',
        booking_id: 'b-2',
        provider_id: 'p-2-missing-id',
        assignment_date: '2026-05-11',
      }),
    ]
    const out = shapePerStaffRevenue({ bookings, providers, assignments })
    expect(out).toHaveLength(2)
    // p-2 has 300 revenue → ranks first.
    expect(out[0].providerId).toBe('p-2-missing-id')
    expect(out[0].providerName).toContain('unknown provider')
    expect(out[0].revenue).toBe(300)
    expect(out[1].providerId).toBe('p-1')
    expect(out[1].revenue).toBe(100)
  })

  it('returns an empty array when there are no assignments', () => {
    const out = shapePerStaffRevenue({
      bookings: [makeRow({ id: 'b-1', gross_total: 100 })],
      providers: [makeProvider({ id: 'p-1' })],
      assignments: [],
    })
    expect(out).toEqual([])
  })

  it('skips assignments pointing at bookings outside the loaded set', () => {
    // Orphan assignment — booking id not in `bookings` (e.g. soft-deleted or
    // outside the fetched window). Should not contribute revenue or appear
    // in the provider row at all.
    const bookings = [makeRow({ id: 'b-1', gross_total: 100 })]
    const providers = [makeProvider({ id: 'p-1', display_name: 'Eve' })]
    const assignments = [
      makeAssignment({
        id: 'a-1',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-10',
      }),
      makeAssignment({
        id: 'a-2',
        booking_id: 'b-unknown',
        provider_id: 'p-1',
        assignment_date: '2026-05-11',
      }),
    ]
    const out = shapePerStaffRevenue({ bookings, providers, assignments })
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      providerId: 'p-1',
      providerName: 'Eve',
      bookings: 1, // only b-1 counted; orphan b-unknown is skipped
      revenue: 100,
      averagePerBooking: 100,
    })
  })

  it('correctly attributes a booking with two providers across two days (2×2 grid)', () => {
    // 4 assignment rows total → each carries 1/4 of gross_total.
    const bookings = [makeRow({ id: 'b-1', gross_total: 400 })]
    const providers = [
      makeProvider({ id: 'p-1', display_name: 'Alpha' }),
      makeProvider({ id: 'p-2', display_name: 'Bravo' }),
    ]
    const assignments = [
      makeAssignment({
        id: 'a-1',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-10',
      }),
      makeAssignment({
        id: 'a-2',
        booking_id: 'b-1',
        provider_id: 'p-2',
        assignment_date: '2026-05-10',
      }),
      makeAssignment({
        id: 'a-3',
        booking_id: 'b-1',
        provider_id: 'p-1',
        assignment_date: '2026-05-11',
      }),
      makeAssignment({
        id: 'a-4',
        booking_id: 'b-1',
        provider_id: 'p-2',
        assignment_date: '2026-05-11',
      }),
    ]
    const out = shapePerStaffRevenue({ bookings, providers, assignments })
    // Each provider has 2 of the 4 rows → 2/4 × 400 = 200 each.
    // But it's only 1 distinct booking each.
    expect(out).toHaveLength(2)
    expect(out.every((r) => r.bookings === 1)).toBe(true)
    expect(out.every((r) => r.revenue === 200)).toBe(true)
    expect(out.every((r) => r.averagePerBooking === 200)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// shapeVoucherPerformance — landr-1jgr
// ---------------------------------------------------------------------------

function makeVoucher(over: Partial<VoucherRow> & { id: string }): VoucherRow {
  return {
    id: over.id,
    operator_id: over.operator_id ?? 'op-1',
    code: over.code ?? `CODE-${over.id}`,
    kind: over.kind ?? 'percent',
    amount: over.amount ?? 10,
    currency: over.currency ?? 'EUR',
    used_count: over.used_count ?? 0,
    max_uses: over.max_uses ?? null,
    active: over.active ?? true,
  }
}

function makeRedemption(
  over: Partial<VoucherRedemptionRow> & {
    booking_id: string
    voucher_id: string
  },
): VoucherRedemptionRow {
  return {
    booking_id: over.booking_id,
    voucher_id: over.voucher_id,
    created_at: over.created_at ?? '2026-05-01T10:00:00.000Z',
    gross_total: over.gross_total ?? 90,
    currency: over.currency ?? 'EUR',
    current_semantic_state: over.current_semantic_state ?? 'confirmed',
  }
}

describe('shapeVoucherPerformance', () => {
  it('returns empty when there are no redemptions', () => {
    expect(
      shapeVoucherPerformance({ redemptions: [], vouchers: [] }),
    ).toEqual([])
  })

  it('aggregates flat-voucher discount as amount × redemption count', () => {
    const vouchers = [
      makeVoucher({ id: 'v1', code: 'FLAT5', kind: 'flat', amount: 5 }),
    ]
    const redemptions = [
      makeRedemption({ booking_id: 'b1', voucher_id: 'v1' }),
      makeRedemption({ booking_id: 'b2', voucher_id: 'v1' }),
      makeRedemption({ booking_id: 'b3', voucher_id: 'v1' }),
    ]
    const out = shapeVoucherPerformance({ redemptions, vouchers })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      voucherId: 'v1',
      code: 'FLAT5',
      kind: 'flat',
      redemptions: 3,
      discountTotal: 15,
      currency: 'EUR',
    })
  })

  it('approximates percent-voucher discount from post-discount gross', () => {
    // 10% off; gross_total is post-discount → discount = gross × 10 / 90.
    const vouchers = [
      makeVoucher({ id: 'v1', code: 'TEN', kind: 'percent', amount: 10 }),
    ]
    const redemptions = [
      makeRedemption({
        booking_id: 'b1',
        voucher_id: 'v1',
        gross_total: 90, // pre-discount 100 → 10 off.
      }),
      makeRedemption({
        booking_id: 'b2',
        voucher_id: 'v1',
        gross_total: 180, // pre-discount 200 → 20 off.
      }),
    ]
    const out = shapeVoucherPerformance({ redemptions, vouchers })
    expect(out).toHaveLength(1)
    expect(out[0].redemptions).toBe(2)
    expect(out[0].discountTotal).toBe(30) // 10 + 20.
  })

  it('excludes cancelled bookings from discount total but counts the redemption', () => {
    const vouchers = [
      makeVoucher({ id: 'v1', code: 'FLAT5', kind: 'flat', amount: 5 }),
    ]
    const redemptions = [
      makeRedemption({
        booking_id: 'b1',
        voucher_id: 'v1',
        current_semantic_state: 'confirmed',
      }),
      makeRedemption({
        booking_id: 'b2',
        voucher_id: 'v1',
        current_semantic_state: 'cancelled',
      }),
    ]
    const out = shapeVoucherPerformance({ redemptions, vouchers })
    expect(out[0].redemptions).toBe(2)
    expect(out[0].discountTotal).toBe(5)
  })

  it('falls back to a synthetic label when the voucher row is missing', () => {
    const redemptions = [
      makeRedemption({
        booking_id: 'b1',
        voucher_id: '12345678-aaaa-bbbb-cccc-deletedvoucher',
      }),
    ]
    const out = shapeVoucherPerformance({ redemptions, vouchers: [] })
    expect(out).toHaveLength(1)
    expect(out[0].code).toMatch(/deleted voucher/)
    expect(out[0].kind).toBe('unknown')
    expect(out[0].discountTotal).toBe(0)
  })

  it('handles 100% vouchers as full gross discount', () => {
    const vouchers = [
      makeVoucher({ id: 'v1', code: 'FREE', kind: 'percent', amount: 100 }),
    ]
    const redemptions = [
      makeRedemption({
        booking_id: 'b1',
        voucher_id: 'v1',
        gross_total: 0,
      }),
    ]
    const out = shapeVoucherPerformance({ redemptions, vouchers })
    // 100% off → gross is 0 in practice; discount falls back to gross_total.
    expect(out[0].discountTotal).toBe(0)
  })

  it('sorts by redemption count desc, then discount desc, then code asc', () => {
    const vouchers = [
      makeVoucher({ id: 'va', code: 'AAA', kind: 'flat', amount: 5 }),
      makeVoucher({ id: 'vb', code: 'BBB', kind: 'flat', amount: 5 }),
      makeVoucher({ id: 'vc', code: 'CCC', kind: 'flat', amount: 10 }),
    ]
    const redemptions = [
      // vc: 1 redemption × $10 discount
      makeRedemption({ booking_id: 'b1', voucher_id: 'vc' }),
      // va: 2 redemptions × $5 discount = $10 total
      makeRedemption({ booking_id: 'b2', voucher_id: 'va' }),
      makeRedemption({ booking_id: 'b3', voucher_id: 'va' }),
      // vb: 2 redemptions × $5 discount = $10 total (tie with va — code asc wins).
      makeRedemption({ booking_id: 'b4', voucher_id: 'vb' }),
      makeRedemption({ booking_id: 'b5', voucher_id: 'vb' }),
    ]
    const out = shapeVoucherPerformance({ redemptions, vouchers })
    expect(out.map((r) => r.code)).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('prefers voucher currency over redemption currency for the row', () => {
    const vouchers = [
      makeVoucher({
        id: 'v1',
        code: 'USD5',
        kind: 'flat',
        amount: 5,
        currency: 'USD',
      }),
    ]
    const redemptions = [
      makeRedemption({
        booking_id: 'b1',
        voucher_id: 'v1',
        currency: 'EUR',
      }),
    ]
    const out = shapeVoucherPerformance({ redemptions, vouchers })
    expect(out[0].currency).toBe('USD')
  })
})
