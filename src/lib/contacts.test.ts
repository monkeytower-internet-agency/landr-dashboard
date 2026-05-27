// landr-dp45 — fetchContacts hides GDPR-erased tombstones by default.
//
// Asserts the PostgREST query builder receives `.is('gdpr_erased_at', null)`
// when `opts.includeErased` is omitted/false, and omits it when true. The
// existing `.is('deleted_at', null)` filter is independent and always
// applies (separate concern — soft-delete vs GDPR erase).
//
// landr-6993 — extended with coverage for fetchUpcomingBookingsByContact,
// mergeNextBookingDates, contactBookingWindow, and todayIsoDate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IsCall = { column: string; value: unknown }

const builderState = {
  isCalls: [] as IsCall[],
  overlapsCalls: [] as Array<{ column: string; values: unknown }>,
  neqCalls: [] as Array<{ column: string; value: unknown }>,
  selectCalls: [] as string[],
  fromCalls: [] as string[],
  // landr-6993 — pluggable result so per-test bookings fixtures flow
  // through the .limit() resolver.
  limitResult: { data: [] as unknown[], error: null as Error | null },
}

const { mockSupabase } = vi.hoisted(() => {
  const state = {
    isCalls: [] as IsCall[],
    overlapsCalls: [] as Array<{ column: string; values: unknown }>,
    neqCalls: [] as Array<{ column: string; value: unknown }>,
    selectCalls: [] as string[],
    fromCalls: [] as string[],
    limitResult: { data: [] as unknown[], error: null as Error | null },
  }
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: vi.fn((sel: string) => {
      state.selectCalls.push(sel)
      return builder
    }),
    eq: vi.fn(() => builder),
    is: vi.fn((column: string, value: unknown) => {
      state.isCalls.push({ column, value })
      return builder
    }),
    neq: vi.fn((column: string, value: unknown) => {
      state.neqCalls.push({ column, value })
      return builder
    }),
    overlaps: vi.fn((column: string, values: unknown) => {
      state.overlapsCalls.push({ column, values })
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => state.limitResult),
  })
  const supabase = {
    from: vi.fn((table: string) => {
      state.fromCalls.push(table)
      return builder
    }),
  }
  return { mockSupabase: { state, supabase, builder } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase.supabase,
  getSupabase: () => mockSupabase.supabase,
}))

import {
  contactBookingWindow,
  fetchContacts,
  fetchUpcomingBookingsByContact,
  mergeNextBookingDates,
  todayIsoDate,
  type ContactRow,
} from './contacts'

