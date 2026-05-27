// landr-qg4q — fetchOutboundEmails: asserts the PostgREST builder calls
// match the expected operator + status + date predicates so RLS-bounded
// reads are also defensively scoped on the client.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { method: string; args: unknown[] }

const { mockSupabase } = vi.hoisted(() => {
  const calls: Call[] = []
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'select', args })
      return builder
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'eq', args })
      return builder
    }),
    in: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'in', args })
      return builder
    }),
    gte: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'gte', args })
      return builder
    }),
    lte: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'lte', args })
      return builder
    }),
    order: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'order', args })
      return builder
    }),
    limit: vi.fn(async (...args: unknown[]) => {
      calls.push({ method: 'limit', args })
      return { data: [], error: null }
    }),
  })
  const supabase = { from: vi.fn(() => builder) }
  return { mockSupabase: { calls, supabase, builder } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase.supabase,
  getSupabase: () => mockSupabase.supabase,
}))

import {
  fetchOutboundEmails,
  OUTBOUND_EMAIL_STATUSES,
} from './outbound-emails'

beforeEach(() => {
  mockSupabase.calls.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('fetchOutboundEmails', () => {
  it('scopes to operator_id and orders newest-first with a default 200 cap', async () => {
    await fetchOutboundEmails('op-1')

    expect(mockSupabase.supabase.from).toHaveBeenCalledWith('outbound_emails')

    const eqCalls = mockSupabase.calls.filter((c) => c.method === 'eq')
    expect(eqCalls).toEqual([{ method: 'eq', args: ['operator_id', 'op-1'] }])

    const orderCall = mockSupabase.calls.find((c) => c.method === 'order')
    expect(orderCall).toBeDefined()
    expect(orderCall?.args[0]).toBe('created_at')
    expect(orderCall?.args[1]).toMatchObject({ ascending: false })

    const limitCall = mockSupabase.calls.find((c) => c.method === 'limit')
    expect(limitCall?.args[0]).toBe(200)
  })

  it('applies an .in("status", […]) filter when statuses is non-empty', async () => {
    await fetchOutboundEmails('op-1', { statuses: ['failed', 'queued'] })

    const inCalls = mockSupabase.calls.filter((c) => c.method === 'in')
    expect(inCalls).toEqual([
      { method: 'in', args: ['status', ['failed', 'queued']] },
    ])
  })

  it('omits the status filter when statuses is empty (treat as "all")', async () => {
    await fetchOutboundEmails('op-1', { statuses: [] })

    const inCalls = mockSupabase.calls.filter((c) => c.method === 'in')
    expect(inCalls).toHaveLength(0)
  })

  it('applies created_at lower/upper bounds when sinceIso/untilIso are given', async () => {
    await fetchOutboundEmails('op-1', {
      sinceIso: '2026-05-01T00:00:00Z',
      untilIso: '2026-05-21T23:59:59Z',
    })

    const gte = mockSupabase.calls.find((c) => c.method === 'gte')
    const lte = mockSupabase.calls.find((c) => c.method === 'lte')
    expect(gte?.args).toEqual(['created_at', '2026-05-01T00:00:00Z'])
    expect(lte?.args).toEqual(['created_at', '2026-05-21T23:59:59Z'])
  })

  it('honours an explicit limit override', async () => {
    await fetchOutboundEmails('op-1', { limit: 50 })
    const limitCall = mockSupabase.calls.find((c) => c.method === 'limit')
    expect(limitCall?.args[0]).toBe(50)
  })

  it('exposes the four enum values matching the SQL outbound_email_status type', () => {
    expect(OUTBOUND_EMAIL_STATUSES).toEqual([
      'queued',
      'sending',
      'sent',
      'failed',
    ])
  })
})
