// landr-znzz.2 — tests for the booking-briefing API client.
//
// Asserts the URL/method/body of each call, the 404 -> null behaviour of
// fetchBriefing, and the pure display helpers (whatsappShareUrl, findDay).
// Mirrors the mock-fetch pattern from booking-notes.test.ts (a hoisted
// supabase mock for the auth-token getter + vi.stubGlobal('fetch')).

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
  createBriefing,
  fetchBriefing,
  findDay,
  patchBriefing,
  putBriefingDay,
  rotateBriefingToken,
  whatsappShareUrl,
  type Briefing,
  type BriefingDay,
} from './booking-briefing'

const OP_ID = '11111111-1111-4111-8111-111111111111'
const BOOKING_ID = '22222222-2222-4222-8222-222222222222'
const BRIEFING_ID = '33333333-3333-4333-8333-333333333333'

function makeDay(overrides: Partial<BriefingDay> = {}): BriefingDay {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    briefing_id: BRIEFING_ID,
    booking_id: BOOKING_ID,
    operator_id: OP_ID,
    day_date: '2026-06-01',
    conditions_status: 'pending',
    conditions_note: null,
    plan_headline: null,
    plan_detail: null,
    meeting_point_text: null,
    content: {},
    is_published: false,
    published_at: null,
    created_at: '2026-05-25T10:00:00Z',
    updated_at: '2026-05-25T10:00:00Z',
    ...overrides,
  }
}

function makeBriefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    id: BRIEFING_ID,
    operator_id: OP_ID,
    booking_id: BOOKING_ID,
    public_token: 'tok123',
    public_url: 'https://landr.example/t/tok123',
    token_expires_at: '2027-05-25T10:00:00Z',
    is_published: false,
    title: null,
    welcome_note: null,
    tone: 'playful',
    content: {},
    show_reviews: false,
    review_url: null,
    created_at: '2026-05-25T10:00:00Z',
    updated_at: '2026-05-25T10:00:00Z',
    days: [],
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

const BASE = `/api/staff/operators/${OP_ID}/bookings/${BOOKING_ID}/briefing`

describe('fetchBriefing', () => {
  it('GETs the briefing endpoint and parses the row', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeBriefing({ days: [makeDay()] })), {
        status: 200,
      }),
    )
    const result = await fetchBriefing(OP_ID, BOOKING_ID)
    expect(result?.id).toBe(BRIEFING_ID)
    expect(result?.days).toHaveLength(1)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(BASE)
    expect(opts.method).toBe('GET')
  })

  it('returns null when the API 404s with briefing_not_found', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'briefing_not_found' }), {
        status: 404,
      }),
    )
    const result = await fetchBriefing(OP_ID, BOOKING_ID)
    expect(result).toBeNull()
  })

  it('rethrows on a non-404 error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), { status: 500 }),
    )
    await expect(fetchBriefing(OP_ID, BOOKING_ID)).rejects.toThrow('boom')
  })
})

describe('createBriefing', () => {
  it('POSTs to the briefing endpoint with no body', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeBriefing()), { status: 201 }),
    )
    const created = await createBriefing(OP_ID, BOOKING_ID)
    expect(created.id).toBe(BRIEFING_ID)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(BASE)
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeUndefined()
  })
})

describe('patchBriefing', () => {
  it('PATCHes the supplied content fields', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeBriefing({ title: 'Sunrise paddle', is_published: true })),
        { status: 200 },
      ),
    )
    const updated = await patchBriefing(OP_ID, BOOKING_ID, {
      title: 'Sunrise paddle',
      is_published: true,
    })
    expect(updated.title).toBe('Sunrise paddle')
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(BASE)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({
      title: 'Sunrise paddle',
      is_published: true,
    })
  })
})

describe('putBriefingDay', () => {
  it('PUTs the day endpoint keyed on the ISO date and returns the day row', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(makeDay({ conditions_status: 'go', is_published: true })),
        { status: 200 },
      ),
    )
    const day = await putBriefingDay(OP_ID, BOOKING_ID, '2026-06-01', {
      conditions_status: 'go',
      is_published: true,
    })
    expect(day.conditions_status).toBe('go')
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${BASE}/days/2026-06-01`)
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body as string)).toEqual({
      conditions_status: 'go',
      is_published: true,
    })
  })
})

describe('rotateBriefingToken', () => {
  it('POSTs rotate-token and returns the row with the new token', async () => {
    const { days: _omit, ...row } = makeBriefing({
      public_token: 'newtok',
      public_url: 'https://landr.example/t/newtok',
    })
    void _omit
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(row), { status: 200 }),
    )
    const result = await rotateBriefingToken(OP_ID, BOOKING_ID)
    expect(result.public_token).toBe('newtok')
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${BASE}/rotate-token`)
    expect(opts.method).toBe('POST')
  })
})

describe('whatsappShareUrl', () => {
  it('targets the customer chat when a phone is supplied (digits only)', () => {
    const url = whatsappShareUrl(
      'https://landr.example/t/tok',
      'Hi there:',
      '+34 600 123 456',
    )
    expect(url).toBe(
      'https://wa.me/34600123456?text=' +
        encodeURIComponent('Hi there: https://landr.example/t/tok'),
    )
  })

  it('falls back to the generic share sheet when no phone is given', () => {
    const url = whatsappShareUrl('https://landr.example/t/tok', 'Hi:', null)
    expect(url).toBe(
      'https://wa.me/?text=' +
        encodeURIComponent('Hi: https://landr.example/t/tok'),
    )
  })

  it('treats a blank/punctuation-only phone as no phone', () => {
    const url = whatsappShareUrl('https://x/t/tok', 'Hi:', '  -- ')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
  })
})

describe('findDay', () => {
  it('returns the matching day card', () => {
    const briefing = makeBriefing({
      days: [makeDay({ day_date: '2026-06-01' }), makeDay({ day_date: '2026-06-02', id: 'x' })],
    })
    expect(findDay(briefing, '2026-06-02')?.id).toBe('x')
  })

  it('returns null for an unmatched date or a null briefing', () => {
    expect(findDay(makeBriefing(), '2026-06-09')).toBeNull()
    expect(findDay(null, '2026-06-01')).toBeNull()
  })
})
