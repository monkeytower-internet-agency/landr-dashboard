// Unit tests for vouchers-analytics.ts — day-boundary logic and null-filter.
// landr-v9e4.10 coverage pass.
//
// The key risk here is the inclusive-boundary construction for the Postgres
// query:  fromTs = fromIso + 'T00:00:00.000Z'  /  toTs = toIso + 'T23:59:59.999Z'
// An off-by-a-day on either end would silently drop or include an extra day of
// redemptions, causing wrong analytics totals.
//
// We verify the supabase call parameters directly rather than mocking the network.

import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Minimal supabase mock — captures gte/lte args + filters
// ---------------------------------------------------------------------------

type BuilderState = {
  table: string
  gteArgs: Record<string, string>
  lteArgs: Record<string, string>
  notArgs: Array<[string, string, unknown]>
}

const { mock } = vi.hoisted(() => {
  const state: {
    rows: unknown[]
    calls: BuilderState[]
  } = {
    rows: [],
    calls: [],
  }

  function makeBuilder(table: string) {
    const call: BuilderState = {
      table,
      gteArgs: {},
      lteArgs: {},
      notArgs: [],
    }
    state.calls.push(call)
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      not: vi.fn((col: string, op: string, val: unknown) => {
        call.notArgs.push([col, op, val])
        return builder
      }),
      gte: vi.fn((col: string, val: string) => {
        call.gteArgs[col] = val
        return builder
      }),
      lte: vi.fn((col: string, val: string) => {
        call.lteArgs[col] = val
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(onFulfilled),
    })
    return builder
  }

  return {
    mock: {
      state,
      supabase: { from: vi.fn((t: string) => makeBuilder(t)) },
    },
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }))

import { fetchVoucherRedemptions } from '@/lib/vouchers-analytics'

afterEach(() => {
  mock.state.rows = []
  mock.state.calls = []
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Day-boundary construction
// ---------------------------------------------------------------------------

describe('fetchVoucherRedemptions — day boundaries', () => {
  it('sends fromTs as T00:00:00.000Z on the from date', async () => {
    mock.state.rows = []
    await fetchVoucherRedemptions('op-1', '2026-01-10', '2026-01-20')
    const call = mock.state.calls.find((c) => c.table === 'bookings')!
    expect(call.gteArgs['created_at']).toBe('2026-01-10T00:00:00.000Z')
  })

  it('sends toTs as T23:59:59.999Z on the to date', async () => {
    mock.state.rows = []
    await fetchVoucherRedemptions('op-1', '2026-01-10', '2026-01-20')
    const call = mock.state.calls.find((c) => c.table === 'bookings')!
    expect(call.lteArgs['created_at']).toBe('2026-01-20T23:59:59.999Z')
  })

  it('a single-day window spans from 00:00:00.000Z to 23:59:59.999Z on the same date', async () => {
    mock.state.rows = []
    await fetchVoucherRedemptions('op-1', '2026-03-15', '2026-03-15')
    const call = mock.state.calls.find((c) => c.table === 'bookings')!
    expect(call.gteArgs['created_at']).toBe('2026-03-15T00:00:00.000Z')
    expect(call.lteArgs['created_at']).toBe('2026-03-15T23:59:59.999Z')
  })

  it('does NOT include T23:59:59.999Z of the previous day in the from boundary', async () => {
    // This test guards against an off-by-one like "fromIso T23:59:59"
    mock.state.rows = []
    await fetchVoucherRedemptions('op-1', '2026-06-01', '2026-06-30')
    const call = mock.state.calls.find((c) => c.table === 'bookings')!
    expect(call.gteArgs['created_at']).not.toContain('2026-05-31')
  })

  it('does NOT include T00:00:00.000Z of the next day in the to boundary', async () => {
    mock.state.rows = []
    await fetchVoucherRedemptions('op-1', '2026-06-01', '2026-06-30')
    const call = mock.state.calls.find((c) => c.table === 'bookings')!
    expect(call.lteArgs['created_at']).not.toContain('2026-07-01')
  })
})

// ---------------------------------------------------------------------------
// null voucher_id_applied filtering
// ---------------------------------------------------------------------------

describe('fetchVoucherRedemptions — null voucher_id_applied filtering', () => {
  it('filters out rows whose voucher_id_applied is null', async () => {
    mock.state.rows = [
      {
        id: 'b1',
        created_at: '2026-01-15T10:00:00Z',
        gross_total: '150.00',
        currency: 'EUR',
        current_semantic_state: 'confirmed',
        voucher_id_applied: null,
      },
      {
        id: 'b2',
        created_at: '2026-01-16T10:00:00Z',
        gross_total: '200.00',
        currency: 'EUR',
        current_semantic_state: 'confirmed',
        voucher_id_applied: 'voucher-uuid-1',
      },
    ]
    const results = await fetchVoucherRedemptions('op-1', '2026-01-01', '2026-01-31')
    // Only the row with a real voucher_id should come through
    expect(results).toHaveLength(1)
    expect(results[0]!.voucher_id).toBe('voucher-uuid-1')
    expect(results[0]!.booking_id).toBe('b2')
  })

  it('filters out rows whose voucher_id_applied is an empty string', async () => {
    mock.state.rows = [
      {
        id: 'b3',
        created_at: '2026-01-15T10:00:00Z',
        gross_total: '100.00',
        currency: 'EUR',
        current_semantic_state: 'confirmed',
        voucher_id_applied: '',
      },
    ]
    const results = await fetchVoucherRedemptions('op-1', '2026-01-01', '2026-01-31')
    expect(results).toHaveLength(0)
  })

  it('returns an empty array when there are no redemptions', async () => {
    mock.state.rows = []
    const results = await fetchVoucherRedemptions('op-1', '2026-01-01', '2026-01-31')
    expect(results).toHaveLength(0)
  })

  it('maps fields correctly for valid redemptions', async () => {
    mock.state.rows = [
      {
        id: 'b4',
        created_at: '2026-02-01T08:00:00Z',
        gross_total: '99.50',
        currency: 'USD',
        current_semantic_state: 'finalized',
        voucher_id_applied: 'v-abc',
      },
    ]
    const results = await fetchVoucherRedemptions('op-1', '2026-02-01', '2026-02-01')
    expect(results[0]).toMatchObject({
      booking_id: 'b4',
      voucher_id: 'v-abc',
      created_at: '2026-02-01T08:00:00Z',
      gross_total: '99.50',
      currency: 'USD',
      current_semantic_state: 'finalized',
    })
  })
})