beforeEach(() => {
  mockSupabase.state.isCalls.length = 0
  mockSupabase.state.overlapsCalls.length = 0
  mockSupabase.state.neqCalls.length = 0
  mockSupabase.state.selectCalls.length = 0
  mockSupabase.state.fromCalls.length = 0
  mockSupabase.state.limitResult = { data: [], error: null }
  builderState.isCalls = mockSupabase.state.isCalls
  builderState.overlapsCalls = mockSupabase.state.overlapsCalls
  builderState.neqCalls = mockSupabase.state.neqCalls
  builderState.selectCalls = mockSupabase.state.selectCalls
  builderState.fromCalls = mockSupabase.state.fromCalls
  builderState.limitResult = mockSupabase.state.limitResult
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('fetchContacts — GDPR-erased visibility', () => {
  it('applies .is("gdpr_erased_at", null) by default (includeErased omitted)', async () => {
    await fetchContacts('op-1')
    const isColumns = builderState.isCalls.map((c) => c.column)
    expect(isColumns).toContain('deleted_at')
    expect(isColumns).toContain('gdpr_erased_at')
    const erasedCall = builderState.isCalls.find(
      (c) => c.column === 'gdpr_erased_at',
    )
    expect(erasedCall?.value).toBeNull()
  })

  it('applies .is("gdpr_erased_at", null) when includeErased is false', async () => {
    await fetchContacts('op-1', { includeErased: false })
    const isColumns = builderState.isCalls.map((c) => c.column)
    expect(isColumns).toContain('gdpr_erased_at')
  })

  it('omits the gdpr_erased_at filter when includeErased is true', async () => {
    await fetchContacts('op-1', { includeErased: true })
    const isColumns = builderState.isCalls.map((c) => c.column)
    expect(isColumns).toContain('deleted_at') // unchanged, independent concern
    expect(isColumns).not.toContain('gdpr_erased_at')
  })

  it('composes with the types overlap filter independently', async () => {
    await fetchContacts('op-1', { types: ['customer'], includeErased: true })
    const isColumns = builderState.isCalls.map((c) => c.column)
    expect(isColumns).not.toContain('gdpr_erased_at')
    expect(builderState.overlapsCalls).toHaveLength(1)
    expect(builderState.overlapsCalls[0]).toEqual({
      column: 'types',
      values: ['customer'],
    })
  })
})

// ──────────────────────────────────────────────────────────────────────
// landr-6993 — upcoming-bookings helpers
// ──────────────────────────────────────────────────────────────────────

describe('todayIsoDate (landr-6993)', () => {
  it('formats local-clock today as YYYY-MM-DD with zero-padded month/day', () => {
    expect(todayIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayIsoDate(new Date(2026, 10, 30))).toBe('2026-11-30')
  })
})

describe('contactBookingWindow (landr-6993)', () => {
  const today = '2026-05-22'

  it("returns 'today' when next_booking_date equals today", () => {
    expect(
      contactBookingWindow({ next_booking_date: today }, today),
    ).toBe('today')
  })

  it("returns 'future' when next_booking_date is after today", () => {
    expect(
      contactBookingWindow({ next_booking_date: '2026-05-30' }, today),
    ).toBe('future')
  })

  it("returns 'none' when next_booking_date is null/undefined or before today", () => {
    expect(contactBookingWindow({ next_booking_date: null }, today)).toBe('none')
    expect(contactBookingWindow({}, today)).toBe('none')
    // Past date — fetchUpcomingBookingsByContact filters these out before
    // hitting this helper, but we defensively treat past as 'none' so a
    // stale cache can't accidentally light up an icon.
    expect(
      contactBookingWindow({ next_booking_date: '2026-05-01' }, today),
    ).toBe('none')
  })
})

describe('mergeNextBookingDates (landr-6993)', () => {
  function row(id: string, overrides: Partial<ContactRow> = {}): ContactRow {
    return {
      id,
      operator_id: 'op-1',
      first_name: 'A',
      last_name: 'B',
      email: null,
      phone: null,
      preferred_locale: null,
      preferred_timezone: null,
      do_not_contact: false,
      created_at: '2026-05-12T10:00:00.000Z',
      updated_at: '2026-05-12T10:00:00.000Z',
      deleted_at: null,
      gdpr_erased_at: null,
      gdpr_erased_by_user_id: null,
      gdpr_erasure_note: null,
      ...overrides,
    } as ContactRow
  }

  it('sets next_booking_date from the map by contact id', () => {
    const rows = [row('c-1'), row('c-2'), row('c-3')]
    const map = new Map([
      ['c-1', '2026-05-22'],
      ['c-3', '2026-05-30'],
    ])
    const out = mergeNextBookingDates(rows, map)
    expect(out.map((r) => r.next_booking_date)).toEqual([
      '2026-05-22',
      null,
      '2026-05-30',
    ])
  })

  it('returns a new array (no in-place mutation)', () => {
    const rows = [row('c-1')]
    const out = mergeNextBookingDates(rows, new Map())
    expect(out).not.toBe(rows)
    expect(out[0]).not.toBe(rows[0])
  })

  it('preserves other fields untouched', () => {
    const rows = [row('c-1', { first_name: 'Alice' })]
    const out = mergeNextBookingDates(
      rows,
      new Map([['c-1', '2026-05-25']]),
    )
    expect(out[0].first_name).toBe('Alice')
    expect(out[0].next_booking_date).toBe('2026-05-25')
  })
})

describe('fetchUpcomingBookingsByContact (landr-6993)', () => {
  const today = '2026-05-22'

  it('issues a bookings query scoped to operator + non-cancelled + non-deleted', async () => {
    await fetchUpcomingBookingsByContact('op-1', { today })
    expect(builderState.fromCalls).toContain('bookings')
    // .is('deleted_at', null) and .neq('current_semantic_state','cancelled')
    expect(builderState.isCalls.map((c) => c.column)).toContain('deleted_at')
    expect(builderState.neqCalls).toContainEqual({
      column: 'current_semantic_state',
      value: 'cancelled',
    })
  })

  it('returns the EARLIEST future date per contact, dropping past items', async () => {
    mockSupabase.state.limitResult = {
      data: [
        {
          customer_contact_id: 'c-1',
          items: [
            { date_range_start: '2026-04-01' }, // past — drop
            { date_range_start: '2026-05-30' }, // future
            { date_range_start: '2026-06-10' }, // future
          ],
        },
        {
          customer_contact_id: 'c-2',
          items: [
            { date_range_start: today }, // today — keep
            { date_range_start: '2026-06-15' }, // future
          ],
        },
        {
          customer_contact_id: 'c-3',
          items: [{ date_range_start: '2026-01-01' }], // past — drop entirely
        },
      ],
      error: null,
    }
    const map = await fetchUpcomingBookingsByContact('op-1', { today })
    expect(map.get('c-1')).toBe('2026-05-30')
    expect(map.get('c-2')).toBe(today)
    expect(map.has('c-3')).toBe(false)
  })

  it('collapses multiple bookings for the same contact to the earliest future date', async () => {
    mockSupabase.state.limitResult = {
      data: [
        {
          customer_contact_id: 'c-1',
          items: [{ date_range_start: '2026-06-01' }],
        },
        {
          customer_contact_id: 'c-1',
          items: [{ date_range_start: '2026-05-25' }],
        },
        {
          customer_contact_id: 'c-1',
          items: [{ date_range_start: '2026-07-10' }],
        },
      ],
      error: null,
    }
    const map = await fetchUpcomingBookingsByContact('op-1', { today })
    expect(map.get('c-1')).toBe('2026-05-25')
  })

  it('ignores bookings with null items / null customer_contact_id', async () => {
    mockSupabase.state.limitResult = {
      data: [
        { customer_contact_id: null, items: [{ date_range_start: '2026-06-01' }] },
        { customer_contact_id: 'c-1', items: null },
        {
          customer_contact_id: 'c-2',
          items: [{ date_range_start: null }, { date_range_start: '2026-06-05' }],
        },
      ],
      error: null,
    }
    const map = await fetchUpcomingBookingsByContact('op-1', { today })
    expect(map.size).toBe(1)
    expect(map.get('c-2')).toBe('2026-06-05')
  })
})
