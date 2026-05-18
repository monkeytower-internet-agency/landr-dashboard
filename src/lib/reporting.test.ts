import { describe, expect, it } from 'vitest'
import type { BookingRow } from '@/lib/bookings'
import {
  buildBookingsCsv,
  computeKpis,
  csvEscape,
  filterByDateRange,
  rowsToCsv,
  shapeBookingsPerWeek,
  shapeRevenueOverTime,
} from './reporting'

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

describe('computeKpis', () => {
  it('sums revenue and counts non-cancelled bookings', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', gross_total: 100, current_semantic_state: 'confirmed' }),
      makeRow({ id: '2', gross_total: 250, current_semantic_state: 'finalised' }),
      makeRow({ id: '3', gross_total: 80, current_semantic_state: 'pending' }),
    ]
    const k = computeKpis(rows)
    expect(k.bookingCount).toBe(3)
    expect(k.revenueTotal).toBe(430)
    expect(k.averageTicket).toBe(Math.round((430 / 3) * 100) / 100)
    expect(k.currency).toBe('EUR')
    expect(k.mixedCurrency).toBe(false)
    expect(k.cancelledExcluded).toBe(0)
  })

  it('excludes cancelled bookings from revenue but still counts them in total', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', gross_total: 100, current_semantic_state: 'confirmed' }),
      makeRow({ id: '2', gross_total: 500, current_semantic_state: 'cancelled' }),
    ]
    const k = computeKpis(rows)
    expect(k.bookingCount).toBe(2)
    expect(k.revenueTotal).toBe(100)
    expect(k.averageTicket).toBe(100)
    expect(k.cancelledExcluded).toBe(1)
  })

  it('handles empty input gracefully', () => {
    const k = computeKpis([])
    expect(k.bookingCount).toBe(0)
    expect(k.revenueTotal).toBe(0)
    expect(k.averageTicket).toBe(0)
  })

  it('parses string gross_total numerics from Supabase', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', gross_total: '120.50' }),
      makeRow({ id: '2', gross_total: '79.50' }),
    ]
    const k = computeKpis(rows)
    expect(k.revenueTotal).toBe(200)
    expect(k.averageTicket).toBe(100)
  })

  it('flags mixed currency', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', gross_total: 100, currency: 'EUR' }),
      makeRow({ id: '2', gross_total: 100, currency: 'USD' }),
    ]
    const k = computeKpis(rows)
    expect(k.mixedCurrency).toBe(true)
  })
})

describe('filterByDateRange', () => {
  const rows: BookingRow[] = [
    makeRow({ id: '1', created_at: '2026-05-01T10:00:00Z' }),
    makeRow({ id: '2', created_at: '2026-05-05T10:00:00Z' }),
    makeRow({ id: '3', created_at: '2026-05-10T10:00:00Z' }),
  ]

  it('returns all rows when range is fully open', () => {
    expect(filterByDateRange(rows, { from: null, to: null })).toHaveLength(3)
  })

  it('filters inclusively on the lower bound', () => {
    const r = filterByDateRange(rows, { from: '2026-05-05', to: null })
    expect(r.map((x) => x.id)).toEqual(['2', '3'])
  })

  it('filters inclusively on the upper bound', () => {
    const r = filterByDateRange(rows, { from: null, to: '2026-05-05' })
    expect(r.map((x) => x.id)).toEqual(['1', '2'])
  })

  it('filters on both bounds', () => {
    const r = filterByDateRange(rows, { from: '2026-05-02', to: '2026-05-09' })
    expect(r.map((x) => x.id)).toEqual(['2'])
  })
})

