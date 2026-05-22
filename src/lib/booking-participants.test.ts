// landr-z4lj — tests for the booking_participants fetcher.
//
// Stubs the Supabase client builder so the fetcher's PostgREST select can
// be asserted in shape (booking_id filter, ordered insert, embedded
// contact + service_role) without touching a real DB. Mirrors the mock
// pattern used by BookingDetailSheet.test.tsx.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mock } = vi.hoisted(() => {
  type Builder = {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
  }
  const state: {
    table: string | null
    select: string | null
    eqArgs: Array<[string, unknown]>
    orderArgs: Array<[string, { ascending: boolean }]>
    response: { data: unknown; error: { message: string } | null }
  } = {
    table: null,
    select: null,
    eqArgs: [],
    orderArgs: [],
    response: { data: [], error: null },
  }

  const builder: Builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  // Thenable: awaiting the builder resolves to the configured response.
  Object.assign(builder, {
    then: (resolve: (v: unknown) => void) => resolve(state.response),
  })
  builder.select.mockImplementation((s: string) => {
    state.select = s
    return builder
  })
  builder.eq.mockImplementation((col: string, val: unknown) => {
    state.eqArgs.push([col, val])
    return builder
  })
  builder.order.mockImplementation((col: string, opts: { ascending: boolean }) => {
    state.orderArgs.push([col, opts])
    return builder
  })

  const supabase = {
    from: vi.fn((t: string) => {
      state.table = t
      return builder
    }),
  }

  return { mock: { state, supabase, builder } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

import {
  fetchBookingParticipants,
  participantDisplayName,
  participantRoleLabel,
  type BookingParticipantRow,
} from './booking-participants'

beforeEach(() => {
  mock.state.table = null
  mock.state.select = null
  mock.state.eqArgs = []
  mock.state.orderArgs = []
  mock.state.response = { data: [], error: null }
  mock.supabase.from.mockClear()
  mock.builder.select.mockClear()
  mock.builder.eq.mockClear()
  mock.builder.order.mockClear()
})

describe('fetchBookingParticipants', () => {
  it('queries booking_participants filtered by booking_id and ordered by created_at', async () => {
    mock.state.response = { data: [], error: null }
    await fetchBookingParticipants('bk-1')
    expect(mock.state.table).toBe('booking_participants')
    expect(mock.state.eqArgs).toContainEqual(['booking_id', 'bk-1'])
    expect(mock.state.orderArgs[0][0]).toBe('created_at')
    expect(mock.state.orderArgs[0][1]).toEqual({ ascending: true })
    // The select must embed the contact + service_role FK rows so the UI
    // can render names / emails / phones / roles without a round-trip per
    // row. (Schema reference: lib/booking-participants.ts SELECT.)
    expect(mock.state.select).toContain('contact:contacts!contact_id')
    expect(mock.state.select).toContain('service_role:service_roles!service_role_id')
    expect(mock.state.select).toContain('do_not_contact')
    expect(mock.state.select).toContain('phone')
  })

  it('returns the rows unchanged when the response is happy', async () => {
    mock.state.response = {
      data: [
        {
          id: 'p1',
          booking_id: 'bk-1',
          notes: null,
          contact: {
            id: 'c1',
            first_name: 'Alice',
            last_name: 'Adams',
            email: 'alice@x.com',
            phone: '+34600000001',
            do_not_contact: false,
          },
          service_role: { id: 'sr1', code: 'pilot', label: 'Pilot' },
        },
      ],
      error: null,
    }
    const rows = await fetchBookingParticipants('bk-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].contact?.first_name).toBe('Alice')
    expect(rows[0].service_role?.label).toBe('Pilot')
  })

  it('coalesces missing embedded rows to null', async () => {
    mock.state.response = {
      data: [
        {
          id: 'p2',
          booking_id: 'bk-1',
          notes: 'ground only',
          // PostgREST omits embedded FK objects entirely when the row was
          // resolved but the join target is missing — normalise to null
          // so consumers don't have to handle `undefined`.
          contact: undefined,
          service_role: undefined,
        },
      ],
      error: null,
    }
    const rows = await fetchBookingParticipants('bk-1')
    expect(rows[0].contact).toBeNull()
    expect(rows[0].service_role).toBeNull()
  })

  it('throws when the supabase response carries an error', async () => {
    mock.state.response = { data: null, error: { message: 'boom' } }
    await expect(fetchBookingParticipants('bk-1')).rejects.toThrow('boom')
  })
})

describe('participantDisplayName', () => {
  function row(overrides: Partial<BookingParticipantRow> = {}): BookingParticipantRow {
    return {
      id: 'p',
      booking_id: 'bk',
      notes: null,
      contact: {
        id: 'c',
        first_name: 'A',
        last_name: 'B',
        email: 'ab@x.com',
        phone: null,
        do_not_contact: false,
      },
      service_role: null,
      ...overrides,
    }
  }

  it('uses first + last name when both present', () => {
    expect(participantDisplayName(row())).toBe('A B')
  })

  it('falls back to email when names are blank', () => {
    expect(
      participantDisplayName(
        row({
          contact: {
            id: 'c',
            first_name: null,
            last_name: null,
            email: 'only@x.com',
            phone: null,
            do_not_contact: false,
          },
        }),
      ),
    ).toBe('only@x.com')
  })

  it('returns em-dash when contact is missing entirely', () => {
    expect(participantDisplayName(row({ contact: null }))).toBe('—')
  })
})

describe('participantRoleLabel', () => {
  function row(
    sr: BookingParticipantRow['service_role'],
  ): BookingParticipantRow {
    return {
      id: 'p',
      booking_id: 'bk',
      notes: null,
      contact: null,
      service_role: sr,
    }
  }

  it('uses the human label when present', () => {
    expect(
      participantRoleLabel(row({ id: 'sr', code: 'pilot', label: 'Pilot' })),
    ).toBe('Pilot')
  })

  it('falls back to the code when label is blank', () => {
    expect(
      participantRoleLabel(row({ id: 'sr', code: 'pilot', label: '' })),
    ).toBe('pilot')
  })

  it('returns em-dash when the embed is missing', () => {
    expect(participantRoleLabel(row(null))).toBe('—')
  })
})
