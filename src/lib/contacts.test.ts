// landr-dp45 — fetchContacts hides GDPR-erased tombstones by default.
//
// Asserts the PostgREST query builder receives `.is('gdpr_erased_at', null)`
// when `opts.includeErased` is omitted/false, and omits it when true. The
// existing `.is('deleted_at', null)` filter is independent and always
// applies (separate concern — soft-delete vs GDPR erase).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IsCall = { column: string; value: unknown }

const builderState = {
  isCalls: [] as IsCall[],
  overlapsCalls: [] as Array<{ column: string; values: unknown }>,
}

const { mockSupabase } = vi.hoisted(() => {
  const state = {
    isCalls: [] as IsCall[],
    overlapsCalls: [] as Array<{ column: string; values: unknown }>,
  }
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn((column: string, value: unknown) => {
      state.isCalls.push({ column, value })
      return builder
    }),
    overlaps: vi.fn((column: string, values: unknown) => {
      state.overlapsCalls.push({ column, values })
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: [], error: null })),
  })
  const supabase = {
    from: vi.fn(() => builder),
  }
  return { mockSupabase: { state, supabase, builder } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase.supabase,
  getSupabase: () => mockSupabase.supabase,
}))

import { fetchContacts } from './contacts'

beforeEach(() => {
  mockSupabase.state.isCalls.length = 0
  mockSupabase.state.overlapsCalls.length = 0
  builderState.isCalls = mockSupabase.state.isCalls
  builderState.overlapsCalls = mockSupabase.state.overlapsCalls
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
