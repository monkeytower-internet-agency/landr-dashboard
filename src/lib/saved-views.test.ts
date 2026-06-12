// landr-v0xg — tests for the saved-views API client + templates.
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
  createSavedView,
  duplicateSavedView,
  listSavedViews,
  setViewUserState,
  SavedViewSchema,
  SavedViewWithStateSchema,
} from './saved-views'
import { VIEW_TEMPLATES, findTemplateByKey } from './views-templates'

// Zod 4 enforces UUID v1-v8 byte 7 (high nibble) + variant nibble. Using
// canonical v4 fixtures: `4xxx-yxxx` with y∈{8,9,a,b}.
const OP_ID = '11111111-1111-4111-8111-111111111111'
const VIEW_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

function makeViewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VIEW_ID,
    operator_id: OP_ID,
    creator_user_id: USER_ID,
    entity_type: 'booking',
    visibility: 'personal',
    name: 'All bookings',
    config: { layout: 'table' },
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
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

describe('SavedViewSchema', () => {
  it('parses a server row without deleted_at (router omits it)', () => {
    const parsed = SavedViewSchema.parse(makeViewRow())
    expect(parsed.id).toBe(VIEW_ID)
    expect(parsed.config).toEqual({ layout: 'table' })
  })

  it('parses a server row with deleted_at: null too', () => {
    const parsed = SavedViewSchema.parse(makeViewRow({ deleted_at: null }))
    expect(parsed.deleted_at).toBeNull()
  })

  it('rejects rows missing required fields', () => {
    expect(() =>
      SavedViewSchema.parse({ ...makeViewRow(), name: undefined }),
    ).toThrow()
  })
})

describe('SavedViewWithStateSchema', () => {
  it('requires user_state with pinned + hidden flags + sort_order', () => {
    const parsed = SavedViewWithStateSchema.parse({
      ...makeViewRow(),
      user_state: { pinned: true, hidden: false, sort_order: 3 },
    })
    expect(parsed.user_state.pinned).toBe(true)
    expect(parsed.user_state.hidden).toBe(false)
    expect(parsed.user_state.sort_order).toBe(3)
  })

  it('passes through extra user_state keys (server sends updated_at too)', () => {
    const parsed = SavedViewWithStateSchema.parse({
      ...makeViewRow(),
      user_state: {
        pinned: false,
        hidden: false,
        sort_order: 0,
        updated_at: '2026-05-21T10:00:00Z',
      },
    })
    expect(parsed.user_state.pinned).toBe(false)
  })
})

describe('listSavedViews', () => {
  it('GETs the saved-views endpoint and parses the array response', async () => {
    const row = {
      ...makeViewRow(),
      user_state: {
        pinned: true,
        hidden: false,
        sort_order: 0,
        updated_at: null,
      },
    }
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([row]), { status: 200 }),
    )

    const result = await listSavedViews(OP_ID)

    expect(result).toHaveLength(1)
    expect(result[0].user_state.pinned).toBe(true)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/staff/operators/${OP_ID}/saved-views`)
    expect(opts.method).toBe('GET')
  })

  it('returns an empty array when the server sends []', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    )
    const result = await listSavedViews(OP_ID)
    expect(result).toEqual([])
  })
})

describe('createSavedView', () => {
  it('POSTs the create payload and parses the returned row', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeViewRow()), { status: 201 }),
    )

    const created = await createSavedView(OP_ID, {
      name: 'All bookings',
      entity_type: 'booking',
      visibility: 'personal',
      config: { layout: 'table' },
    })

    expect(created.id).toBe(VIEW_ID)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/staff/operators/${OP_ID}/saved-views`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toMatchObject({
      name: 'All bookings',
      entity_type: 'booking',
      visibility: 'personal',
      config: { layout: 'table' },
    })
  })
})

describe('duplicateSavedView', () => {
  it('POSTs to the /duplicate sub-resource', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(makeViewRow()), { status: 201 }),
    )
    await duplicateSavedView(OP_ID, VIEW_ID)
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      `/api/staff/operators/${OP_ID}/saved-views/${VIEW_ID}/duplicate`,
    )
    expect(opts.method).toBe('POST')
  })
})

describe('setViewUserState', () => {
  it('PUTs to the /state sub-resource', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await setViewUserState(OP_ID, VIEW_ID, { pinned: true })
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      `/api/staff/operators/${OP_ID}/saved-views/${VIEW_ID}/state`,
    )
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body as string)).toEqual({ pinned: true })
  })

  it('accepts sort_order alongside pinned', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await setViewUserState(OP_ID, VIEW_ID, { pinned: true, sort_order: 7 })
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toEqual({
      pinned: true,
      sort_order: 7,
    })
  })
})

describe('reorderSavedViews', () => {
  it('PATCHes a list of {view_id, sort_order} to /reorder', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ updated: 2 }), { status: 200 }),
    )
    const { reorderSavedViews } = await import('./saved-views')
    const result = await reorderSavedViews(OP_ID, [
      { view_id: VIEW_ID, sort_order: 0 },
      { view_id: USER_ID, sort_order: 1 },
    ])
    expect(result).toEqual({ updated: 2 })
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/staff/operators/${OP_ID}/saved-views/reorder`)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body as string)).toEqual([
      { view_id: VIEW_ID, sort_order: 0 },
      { view_id: USER_ID, sort_order: 1 },
    ])
  })
})

describe('VIEW_TEMPLATES', () => {
  // landr-1zxt added three relative-date starters (next-7-days, this-month,
  // past-due) on top of the original four. landr-qc72 added next-30-days
  // and last-30-days as configurable-N exemplars.
  // landr-wwhn.17 added my-open-tickets and all-tickets (entity_type='ticket').
  const EXPECTED_KEYS = [
    'all-bookings',
    'pending-approvals',
    'this-week',
    'todays-pickups',
    'next-7-days',
    'this-month',
    'next-30-days',
    'last-30-days',
    'past-due',
    'my-open-tickets',
    'all-tickets',
    // landr-21x1 — daily roster calendar view variant.
    'daily-roster',
  ] as const

  it('has the expected number of entries', () => {
    expect(VIEW_TEMPLATES).toHaveLength(EXPECTED_KEYS.length)
  })

  it('each template has a unique key + valid entity_type + config object', () => {
    const keys = new Set(VIEW_TEMPLATES.map((t) => t.key))
    expect(keys.size).toBe(EXPECTED_KEYS.length)
    for (const tpl of VIEW_TEMPLATES) {
      expect(['booking', 'ticket']).toContain(tpl.entity_type)
      expect(typeof tpl.config).toBe('object')
      expect(tpl.config).not.toBeNull()
      expect(tpl.name).toBeTruthy()
      expect(tpl.description).toBeTruthy()
    }
  })

  it('exposes the expected starter keys', () => {
    const keys = VIEW_TEMPLATES.map((t) => t.key).sort()
    expect(keys).toEqual([...EXPECTED_KEYS].sort())
  })

  it('findTemplateByKey returns the matching template or undefined', () => {
    expect(findTemplateByKey('all-bookings')?.name).toBe('All bookings')
    expect(findTemplateByKey('does-not-exist')).toBeUndefined()
  })
})