describe('shapeRevenueOverTime', () => {
  it('groups by UTC date and excludes cancelled', () => {
    const rows: BookingRow[] = [
      makeRow({
        id: '1',
        created_at: '2026-05-01T10:00:00Z',
        gross_total: 100,
      }),
      makeRow({
        id: '2',
        created_at: '2026-05-01T18:00:00Z',
        gross_total: 50,
      }),
      makeRow({
        id: '3',
        created_at: '2026-05-03T08:00:00Z',
        gross_total: 200,
      }),
      makeRow({
        id: '4',
        created_at: '2026-05-03T08:00:00Z',
        gross_total: 999,
        current_semantic_state: 'cancelled',
      }),
    ]
    const points = shapeRevenueOverTime(rows)
    // First and last date are present, intermediate days zero-filled.
    expect(points).toEqual([
      { date: '2026-05-01', revenue: 150 },
      { date: '2026-05-02', revenue: 0 },
      { date: '2026-05-03', revenue: 200 },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(shapeRevenueOverTime([])).toEqual([])
  })
})

describe('shapeBookingsPerWeek', () => {
  it('buckets bookings into ISO-8601 weeks by scheduled date', () => {
    const rows: BookingRow[] = [
      // Mon 2026-05-04 -> week 2026-W19
      makeRow({
        id: '1',
        created_at: '2026-05-04T10:00:00Z',
        items: [
          {
            id: 'i-1',
            date_range_start: '2026-05-04',
            date_range_end: '2026-05-04',
            selected_days: null,
            products: null,
          },
        ],
      }),
      // Sun 2026-05-10 -> still week 2026-W19
      makeRow({
        id: '2',
        created_at: '2026-05-10T10:00:00Z',
        items: [
          {
            id: 'i-2',
            date_range_start: '2026-05-10',
            date_range_end: '2026-05-10',
            selected_days: null,
            products: null,
          },
        ],
      }),
      // Mon 2026-05-11 -> week 2026-W20
      makeRow({
        id: '3',
        created_at: '2026-05-11T10:00:00Z',
        items: [
          {
            id: 'i-3',
            date_range_start: '2026-05-11',
            date_range_end: '2026-05-11',
            selected_days: null,
            products: null,
          },
        ],
      }),
      // Cancelled -> excluded
      makeRow({
        id: '4',
        created_at: '2026-05-11T10:00:00Z',
        current_semantic_state: 'cancelled',
        items: [
          {
            id: 'i-4',
            date_range_start: '2026-05-11',
            date_range_end: '2026-05-11',
            selected_days: null,
            products: null,
          },
        ],
      }),
    ]
    const points = shapeBookingsPerWeek(rows)
    expect(points).toEqual([
      { week: '2026-W19', weekStart: '2026-05-04', bookings: 2 },
      { week: '2026-W20', weekStart: '2026-05-11', bookings: 1 },
    ])
  })

  it('falls back to created_at when no scheduled item', () => {
    const rows: BookingRow[] = [
      makeRow({ id: '1', created_at: '2026-05-04T10:00:00Z', items: [] }),
    ]
    const points = shapeBookingsPerWeek(rows)
    expect(points).toEqual([
      { week: '2026-W19', weekStart: '2026-05-04', bookings: 1 },
    ])
  })
})

describe('csvEscape', () => {
  it('returns plain strings unchanged', () => {
    expect(csvEscape('hello')).toBe('hello')
    expect(csvEscape(42)).toBe('42')
  })

  it('wraps fields containing commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('doubles embedded quotes and wraps', () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""')
  })

  it('wraps fields containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"')
  })

  it('returns empty for null/undefined/empty', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(csvEscape('')).toBe('')
  })
})

describe('rowsToCsv', () => {
  it('joins headers and rows with CRLF and escapes properly', () => {
    const csv = rowsToCsv(
      ['Name', 'Note'],
      [
        ['Alice', 'plain'],
        ['Bob, Jr.', 'has "quote"'],
      ],
    )
    expect(csv).toBe(
      'Name,Note\r\nAlice,plain\r\n"Bob, Jr.","has ""quote"""\r\n',
    )
  })
})

describe('buildBookingsCsv', () => {
  it('builds a CSV with stable headers and escapes user content', () => {
    const rows: BookingRow[] = [
      makeRow({
        id: 'b-1',
        created_at: '2026-05-01T10:00:00.000Z',
        gross_total: 150,
        customer: {
          id: 'c-1',
          first_name: 'Alice, Jr.',
          last_name: 'Anderson',
          email: 'alice@example.com',
          phone: null,
        },
        items: [
          {
            id: 'i-1',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: { id: 'p-1', name: 'Tandem "Pro" Flight' },
          },
        ],
      }),
    ]
    const csv = buildBookingsCsv(rows)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'Created,Booking ID,Customer,Email,State,Gross total,Currency,Product(s)',
    )
    expect(lines[1]).toBe(
      '2026-05-01T10:00:00.000Z,b-1,"Alice, Jr. Anderson",alice@example.com,confirmed,150.00,EUR,"Tandem ""Pro"" Flight"',
    )
  })
})
