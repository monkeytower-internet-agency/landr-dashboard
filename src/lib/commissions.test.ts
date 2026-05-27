import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Swap the api-client wrapper to capture (method, path, body) per call.
const { mock } = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ method: string; path: string; body?: unknown }>,
    response: undefined as unknown,
  }
  return { mock: { state } }
})

vi.mock('@/lib/api-client', () => ({
  api: vi.fn(async (method: string, path: string, body?: unknown) => {
    mock.state.calls.push({ method, path, body })
    return mock.state.response
  }),
}))

import {
  COMMISSION_RULE_KIND_LABELS,
  RECIPIENT_KIND_LABELS,
  createCommissionScheme,
  createCommissionTier,
  fetchAgentEarnings,
  fetchAgentEarningsSummary,
  fetchCommissionSchemeTree,
  isTieredCommissionKind,
  patchCommissionRule,
} from './commissions'

const OP = 'op-123'

beforeEach(() => {
  mock.state.calls = []
  mock.state.response = undefined
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('label maps', () => {
  it('cover every recipient kind', () => {
    expect(Object.keys(RECIPIENT_KIND_LABELS).sort()).toEqual([
      'agent',
      'platform',
      'provider',
    ])
  })

  it('cover the full commission rule-kind enum (13 kinds)', () => {
    expect(Object.keys(COMMISSION_RULE_KIND_LABELS)).toHaveLength(13)
  })
})

describe('isTieredCommissionKind', () => {
  it('flags the tier-driven kinds', () => {
    expect(isTieredCommissionKind('value_tier')).toBe(true)
    expect(isTieredCommissionKind('participant_count_tier')).toBe(true)
    expect(isTieredCommissionKind('monthly_volume_bonus')).toBe(true)
  })

  it('does not flag flat/percentage kinds', () => {
    expect(isTieredCommissionKind('base_percentage_of_net')).toBe(false)
    expect(isTieredCommissionKind('base_flat_per_booking')).toBe(false)
    expect(isTieredCommissionKind('manual_override')).toBe(false)
  })
})

describe('scheme + rule + tier write paths', () => {
  it('POSTs a scheme to the operator-scoped path', async () => {
    mock.state.response = { id: 's1' }
    await createCommissionScheme(OP, {
      name: 'Agent base',
      recipient_kind: 'agent',
      currency: 'EUR',
    })
    expect(mock.state.calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/staff/operators/${OP}/commission-schemes`,
      body: { name: 'Agent base', recipient_kind: 'agent', currency: 'EUR' },
    })
  })

  it('PATCHes a rule by id', async () => {
    mock.state.response = { id: 'r1' }
    await patchCommissionRule(OP, 'r1', { active: false })
    expect(mock.state.calls[0]).toMatchObject({
      method: 'PATCH',
      path: `/api/staff/operators/${OP}/commission-rules/r1`,
      body: { active: false },
    })
  })

  it('POSTs a tier under the rule', async () => {
    mock.state.response = { id: 't1' }
    await createCommissionTier(OP, 'r1', { threshold_min: 0, rate: 0.05 })
    expect(mock.state.calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/staff/operators/${OP}/commission-rules/r1/tiers`,
      body: { threshold_min: 0, rate: 0.05 },
    })
  })

  it('GETs the scheme tree by id', async () => {
    mock.state.response = { id: 's1', rules: [] }
    await fetchCommissionSchemeTree(OP, 's1')
    expect(mock.state.calls[0]).toMatchObject({
      method: 'GET',
      path: `/api/staff/operators/${OP}/commission-schemes/s1`,
    })
  })
})

describe('agent earnings read', () => {
  it('lists with no filters → bare path', async () => {
    mock.state.response = []
    await fetchAgentEarnings(OP)
    expect(mock.state.calls[0].path).toBe(
      `/api/staff/operators/${OP}/agent-earnings`,
    )
  })

  it('encodes agent + status filters as query params', async () => {
    mock.state.response = []
    await fetchAgentEarnings(OP, { agentUserId: 'a1', status: 'paid' })
    const { path } = mock.state.calls[0]
    expect(path).toContain(`/api/staff/operators/${OP}/agent-earnings?`)
    expect(path).toContain('agent_user_id=a1')
    expect(path).toContain('status_filter=paid')
  })

  it('GETs the summary endpoint', async () => {
    mock.state.response = []
    await fetchAgentEarningsSummary(OP)
    expect(mock.state.calls[0]).toMatchObject({
      method: 'GET',
      path: `/api/staff/operators/${OP}/agent-earnings/summary`,
    })
  })
})
