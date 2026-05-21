// landr-9qo1 — tests for the booking-notes API client.
//
// Asserts the URL/method/body of each call and that the response is
// parsed back as a typed BookingNote (or array). Mirrors the mock-fetch
// pattern from saved-views.test.ts (single hoisted supabase mock for the
// auth-token getter, vi.stubGlobal('fetch', fetchSpy) for the request).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => {
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  }
  return { mock: { supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

import {
  authorLabel,
  createBookingNote,
  deleteBookingNote,
  listBookingNotes,
  type BookingNote,
} from './booking-notes'

const OP_ID = '11111111-1111-4111-8111-111111111111'
const BOOKING_ID = '22222222-2222-4222-8222-222222222222'
const NOTE_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'

function makeNote(overrides: Partial<BookingNote> = {}): BookingNote {
  return {
    id: NOTE_ID,
    booking_id: BOOKING_ID,
    operator_id: OP_ID,
    author_user_id: USER_ID,
    author_display_name: 'Jane Operator',
    author_email: 'jane@op.es',
    content: 'Customer called re pickup',
    created_at: '2026-05-21T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  fetchSpy.mockReset()
  mock.supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('listBookingNotes', () => {
  it('GETs the notes endpoint and parses the array response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([makeNote()]), { status: 200 }),
    )

    const result = await listBookingNotes(OP_ID, BOOKING_ID)

    expect(result).toHaveLength(1)
    expect(result[0].author_display_name).toBe('Jane Operator')
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      `/api/staff/operators/${OP_ID}/bookings/${BOOKING_ID}/notes`,
    )
    expect(opts.method).toBe('GET')
  })

  it('returns [] when the server sends []', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    )
    const result = await listBookingNotes(OP_ID, BOOKING_ID)
    expect(result).toEqual([])
  })
})

describe('createBookingNote', () => {
  it('POSTs the content payload and parses the returned row', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeNote()), { status: 201 }),
    )

    const created = await createBookingNote(OP_ID, BOOKING_ID, {
      content: 'Customer called re pickup',
    })

    expect(created.id).toBe(NOTE_ID)
    expect(created.author_display_name).toBe('Jane Operator')
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      `/api/staff/operators/${OP_ID}/bookings/${BOOKING_ID}/notes`,
    )
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({
      content: 'Customer called re pickup',
    })
  })
})

describe('deleteBookingNote', () => {
  it('DELETEs the per-note endpoint and returns undefined', async () => {
    // The router returns 200 with {status:"deleted"}; the lib drops the
    // response body (Promise<void>). 204 would also be valid.
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'deleted' }), { status: 200 }),
    )
    const out = await deleteBookingNote(OP_ID, BOOKING_ID, NOTE_ID)
    expect(out).toBeUndefined()
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      `/api/staff/operators/${OP_ID}/bookings/${BOOKING_ID}/notes/${NOTE_ID}`,
    )
    expect(opts.method).toBe('DELETE')
  })
})

describe('authorLabel', () => {
  it('prefers display_name', () => {
    expect(authorLabel(makeNote())).toBe('Jane Operator')
  })

  it('falls back to email when display_name is null', () => {
    expect(
      authorLabel(
        makeNote({ author_display_name: null, author_email: 'x@y.com' }),
      ),
    ).toBe('x@y.com')
  })

  it('falls back to email when display_name is empty whitespace', () => {
    expect(
      authorLabel(
        makeNote({ author_display_name: '   ', author_email: 'x@y.com' }),
      ),
    ).toBe('x@y.com')
  })

  it('returns "(deleted user)" when both display_name and email are null', () => {
    expect(
      authorLabel(
        makeNote({
          author_user_id: null,
          author_display_name: null,
          author_email: null,
        }),
      ),
    ).toBe('(deleted user)')
  })
})
