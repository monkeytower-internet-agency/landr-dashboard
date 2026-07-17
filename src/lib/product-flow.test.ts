// landr-7hac — regression coverage for the product_flow_modules REST helpers.
//
// landr-71kz.7 shipped product-flow.ts with NO tests despite a critical
// DB-contract bug class: product_flow_modules.operator_id is NOT NULL and is
// checked by the apply_tenant_rls INSERT/UPSERT policy — a write that omits
// it fails outright (or, worse, silently passes RLS for the wrong tenant if
// a future refactor drops the field without a test to catch it). We mock the
// supabase client at the @supabase/supabase-js layer (matching
// product-addons.test.ts) so these tests exercise the real query-builder
// chain and assert the exact payload shipped to PostgREST.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { method: string; args: unknown[] }

const { mockSupabase } = vi.hoisted(() => {
  const state = {
    fromCalls: [] as string[],
    calls: [] as Call[],
    nextResult: { data: null as unknown, error: null as unknown },
  }

  const builder: Record<string, unknown> = {}
  const record = (method: string, ...args: unknown[]) => {
    state.calls.push({ method, args })
    return builder
  }
  Object.assign(builder, {
    select: vi.fn((...args: unknown[]) => record('select', ...args)),
    insert: vi.fn((...args: unknown[]) => record('insert', ...args)),
    upsert: vi.fn((...args: unknown[]) => record('upsert', ...args)),
    delete: vi.fn((...args: unknown[]) => record('delete', ...args)),
    eq: vi.fn((...args: unknown[]) => record('eq', ...args)),
    order: vi.fn((...args: unknown[]) => record('order', ...args)),
    single: vi.fn(async () => state.nextResult),
    // The chain may be terminated by awaiting the builder directly — e.g.
    // fetchFlowModules ends on .order(), upsertFlowModulePositions ends on
    // .upsert(), deleteFlowModule ends on .delete().eq(). Make the builder
    // itself thenable so `await` resolves to the configured result.
    then: (resolve: (v: unknown) => void) => resolve(state.nextResult),
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
  deleteFlowModule,
  fetchFlowModules,
  fetchOperatorForms,
  insertFlowModule,
  upsertFlowModulePositions,
} from './product-flow'

beforeEach(() => {
  mockSupabase.state.fromCalls.length = 0
  mockSupabase.state.calls.length = 0
  mockSupabase.state.nextResult = { data: null, error: null }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('product-flow — supabase CRUD wrappers (landr-7hac)', () => {
  it('fetchFlowModules selects by product_id ordered by position', async () => {
    mockSupabase.state.nextResult = { data: [], error: null }
    await fetchFlowModules('prod-1')

    expect(mockSupabase.state.fromCalls).toEqual(['product_flow_modules'])
    const eqCall = mockSupabase.state.calls.find((c) => c.method === 'eq')
    expect(eqCall?.args).toEqual(['product_id', 'prod-1'])
    const orderCall = mockSupabase.state.calls.find((c) => c.method === 'order')
    expect(orderCall?.args[0]).toBe('position')
  })

  it('fetchOperatorForms selects active forms scoped to the operator', async () => {
    mockSupabase.state.nextResult = { data: [], error: null }
    await fetchOperatorForms('op-1')

    expect(mockSupabase.state.fromCalls).toEqual(['forms'])
    const eqCalls = mockSupabase.state.calls.filter((c) => c.method === 'eq')
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['operator_id', 'op-1'] })
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['active', true] })
  })

  // ── The critical DB-contract assertion ──────────────────────────────────

  it('insertFlowModule sends BOTH operator_id and product_id in the insert payload', async () => {
    mockSupabase.state.nextResult = {
      data: {
        id: 'mod-1',
        product_id: 'prod-1',
        module_kind: 'participants',
        form_id: null,
        position: 1,
      },
      error: null,
    }

    await insertFlowModule('prod-1', 'participants', 1, 'op-1')

    expect(mockSupabase.state.fromCalls).toEqual(['product_flow_modules'])
    const insertCall = mockSupabase.state.calls.find((c) => c.method === 'insert')
    // NOT NULL + RLS WITH CHECK on operator_id — omitting either field is the
    // DB-contract bug this ticket exists to catch.
    expect(insertCall?.args[0]).toMatchObject({
      operator_id: 'op-1',
      product_id: 'prod-1',
      module_kind: 'participants',
      position: 1,
    })
  })

  it('insertFlowModule carries form_id for custom_form modules', async () => {
    mockSupabase.state.nextResult = {
      data: {
        id: 'mod-2',
        product_id: 'prod-1',
        module_kind: 'custom_form',
        form_id: 'form-9',
        position: 2,
      },
      error: null,
    }

    await insertFlowModule('prod-1', 'custom_form', 2, 'op-1', 'form-9')

    const insertCall = mockSupabase.state.calls.find((c) => c.method === 'insert')
    expect(insertCall?.args[0]).toMatchObject({
      operator_id: 'op-1',
      product_id: 'prod-1',
      form_id: 'form-9',
    })
  })

  it('upsertFlowModulePositions sends operator_id and product_id on EVERY row in the batch', async () => {
    mockSupabase.state.nextResult = { data: null, error: null }

    await upsertFlowModulePositions(
      [
        { id: 'mod-1', product_id: 'prod-1', module_kind: 'selection', form_id: null, position: 2 },
        { id: 'mod-2', product_id: 'prod-1', module_kind: 'participants', form_id: null, position: 1 },
      ],
      'op-1',
    )

    expect(mockSupabase.state.fromCalls).toEqual(['product_flow_modules'])
    const upsertCall = mockSupabase.state.calls.find((c) => c.method === 'upsert')
    const rows = upsertCall?.args[0] as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      // Each row's VALUES must carry operator_id (NOT NULL + RLS WITH CHECK)
      // — PostgREST upsert is INSERT ... ON CONFLICT, so a row missing it
      // fails before conflict resolution, not just on the happy path.
      expect(row).toMatchObject({ operator_id: 'op-1', product_id: 'prod-1' })
    }
    expect(rows.map((r) => r.position)).toEqual([2, 1])
    // onConflict: 'id' — the upsert must target the row's id, not create dupes.
    expect(upsertCall?.args[1]).toMatchObject({ onConflict: 'id' })
  })

  it('upsertFlowModulePositions is a no-op for an empty batch (no supabase call)', async () => {
    await upsertFlowModulePositions([], 'op-1')
    expect(mockSupabase.state.fromCalls).toEqual([])
  })

  it('deleteFlowModule deletes by id, scoped to operator_id (belt-and-suspenders, not RLS-only)', async () => {
    mockSupabase.state.nextResult = { data: null, error: null }
    await deleteFlowModule('mod-1', 'op-1')

    expect(mockSupabase.state.fromCalls).toEqual(['product_flow_modules'])
    const methods = mockSupabase.state.calls.map((c) => c.method)
    expect(methods).toContain('delete')
    const eqCalls = mockSupabase.state.calls
      .filter((c) => c.method === 'eq')
      .map((c) => c.args)
    expect(eqCalls).toEqual([
      ['id', 'mod-1'],
      ['operator_id', 'op-1'],
    ])
  })

  it('throws when supabase returns an error (insert)', async () => {
    mockSupabase.state.nextResult = {
      data: null,
      error: { message: 'permission denied for table product_flow_modules' },
    }
    await expect(
      insertFlowModule('prod-1', 'participants', 1, 'op-1'),
    ).rejects.toThrow(/permission denied/i)
  })

  it('throws when supabase returns an error (upsert)', async () => {
    mockSupabase.state.nextResult = {
      data: null,
      error: { message: 'null value in column "operator_id" violates not-null constraint' },
    }
    await expect(
      upsertFlowModulePositions(
        [{ id: 'mod-1', product_id: 'prod-1', module_kind: 'selection', form_id: null, position: 1 }],
        'op-1',
      ),
    ).rejects.toThrow(/not-null constraint/i)
  })
})
