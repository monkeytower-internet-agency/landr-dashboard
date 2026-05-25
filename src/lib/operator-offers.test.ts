// landr-znzz.5 — tests for the operator-offers API client.
//
// Asserts the URL/method/body of each call. Mirrors the mock-fetch pattern
// from booking-briefing.test.ts (a hoisted supabase mock for the auth-token
// getter + vi.stubGlobal('fetch')).

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
  createOperatorOffer,
  deleteOperatorOffer,
  fetchOperatorOffers,
  updateOperatorOffer,
  type OperatorOffer,
} from './operator-offers'

const OP_ID = '11111111-1111-4111-8111-111111111111'
const OFFER_ID = '22222222-2222-4222-8222-222222222222'
const BASE = `/api/staff/operators/${OP_ID}/offers`

function makeOffer(overrides: Partial<OperatorOffer> = {}): OperatorOffer {
  return {
    id: OFFER_ID,
    operator_id: OP_ID,
    title: 'Your footage is ready',
    description: 'Buy the full edit.',
    cta_label: 'Buy video',
    cta_url: 'https://shop.example/video',
    image_url: null,
    is_active: true,
    sort_order: 0,
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

describe('fetchOperatorOffers', () => {
  it('GETs the offers endpoint and parses the list', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([makeOffer(), makeOffer({ id: 'x' })]), {
        status: 200,
      }),
    )
    const result = await fetchOperatorOffers(OP_ID)
    expect(result).toHaveLength(2)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(BASE)
    expect(opts.method).toBe('GET')
  })
})

describe('createOperatorOffer', () => {
  it('POSTs the supplied fields', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOffer()), { status: 201 }),
    )
    const created = await createOperatorOffer(OP_ID, {
      title: 'Your footage is ready',
      cta_url: 'https://shop.example/video',
    })
    expect(created.id).toBe(OFFER_ID)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(BASE)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toMatchObject({
      title: 'Your footage is ready',
      cta_url: 'https://shop.example/video',
    })
  })
})

describe('updateOperatorOffer', () => {
  it('PATCHes the single offer with only the set fields', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeOffer({ is_active: false })), {
        status: 200,
      }),
    )
    const updated = await updateOperatorOffer(OP_ID, OFFER_ID, {
      is_active: false,
    })
    expect(updated.is_active).toBe(false)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${BASE}/${OFFER_ID}`)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual({ is_active: false })
  })
})

describe('deleteOperatorOffer', () => {
  it('DELETEs the single offer', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, id: OFFER_ID }), { status: 200 }),
    )
    await deleteOperatorOffer(OP_ID, OFFER_ID)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`${BASE}/${OFFER_ID}`)
    expect(opts.method).toBe('DELETE')
  })
})
