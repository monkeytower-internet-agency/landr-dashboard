import { describe, expect, it, vi } from 'vitest'

// Mock the supabase client BEFORE importing the module under test so the RPC
// call inside fetchEnabledFeatures resolves against our stub.
const rpcMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))

import {
  FEATURE_ROUTES,
  FEATURE_SECTIONS,
  featureForRoute,
  featureForSection,
  fetchEnabledFeatures,
} from './entitlements-map'

describe('featureForRoute', () => {
  it('maps OFF-set dashboard routes to their gating feature key', () => {
    expect(featureForRoute('/analytics')).toBe('analytics')
    expect(featureForRoute('/reporting')).toBe('reporting')
    expect(featureForRoute('/audit')).toBe('audit')
    expect(featureForRoute('/tickets')).toBe('tickets')
    expect(featureForRoute('/tickets/planning')).toBe('release_planning')
  })

  it('maps ON-set routes too (gating is generic, not Para42-specific)', () => {
    expect(featureForRoute('/bookings')).toBe('bookings')
    expect(featureForRoute('/calendar')).toBe('calendar')
    expect(featureForRoute('/contacts')).toBe('contacts')
  })

  it('returns null for ungated routes (always visible)', () => {
    // Dashboard home, Views, Approvals, Retrieve, Trash have no gating feature.
    expect(featureForRoute('/')).toBeNull()
    expect(featureForRoute('/views')).toBeNull()
    expect(featureForRoute('/approvals/general')).toBeNull()
    expect(featureForRoute('/retrieve')).toBeNull()
    expect(featureForRoute('/trash')).toBeNull()
  })
})

describe('featureForSection', () => {
  it('maps OFF-set settings sections to their gating feature key', () => {
    expect(featureForSection('/settings/vouchers')).toBe('vouchers')
    expect(featureForSection('/settings/campaigns')).toBe('campaigns')
    expect(featureForSection('/settings/tags')).toBe('tags')
    expect(featureForSection('/settings/webhooks')).toBe('webhooks')
    expect(featureForSection('/settings/integrations/gmail')).toBe('gmail')
    expect(featureForSection('/settings/integrations/calendar')).toBe(
      'calendar_feed',
    )
    expect(featureForSection('/settings/plan')).toBe('plan')
  })

  it('maps ON-set settings sections too', () => {
    expect(featureForSection('/settings/products')).toBe('products')
    expect(featureForSection('/settings/pricing')).toBe('pricing')
    expect(featureForSection('/settings/commissions')).toBe('commission')
    expect(featureForSection('/settings/team')).toBe('team')
    expect(featureForSection('/settings/company')).toBe('company')
  })

  it('returns null for ungated/personal sections (always visible)', () => {
    expect(featureForSection('/settings/calendar-display')).toBeNull()
    expect(featureForSection('/settings/display-preferences')).toBeNull()
    expect(featureForSection('/settings/connected-accounts')).toBeNull()
    expect(featureForSection('/settings/notifications')).toBeNull()
    expect(featureForSection('/settings/offers')).toBeNull()
    expect(featureForSection('/settings/service-roles')).toBeNull()
    expect(featureForSection('/settings/operations')).toBeNull()
  })
})

describe('FEATURE_ROUTES / FEATURE_SECTIONS — Para42 OFF-set coverage', () => {
  // The Para42 contract OFF-set (the keys we must be able to hide). community
  // is mobile-only so it has no dashboard surface to gate.
  const OFF_SET = [
    'tickets',
    'release_planning',
    'audit',
    'analytics',
    'reporting',
    'vouchers',
    'campaigns',
    'tags',
    'webhooks',
    'gmail',
    'calendar_feed',
    'plan',
  ]

  it('every dashboard OFF-set key gates at least one route or section', () => {
    for (const key of OFF_SET) {
      const gated =
        (FEATURE_ROUTES[key]?.length ?? 0) > 0 ||
        (FEATURE_SECTIONS[key]?.length ?? 0) > 0
      expect(gated, `OFF-set key "${key}" must gate something`).toBe(true)
    }
  })
})

describe('fetchEnabledFeatures', () => {
  it('returns only the ENABLED feature keys as a Set', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { feature_key: 'bookings', enabled: true },
        { feature_key: 'tickets', enabled: false },
        { feature_key: 'audit', enabled: false },
        { feature_key: 'pricing', enabled: true },
      ],
      error: null,
    })
    const enabled = await fetchEnabledFeatures('op-1')
    expect(enabled.has('bookings')).toBe(true)
    expect(enabled.has('pricing')).toBe(true)
    expect(enabled.has('tickets')).toBe(false)
    expect(enabled.has('audit')).toBe(false)
    // Absent key ⇒ not enabled.
    expect(enabled.has('does_not_exist')).toBe(false)
  })

  it('calls the resolver RPC with the operator id', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    await fetchEnabledFeatures('op-42')
    expect(rpcMock).toHaveBeenCalledWith('operator_effective_features', {
      p_operator_id: 'op-42',
    })
  })

  it('treats a null data payload as no enabled features', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    const enabled = await fetchEnabledFeatures('op-1')
    expect(enabled.size).toBe(0)
  })

  it('throws on RPC error', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    })
    await expect(fetchEnabledFeatures('op-1')).rejects.toThrow('boom')
  })
})
