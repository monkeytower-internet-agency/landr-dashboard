// landr-u34k — exercise the supabase REST CRUD wrappers for the
// product_addons table. We mock the supabase client at the @supabase/supabase-js
// layer so the helpers exercise the real query-builder chain (select / insert /
// update / delete / eq / order / single). Each test asserts the correct
// .from('product_addons') call, the correct chained methods, and the
// payload shape we ship to PostgREST.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { method: string; args: unknown[] }

const { mockSupabase } = vi.hoisted(() => {
  const state = {
    fromCalls: [] as string[],
    calls: [] as Call[],
    // Allows individual tests to stub the final resolved value (e.g. the
    // .single() call returns { data, error }; .delete().eq() returns
    // { error: null }).
    nextResult: { data: null as unknown, error: null as unknown },
  }

  // Chainable builder: every method returns the builder itself, except
  // `.single()` which returns the configured terminal Promise. Tests
  // assert the recorded call sequence after invoking a helper.
  const builder: Record<string, unknown> = {}
  const record = (method: string, ...args: unknown[]) => {
    state.calls.push({ method, args })
    return builder
  }
  Object.assign(builder, {
    select: vi.fn((...args: unknown[]) => record('select', ...args)),
    insert: vi.fn((...args: unknown[]) => record('insert', ...args)),
    update: vi.fn((...args: unknown[]) => record('update', ...args)),
    delete: vi.fn((...args: unknown[]) => {
      state.calls.push({ method: 'delete', args })
      // delete() doesn't always end with .single() — the .eq() that
      // follows is awaited directly, so make the builder thenable too.
      return builder
    }),
    eq: vi.fn(async (...args: unknown[]) => {
      state.calls.push({ method: 'eq', args })
      return builder
    }),
    order: vi.fn((...args: unknown[]) => record('order', ...args)),
    single: vi.fn(async () => state.nextResult),
    // The chain may be terminated by awaiting the builder directly (e.g.
    // .delete().eq()). then() lets us resolve to nextResult.
    then: (resolve: (v: unknown) => void) => resolve(state.nextResult),
  })

  // The .eq() used by fetchProductAddons is followed by .order() (chainable
  // not thenable), and finally .order() is awaited (the PostgREST builder
  // is itself thenable). To support both shapes we make .order() return a
  // thenable builder too.
  Object.assign(builder, {
    eq: vi.fn((...args: unknown[]) => {
      state.calls.push({ method: 'eq', args })
      return builder
    }),
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
  createProductAddon,
  deleteProductAddon,
  fetchProductAddons,
  patchProductAddon,
} from './product-addons'

beforeEach(() => {
  mockSupabase.state.fromCalls.length = 0
  mockSupabase.state.calls.length = 0
  mockSupabase.state.nextResult = { data: null, error: null }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('product-addons — supabase CRUD wrappers (landr-u34k)', () => {
  it('fetchProductAddons selects, filters by parent, and orders by sort+created', async () => {
    mockSupabase.state.nextResult = { data: [], error: null }
    await fetchProductAddons('parent-1')

    expect(mockSupabase.state.fromCalls).toEqual(['product_addons'])
    const methods = mockSupabase.state.calls.map((c) => c.method)
    expect(methods).toContain('select')
    expect(methods).toContain('eq')
    expect(methods).toContain('order')

    const eqCall = mockSupabase.state.calls.find((c) => c.method === 'eq')
    expect(eqCall?.args).toEqual(['parent_product_id', 'parent-1'])

    const orderArgs = mockSupabase.state.calls
      .filter((c) => c.method === 'order')
      .map((c) => c.args[0])
    expect(orderArgs).toContain('sort_order')
    expect(orderArgs).toContain('created_at')
  })

  it('createProductAddon inserts the payload and returns the saved row', async () => {
    mockSupabase.state.nextResult = {
      data: {
        id: 'addon-1',
        operator_id: 'op-1',
        parent_product_id: 'p-1',
        addon_product_id: 'p-2',
        is_required: false,
        min_qty: 0,
        max_qty: null,
        sort_order: 0,
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
      },
      error: null,
    }

    const result = await createProductAddon({
      operator_id: 'op-1',
      parent_product_id: 'p-1',
      addon_product_id: 'p-2',
      is_required: true,
      min_qty: 1,
      max_qty: 5,
      sort_order: 3,
    })

    expect(result.id).toBe('addon-1')
    expect(mockSupabase.state.fromCalls).toEqual(['product_addons'])
    const insertCall = mockSupabase.state.calls.find(
      (c) => c.method === 'insert',
    )
    expect(insertCall?.args[0]).toMatchObject({
      operator_id: 'op-1',
      parent_product_id: 'p-1',
      addon_product_id: 'p-2',
      is_required: true,
      min_qty: 1,
      max_qty: 5,
      sort_order: 3,
    })
  })

  it('patchProductAddon updates by id and returns the saved row', async () => {
    mockSupabase.state.nextResult = {
      data: {
        id: 'addon-1',
        operator_id: 'op-1',
        parent_product_id: 'p-1',
        addon_product_id: 'p-2',
        is_required: false,
        min_qty: 0,
        max_qty: null,
        sort_order: 7,
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
      },
      error: null,
    }

    await patchProductAddon('addon-1', { sort_order: 7, max_qty: null })

    const updateCall = mockSupabase.state.calls.find(
      (c) => c.method === 'update',
    )
    expect(updateCall?.args[0]).toEqual({ sort_order: 7, max_qty: null })
    const eqCall = mockSupabase.state.calls.find((c) => c.method === 'eq')
    expect(eqCall?.args).toEqual(['id', 'addon-1'])
  })

  it('deleteProductAddon deletes by id', async () => {
    mockSupabase.state.nextResult = { data: null, error: null }
    await deleteProductAddon('addon-1')

    const methods = mockSupabase.state.calls.map((c) => c.method)
    expect(methods).toContain('delete')
    expect(methods).toContain('eq')
    const eqCall = mockSupabase.state.calls.find((c) => c.method === 'eq')
    expect(eqCall?.args).toEqual(['id', 'addon-1'])
  })

  it('throws when supabase returns an error', async () => {
    mockSupabase.state.nextResult = {
      data: null,
      error: { message: 'permission denied for table product_addons' },
    }
    await expect(
      createProductAddon({
        operator_id: 'op-1',
        parent_product_id: 'p-1',
        addon_product_id: 'p-2',
      }),
    ).rejects.toThrow(/permission denied/i)
  })
})
