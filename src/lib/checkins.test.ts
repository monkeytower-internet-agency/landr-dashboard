// landr-znzz.8 — tests for the retrieve-board API client + helpers.
//
// Asserts the URL/method/body of fetchCheckins + patchCheckinRetrieve against
// the real landr-znzz.4 contract (GET wraps the list in {day_date, checkins};
// PATCH returns the bare row), plus the pure display helpers. Mirrors the
// hoisted-supabase + stubbed-fetch pattern from booking-briefing.test.ts.

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
  checkinDisplayName,
  coordsLabel,
  fetchCheckins,
  hasPin,
  mapUrl,
  patchCheckinRetrieve,
  sortCheckinsForBoard,
  statusMeta,
  todayIso,
  type Checkin,
} from './checkins'

const OP_ID = '11111111-1111-4111-8111-111111111111'
const CHECKIN_ID = '22222222-2222-4222-8222-222222222222'
const DAY = '2026-05-25'

function makeCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: CHECKIN_ID,
    booking_id: '33333333-3333-4333-8333-333333333333',
    booking_participant_id: '44444444-4444-4444-8444-444444444444',
    day_date: DAY,
    status: 'in_progress',
    latitude: null,
    longitude: null,
    note: null,
    retrieve_state: null,
    retrieve_note: null,
    first_name: 'Anna',
    last_name: 'Vogel',
    created_at: '2026-05-25T10:00:00Z',
    updated_at: '2026-05-25T10:00:00Z',
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

const BASE = `/api/staff/operators/${OP_ID}/checkins`

describe('fetchCheckins', () => {
  it('GETs the board endpoint with the day_date query param and unwraps the list', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          day_date: DAY,
          checkins: [makeCheckin(), makeCheckin({ id: 'c2' })],
        }),
        { status: 200 },
      ),
    )
    const result = await fetchCheckins(OP_ID, DAY)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(CHECKIN_ID)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${BASE}?day_date=${DAY}`)
    expect(opts.method).toBe('GET')
  })

  it('returns an empty array when the board has no check-ins', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ day_date: DAY, checkins: [] }), {
        status: 200,
      }),
    )
    expect(await fetchCheckins(OP_ID, DAY)).toEqual([])
  })

  it('rethrows on an API error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), { status: 500 }),
    )
    await expect(fetchCheckins(OP_ID, DAY)).rejects.toThrow('boom')
  })
})

describe('patchCheckinRetrieve', () => {
  it('PATCHes the check-in with only the supplied retrieve fields and returns the row', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeCheckin({ retrieve_state: 'driver_assigned' }),
        ),
        { status: 200 },
      ),
    )
    const updated = await patchCheckinRetrieve(OP_ID, CHECKIN_ID, {
      retrieve_state: 'driver_assigned',
    })
    expect(updated.retrieve_state).toBe('driver_assigned')
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${BASE}/${CHECKIN_ID}`)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({
      retrieve_state: 'driver_assigned',
    })
  })

  it('sends a retrieve_note when that is the only field', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeCheckin({ retrieve_note: 'ETA 20m' })), {
        status: 200,
      }),
    )
    await patchCheckinRetrieve(OP_ID, CHECKIN_ID, { retrieve_note: 'ETA 20m' })
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toEqual({ retrieve_note: 'ETA 20m' })
  })

  it('sends retrieve_state: null to clear a chip', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeCheckin({ retrieve_state: null })), {
        status: 200,
      }),
    )
    await patchCheckinRetrieve(OP_ID, CHECKIN_ID, { retrieve_state: null })
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toEqual({ retrieve_state: null })
  })
})

describe('sortCheckinsForBoard', () => {
  it('orders in_progress first, then arrived_elsewhere, then arrived_designated', () => {
    const rows = [
      makeCheckin({ id: 'd', status: 'arrived_designated' }),
      makeCheckin({ id: 'p', status: 'in_progress' }),
      makeCheckin({ id: 'e', status: 'arrived_elsewhere' }),
    ]
    const sorted = sortCheckinsForBoard(rows)
    expect(sorted.map((c) => c.id)).toEqual(['p', 'e', 'd'])
  })

  it('breaks ties within a status by created_at ascending', () => {
    const rows = [
      makeCheckin({ id: 'late', created_at: '2026-05-25T12:00:00Z' }),
      makeCheckin({ id: 'early', created_at: '2026-05-25T08:00:00Z' }),
    ]
    expect(sortCheckinsForBoard(rows).map((c) => c.id)).toEqual([
      'early',
      'late',
    ])
  })

  it('does not mutate the input array', () => {
    const rows = [makeCheckin({ id: 'a' })]
    const copy = [...rows]
    sortCheckinsForBoard(rows)
    expect(rows).toEqual(copy)
  })
})

describe('statusMeta', () => {
  it('flags in_progress as the overdue-risk status', () => {
    expect(statusMeta('in_progress').isOverdueRisk).toBe(true)
  })

  it('does not flag arrived statuses as overdue-risk', () => {
    expect(statusMeta('arrived_elsewhere').isOverdueRisk).toBe(false)
    expect(statusMeta('arrived_designated').isOverdueRisk).toBe(false)
  })

  it('tolerates an unknown status by echoing it with a neutral chip', () => {
    const meta = statusMeta('some_future_status')
    expect(meta.label).toBe('some_future_status')
    expect(meta.isOverdueRisk).toBe(false)
  })
})

describe('checkinDisplayName', () => {
  it('joins first + last name', () => {
    expect(checkinDisplayName(makeCheckin())).toBe('Anna Vogel')
  })

  it('falls back to first name only', () => {
    expect(
      checkinDisplayName(makeCheckin({ last_name: null })),
    ).toBe('Anna')
  })

  it('falls back to a placeholder when both are missing', () => {
    expect(
      checkinDisplayName(makeCheckin({ first_name: null, last_name: '  ' })),
    ).toBe('Unnamed participant')
  })
})

describe('pin helpers (hasPin / mapUrl / coordsLabel)', () => {
  const pinned = makeCheckin({
    status: 'arrived_elsewhere',
    latitude: 28.12345,
    longitude: -13.54321,
  })

  it('hasPin is true only when both finite coords are present', () => {
    expect(hasPin(pinned)).toBe(true)
    expect(hasPin(makeCheckin())).toBe(false)
    expect(hasPin(makeCheckin({ latitude: 28.1, longitude: null }))).toBe(false)
  })

  it('mapUrl builds an OpenStreetMap deep-link to the pin', () => {
    const url = mapUrl(pinned)
    expect(url).toContain('openstreetmap.org')
    expect(url).toContain('mlat=28.12345')
    expect(url).toContain('mlon=-13.54321')
    expect(url).toContain('#map=16/28.12345/-13.54321')
  })

  it('mapUrl + coordsLabel return null without a pin', () => {
    expect(mapUrl(makeCheckin())).toBeNull()
    expect(coordsLabel(makeCheckin())).toBeNull()
  })

  it('coordsLabel formats to 5 decimal places', () => {
    expect(coordsLabel(pinned)).toBe('28.12345, -13.54321')
  })
})

describe('todayIso', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
