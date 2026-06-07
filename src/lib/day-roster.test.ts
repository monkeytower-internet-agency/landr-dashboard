// landr-sr69 — tests for the day-roster aggregation.
//
// Covers the pure derivation (buildDayRoster / flyingDaysForBooking /
// groupRosterByBooking) plus the fetcher's PostgREST shape and the
// companions-excluded / legacy-NULL flying semantics.

import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { BookingRow } from '@/lib/bookings'

// ---- Supabase mock (mirrors booking-participants.test.ts pattern) ----------
const { mock } = vi.hoisted(() => {
  const state: {
    table: string | null
    select: string | null
    eqArgs: Array<[string, unknown]>
    response: { data: unknown; error: { message: string } | null }
  } = { table: null, select: null, eqArgs: [], response: { data: [], error: null } }

  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  Object.assign(builder, {
    then: (resolve: (v: unknown) => void) => resolve(state.response),
  })
  builder.select.mockImplementation((s: string) => {
    state.select = s
    return builder
  })
  builder.eq.mockImplementation((c: string, v: unknown) => {
    state.eqArgs.push([c, v])
    return builder
  })
  builder.order.mockImplementation(() => builder)

  const supabase = {
    from: vi.fn((t: string) => {
      state.table = t
      return builder
    }),
  }
  return { mock: { state, supabase, builder } }
})

vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }))

import {
  buildDayRoster,
  fetchFlyingParticipants,
  flyingDaysForBooking,
  groupRosterByBooking,
  isFlyingParticipant,
  participantContactName,
  bookingRef,
  type FlyingParticipantsByBooking,
} from './day-roster'

beforeEach(() => {
  mock.state.table = null
  mock.state.select = null
  mock.state.eqArgs = []
  mock.state.response = { data: [], error: null }
  vi.clearAllMocks()
})

// ---- fixtures --------------------------------------------------------------

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b-1',
    created_at: '2026-06-01T10:00:00Z',
    current_semantic_state: 'confirmed',
    current_stage: null,
    gross_total: '100',
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Booker',
      last_name: 'One',
      email: 'booker@example.com',
      phone: null,
    },
    items: [
      {
        id: 'bp-1',
        date_range_start: '2026-06-10',
        date_range_end: '2026-06-14',
        // Gapped: flies the 10th + 12th, NOT the 11th/13th/14th stay window.
        selected_days: ['2026-06-10', '2026-06-12'],
        products: {
          id: 'prod-1',
          name: 'Tandem flight',
          product_kind: 'service',
          service_time_shape: 'days_range',
        },
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('flyingDaysForBooking', () => {
  it('uses gapped selected_days, not the contiguous stay window', () => {
    expect(flyingDaysForBooking(makeRow())).toEqual(['2026-06-10', '2026-06-12'])
  })

  it('falls back to date_range_start when selected_days is empty', () => {
    const row = makeRow({
      items: [
        {
          id: 'bp-1',
          date_range_start: '2026-06-10',
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'p',
            name: 'Single day flight',
            product_kind: 'service',
            service_time_shape: 'single_date',
          },
        },
      ],
    })
    expect(flyingDaysForBooking(row)).toEqual(['2026-06-10'])
  })

  it('excludes hotel_room products (stay window, not flying days)', () => {
    const row = makeRow({
      items: [
        {
          id: 'activity',
          date_range_start: '2026-06-10',
          date_range_end: null,
          selected_days: ['2026-06-10'],
          products: {
            id: 'p-act',
            name: 'Flight',
            product_kind: 'service',
            service_time_shape: 'days_range',
          },
        },
        {
          id: 'hotel',
          date_range_start: '2026-06-09',
          date_range_end: '2026-06-15',
          selected_days: ['2026-06-09', '2026-06-10', '2026-06-11'],
          products: {
            id: 'p-hotel',
            name: 'Double room',
            product_kind: 'hotel_room',
            service_time_shape: null,
          },
        },
      ],
    })
    // Only the activity day, none of the hotel-stay days.
    expect(flyingDaysForBooking(row)).toEqual(['2026-06-10'])
  })

  it('unions + sorts + de-dupes across multiple activity products', () => {
    const row = makeRow({
      items: [
        {
          id: 'a',
          date_range_start: '2026-06-12',
          date_range_end: null,
          selected_days: ['2026-06-12', '2026-06-10'],
          products: {
            id: 'pa',
            name: 'A',
            product_kind: 'service',
            service_time_shape: 'days_range',
          },
        },
        {
          id: 'b',
          date_range_start: '2026-06-10',
          date_range_end: null,
          selected_days: ['2026-06-10', '2026-06-11'],
          products: {
            id: 'pb',
            name: 'B',
            product_kind: 'service',
            service_time_shape: 'days_range',
          },
        },
      ],
    })
    expect(flyingDaysForBooking(row)).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
    ])
  })
})

