import { describe, expect, it } from 'vitest'
import { bookingDayOptions } from '@/lib/providers'

describe('bookingDayOptions', () => {
  it('expands a contiguous date range inclusive of both ends', () => {
    const days = bookingDayOptions([
      {
        date_range_start: '2026-06-01',
        date_range_end: '2026-06-03',
        selected_days: null,
      },
    ])
    expect(days).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('prefers selected_days when present', () => {
    const days = bookingDayOptions([
      {
        date_range_start: '2026-06-01',
        date_range_end: '2026-06-30',
        selected_days: ['2026-06-09', '2026-06-02'],
      },
    ])
    expect(days).toEqual(['2026-06-02', '2026-06-09'])
  })

  it('handles a single-day range (start only)', () => {
    const days = bookingDayOptions([
      {
        date_range_start: '2026-06-05',
        date_range_end: null,
        selected_days: null,
      },
    ])
    expect(days).toEqual(['2026-06-05'])
  })

  it('unions and de-duplicates across multiple line items', () => {
    const days = bookingDayOptions([
      {
        date_range_start: '2026-06-01',
        date_range_end: '2026-06-02',
        selected_days: null,
      },
      {
        date_range_start: null,
        date_range_end: null,
        selected_days: ['2026-06-02', '2026-06-04'],
      },
    ])
    expect(days).toEqual(['2026-06-01', '2026-06-02', '2026-06-04'])
  })

  it('returns empty for items with no scheduling info', () => {
    const days = bookingDayOptions([
      { date_range_start: null, date_range_end: null, selected_days: null },
      { date_range_start: null, date_range_end: null, selected_days: [] },
    ])
    expect(days).toEqual([])
  })

  it('crosses a month boundary correctly', () => {
    const days = bookingDayOptions([
      {
        date_range_start: '2026-06-29',
        date_range_end: '2026-07-02',
        selected_days: null,
      },
    ])
    expect(days).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ])
  })
})
