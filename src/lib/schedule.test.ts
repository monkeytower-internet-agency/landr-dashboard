// landr-lp9t — exhaustive grouping cases for the Schedule List view.

import { describe, expect, it } from 'vitest'

import type { AvailabilityRow } from '@/lib/availability'
import { compactRanges, formatRangeDate } from './schedule'

function makeRow(overrides: Partial<AvailabilityRow> = {}): AvailabilityRow {
  return {
    id: `avail-${overrides.date ?? 'x'}-${overrides.start_time ?? 'open'}`,
    operator_id: 'op-1',
    product_id: 'prod-1',
    date: '2026-06-01',
    start_time: null,
    end_time: null,
    capacity: 6,
    capacity_reserved: 0,
    status: 'open',
    source: 'manual',
    source_template_id: null,
    notes: null,
    created_at: '2026-05-19T12:00:00.000Z',
    updated_at: '2026-05-19T12:00:00.000Z',
    ...overrides,
  }
}

describe('compactRanges', () => {
  it('returns an empty array for empty input', () => {
    expect(compactRanges([])).toEqual([])
  })

  it('returns one one-day range for a single row', () => {
    const ranges = compactRanges([makeRow({ date: '2026-06-01' })])
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      capacity: 6,
      days: 1,
    })
  })

  it('collapses a contiguous block with identical capacity into one range', () => {
    const rows = [
      makeRow({ date: '2026-06-01', capacity_reserved: 1 }),
      makeRow({ date: '2026-06-02', capacity_reserved: 2 }),
      makeRow({ date: '2026-06-03', capacity_reserved: 0 }),
    ]
    const ranges = compactRanges(rows)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      capacity: 6,
      reserved: 3,
      days: 3,
    })
  })

  it('breaks the range at a calendar gap (Jun 1, Jun 2, [skip], Jun 5)', () => {
    const rows = [
      makeRow({ date: '2026-06-01' }),
      makeRow({ date: '2026-06-02' }),
      makeRow({ date: '2026-06-05' }),
    ]
    const ranges = compactRanges(rows)
    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      days: 2,
    })
    expect(ranges[1]).toMatchObject({
      startDate: '2026-06-05',
      endDate: '2026-06-05',
      days: 1,
    })
  })

  it('breaks the range when capacity changes mid-stretch', () => {
    const rows = [
      makeRow({ date: '2026-06-01', capacity: 6 }),
      makeRow({ date: '2026-06-02', capacity: 6 }),
      makeRow({ date: '2026-06-03', capacity: 4 }),
      makeRow({ date: '2026-06-04', capacity: 4 }),
    ]
    const ranges = compactRanges(rows)
    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      capacity: 6,
      days: 2,
    })
    expect(ranges[1]).toMatchObject({
      startDate: '2026-06-03',
      endDate: '2026-06-04',
      capacity: 4,
      days: 2,
    })
  })

  it('breaks the range when slot times change (null/null vs 09:00/11:00)', () => {
    const rows = [
      makeRow({ date: '2026-06-01' }),
      makeRow({ date: '2026-06-02' }),
      makeRow({
        date: '2026-06-03',
        start_time: '09:00:00',
        end_time: '11:00:00',
      }),
      makeRow({
        date: '2026-06-04',
        start_time: '09:00:00',
        end_time: '11:00:00',
      }),
    ]
    const ranges = compactRanges(rows)
    expect(ranges).toHaveLength(2)
    expect(ranges[0].endDate).toBe('2026-06-02')
    expect(ranges[1].startDate).toBe('2026-06-03')
    expect(ranges[1].endDate).toBe('2026-06-04')
  })

  it('keeps a single closed day (capacity=0) as its own row even when neighbours match', () => {
    const rows = [
      makeRow({ date: '2026-06-01', capacity: 6 }),
      makeRow({ date: '2026-06-02', capacity: 0 }),
      makeRow({ date: '2026-06-03', capacity: 6 }),
    ]
    const ranges = compactRanges(rows)
    expect(ranges).toHaveLength(3)
    expect(ranges[1]).toMatchObject({
      startDate: '2026-06-02',
      endDate: '2026-06-02',
      capacity: 0,
    })
  })

  it('sorts unsorted input before compacting', () => {
    const rows = [
      makeRow({ date: '2026-06-03' }),
      makeRow({ date: '2026-06-01' }),
      makeRow({ date: '2026-06-02' }),
    ]
    const ranges = compactRanges(rows)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      days: 3,
    })
  })

  it('emits multi-slot days as standalone ranges (never folds them)', () => {
    // Two slots on Jun 2 means that day has a unique multi-slot shape and
    // must not glue itself to neighbour days even at identical capacity.
    const rows = [
      makeRow({ date: '2026-06-01', capacity: 6 }),
      makeRow({
        id: 'avail-2a',
        date: '2026-06-02',
        capacity: 6,
        start_time: '09:00:00',
        end_time: '11:00:00',
      }),
      makeRow({
        id: 'avail-2b',
        date: '2026-06-02',
        capacity: 6,
        start_time: '14:00:00',
        end_time: '16:00:00',
      }),
      makeRow({ date: '2026-06-03', capacity: 6 }),
    ]
    const ranges = compactRanges(rows)
    // Jun 1 alone, Jun 2 (two rows packed as one one-day range), Jun 3 alone.
    expect(ranges.map((r) => [r.startDate, r.endDate])).toEqual([
      ['2026-06-01', '2026-06-01'],
      ['2026-06-02', '2026-06-02'],
      ['2026-06-03', '2026-06-03'],
    ])
  })

  it('compacts a 30-day uniform season into one row', () => {
    const rows: AvailabilityRow[] = []
    for (let day = 1; day <= 30; day++) {
      rows.push(
        makeRow({
          date: `2026-06-${String(day).padStart(2, '0')}`,
        }),
      )
    }
    const ranges = compactRanges(rows)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      days: 30,
    })
  })
})

describe('formatRangeDate', () => {
  it('renders weekday + month + day for a known ISO date', () => {
    // 2026-06-01 was a Monday.
    expect(formatRangeDate('2026-06-01')).toMatch(/Mon/)
    expect(formatRangeDate('2026-06-01')).toMatch(/Jun/)
    expect(formatRangeDate('2026-06-01')).toMatch(/1/)
  })

  it('is timezone-safe — 2026-06-01 never renders as May 31', () => {
    expect(formatRangeDate('2026-06-01')).not.toMatch(/May/)
  })
})