describe('buildDayRoster', () => {
  it('rosters each flying participant on each gapped selected day', () => {
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Pilot A', 'Pilot B']],
    ])
    const roster = buildDayRoster([makeRow()], participants)

    expect([...roster.keys()].sort()).toEqual(['2026-06-10', '2026-06-12'])
    expect(roster.get('2026-06-10')).toEqual([
      { participantName: 'Pilot A', bookingId: 'b-1', bookingRef: '#b-1' },
      { participantName: 'Pilot B', bookingId: 'b-1', bookingRef: '#b-1' },
    ])
    // The 11th (in the stay window, NOT selected) carries no roster.
    expect(roster.has('2026-06-11')).toBe(false)
  })

  it('accumulates multiple bookings flying the same day', () => {
    const rowA = makeRow({
      id: 'b-A',
      items: [
        {
          id: 'a',
          date_range_start: '2026-06-10',
          date_range_end: null,
          selected_days: ['2026-06-10'],
          products: {
            id: 'pa',
            name: 'A',
            product_kind: 'service',
            service_time_shape: 'single_date',
          },
        },
      ],
    })
    const rowB = makeRow({
      id: 'b-B',
      items: [
        {
          id: 'b',
          date_range_start: '2026-06-10',
          date_range_end: null,
          selected_days: ['2026-06-10'],
          products: {
            id: 'pb',
            name: 'B',
            product_kind: 'service',
            service_time_shape: 'single_date',
          },
        },
      ],
    })
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-A', ['Alice']],
      ['b-B', ['Bob', 'Carol']],
    ])
    const roster = buildDayRoster([rowA, rowB], participants)
    const day = roster.get('2026-06-10')!
    expect(day.map((e) => e.participantName)).toEqual(['Alice', 'Bob', 'Carol'])
    expect(day.map((e) => e.bookingId)).toEqual(['b-A', 'b-B', 'b-B'])
  })

  it('omits bookings with no flying participants (companions-only)', () => {
    // Participant map has no entry for this booking → nothing rosters.
    const roster = buildDayRoster([makeRow()], new Map())
    expect(roster.size).toBe(0)
  })

  it('omits bookings whose flying participant list is empty', () => {
    const roster = buildDayRoster([makeRow()], new Map([['b-1', []]]))
    expect(roster.size).toBe(0)
  })
})

describe('groupRosterByBooking', () => {
  it('groups names per booking preserving encounter + name order', () => {
    const groups = groupRosterByBooking([
      { participantName: 'A1', bookingId: 'b-1', bookingRef: '#b-1' },
      { participantName: 'A2', bookingId: 'b-1', bookingRef: '#b-1' },
      { participantName: 'B1', bookingId: 'b-2', bookingRef: '#b-2' },
    ])
    expect(groups).toEqual([
      { bookingId: 'b-1', bookingRef: '#b-1', participantNames: ['A1', 'A2'] },
      { bookingId: 'b-2', bookingRef: '#b-2', participantNames: ['B1'] },
    ])
  })
})

describe('isFlyingParticipant', () => {
  it('treats is_guiding=true and legacy NULL as flying', () => {
    expect(isFlyingParticipant({ is_guiding: true })).toBe(true)
    expect(isFlyingParticipant({ is_guiding: null })).toBe(true)
  })
  it('excludes companions (is_guiding=false)', () => {
    expect(isFlyingParticipant({ is_guiding: false })).toBe(false)
  })
})

describe('participantContactName', () => {
  it('prefers full name, falls back to email then em-dash', () => {
    expect(
      participantContactName({ first_name: 'Jo', last_name: 'Doe', email: 'x@y' }),
    ).toBe('Jo Doe')
    expect(
      participantContactName({ first_name: null, last_name: null, email: 'x@y' }),
    ).toBe('x@y')
    expect(participantContactName(null)).toBe('—')
  })
})

describe('bookingRef', () => {
  it('matches the #id.slice(0,8) convention', () => {
    expect(bookingRef('abcdef1234567890')).toBe('#abcdef12')
  })
})

describe('fetchFlyingParticipants', () => {
  it('queries booking_participants scoped by operator and drops companions', async () => {
    mock.state.response = {
      data: [
        {
          booking_id: 'b-1',
          is_guiding: true,
          companion_kind: null,
          contact: { first_name: 'Pilot', last_name: 'A', email: 'a@x' },
        },
        {
          booking_id: 'b-1',
          is_guiding: false, // companion → excluded
          companion_kind: 'guest',
          contact: { first_name: 'Partner', last_name: 'P', email: 'p@x' },
        },
        {
          booking_id: 'b-1',
          is_guiding: null, // legacy → flying
          companion_kind: null,
          contact: { first_name: 'Pilot', last_name: 'B', email: 'b@x' },
        },
        {
          booking_id: 'b-2',
          is_guiding: false, // separate_guiding companion → still excluded
          companion_kind: 'separate_guiding',
          contact: { first_name: 'Self', last_name: 'Pay', email: 's@x' },
        },
      ],
      error: null,
    }

    const result = await fetchFlyingParticipants('op-1')

    expect(mock.state.table).toBe('booking_participants')
    expect(mock.state.eqArgs).toContainEqual(['operator_id', 'op-1'])
    expect(result.get('b-1')).toEqual(['Pilot A', 'Pilot B'])
    // b-2 had only a companion → no entry.
    expect(result.has('b-2')).toBe(false)
  })

  it('throws on a Supabase error', async () => {
    mock.state.response = { data: null, error: { message: 'boom' } }
    await expect(fetchFlyingParticipants('op-1')).rejects.toThrow('boom')
  })
})
