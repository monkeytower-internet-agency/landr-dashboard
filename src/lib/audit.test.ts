import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type CapturedCall = {
  table: string
  select: string
  order: Array<{ column: string; ascending: boolean }>
  range: { from: number; to: number } | null
  eq: Record<string, unknown>
  gte: Record<string, unknown>
  lte: Record<string, unknown>
}

const { mock } = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[],
    error: null as { message: string } | null,
    lastCall: null as CapturedCall | null,
  }

  function makeBuilder(tableName: string) {
    const call: CapturedCall = {
      table: tableName,
      select: '',
      order: [],
      range: null,
      eq: {},
      gte: {},
      lte: {},
    }
    state.lastCall = call

    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn((sel: string) => {
        call.select = sel
        return builder
      }),
      order: vi.fn(
        (
          column: string,
          opts?: { ascending?: boolean },
        ) => {
          call.order.push({ column, ascending: opts?.ascending !== false })
          return builder
        },
      ),
      range: vi.fn((from: number, to: number) => {
        call.range = { from, to }
        return builder
      }),
      eq: vi.fn((col: string, val: unknown) => {
        call.eq[col] = val
        return builder
      }),
      gte: vi.fn((col: string, val: unknown) => {
        call.gte[col] = val
        return builder
      }),
      lte: vi.fn((col: string, val: unknown) => {
        call.lte[col] = val
        return builder
      }),
      // Terminal: the awaited builder resolves to { data, error }.
      then: (
        onFulfilled: (v: { data: unknown[]; error: { message: string } | null }) => unknown,
      ) =>
        Promise.resolve({
          data: state.rows,
          error: state.error,
        }).then(onFulfilled),
    })
    return builder
  }

  const supabase = {
    from: vi.fn((tableName: string) => makeBuilder(tableName)),
  }
  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
}))

import {
  AUDIT_PAGE_SIZE,
  auditActorDisplay,
  auditDateTime,
  auditPayloadJson,
  dateBoundsToTimestamps,
  fetchAuditPage,
  type AuditRow,
} from './audit'

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  mock.state.lastCall = null
})

afterEach(() => {
  vi.clearAllMocks()
})

const sampleRow: AuditRow = {
  id: '11111111-1111-1111-1111-111111111111',
  occurred_at: '2026-05-21T10:00:00.000Z',
  operator_id: 'op-1',
  table_name: 'bookings',
  row_id: 'b-1',
  operation: 'UPDATE',
  actor_kind: 'user',
  actor_subkind: 'staff',
  user_id: '22222222-2222-2222-2222-222222222222',
  external_correlation_id: null,
  old_row: { stage: 'pending' },
  new_row: { stage: 'confirmed' },
}

describe('dateBoundsToTimestamps', () => {
  it('returns nulls for empty input', () => {
    expect(dateBoundsToTimestamps(null, null)).toEqual({
      fromIso: null,
      toIso: null,
    })
    expect(dateBoundsToTimestamps('', '')).toEqual({
      fromIso: null,
      toIso: null,
    })
  })

  it('expands a bare date into a full UTC day', () => {
    const { fromIso, toIso } = dateBoundsToTimestamps(
      '2026-05-21',
      '2026-05-22',
    )
    expect(fromIso).toBe('2026-05-21T00:00:00.000Z')
    expect(toIso).toBe('2026-05-22T23:59:59.999Z')
  })
})

describe('fetchAuditPage', () => {
  it('orders by occurred_at DESC, id DESC and pages with PAGE_SIZE', async () => {
    mock.state.rows = [sampleRow]
    const out = await fetchAuditPage({ page: 2 })

    expect(out).toEqual([sampleRow])
    expect(mock.state.lastCall).not.toBeNull()
    expect(mock.state.lastCall!.table).toBe('audit_log')
    expect(mock.state.lastCall!.order).toEqual([
      { column: 'occurred_at', ascending: false },
      { column: 'id', ascending: false },
    ])
    expect(mock.state.lastCall!.range).toEqual({
      from: 2 * AUDIT_PAGE_SIZE,
      to: 3 * AUDIT_PAGE_SIZE - 1,
    })
  })

  it('passes table_name, user_id, operation, and date bounds as filters', async () => {
    await fetchAuditPage({
      tableName: 'bookings',
      userId: 'user-1',
      operation: 'UPDATE',
      from: '2026-05-01',
      to: '2026-05-21',
    })

    expect(mock.state.lastCall!.eq).toEqual({
      table_name: 'bookings',
      user_id: 'user-1',
      operation: 'UPDATE',
    })
    expect(mock.state.lastCall!.gte).toEqual({
      occurred_at: '2026-05-01T00:00:00.000Z',
    })
    expect(mock.state.lastCall!.lte).toEqual({
      occurred_at: '2026-05-21T23:59:59.999Z',
    })
  })

  it('omits filters when not provided', async () => {
    await fetchAuditPage({})
    expect(mock.state.lastCall!.eq).toEqual({})
    expect(mock.state.lastCall!.gte).toEqual({})
    expect(mock.state.lastCall!.lte).toEqual({})
  })

  it('does NOT scope by operator_id — RLS handles that (staff bypass)', async () => {
    await fetchAuditPage({ tableName: 'bookings' })
    expect(mock.state.lastCall!.eq).not.toHaveProperty('operator_id')
  })

  it('defaults page to 0 when omitted', async () => {
    await fetchAuditPage({})
    expect(mock.state.lastCall!.range).toEqual({
      from: 0,
      to: AUDIT_PAGE_SIZE - 1,
    })
  })

  it('throws on supabase errors', async () => {
    mock.state.error = { message: 'rls-denied' }
    await expect(fetchAuditPage({})).rejects.toThrow('rls-denied')
  })
})

describe('auditDateTime', () => {
  it('handles null and invalid ISO strings gracefully', () => {
    expect(auditDateTime(null)).toBe('—')
    expect(auditDateTime('not-a-date')).toBe('not-a-date')
  })

  it('formats a valid ISO date', () => {
    const out = auditDateTime('2026-05-21T10:00:00.000Z')
    expect(out).not.toBe('—')
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('auditActorDisplay', () => {
  it('composes actor_kind, actor_subkind, and short user_id', () => {
    expect(auditActorDisplay(sampleRow)).toBe('user · staff · 22222222')
  })

  it('omits null subkind and user_id', () => {
    const row = { ...sampleRow, actor_subkind: null, user_id: null }
    expect(auditActorDisplay(row)).toBe('user')
  })
})

describe('auditPayloadJson', () => {
  it('pretty-prints both old_row and new_row', () => {
    const out = auditPayloadJson(sampleRow)
    const parsed = JSON.parse(out)
    expect(parsed.old_row).toEqual({ stage: 'pending' })
    expect(parsed.new_row).toEqual({ stage: 'confirmed' })
  })

  it('renders nulls when both rows are missing', () => {
    const row = { ...sampleRow, old_row: null, new_row: null }
    const parsed = JSON.parse(auditPayloadJson(row))
    expect(parsed).toEqual({ old_row: null, new_row: null })
  })
})
