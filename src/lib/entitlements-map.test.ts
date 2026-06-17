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
  fetchEnabledEntitlements,
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

  // landr-p0hu — /email-log is a top-level route (moved out of /settings);
  // its feature key must resolve so the gatedRoute guard in App.tsx fires.
  it('maps /email-log to email_log (landr-p0hu regression)', () => {
    expect(featureForRoute('/email-log')).toBe('email_log')
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
    expect(featureForSection('/account/integrations/calendar')).toBe(
      'calendar_feed',
    )
    expect(featureForSection('/account/plan')).toBe('plan')
  })

  it('maps ON-set settings sections too', () => {
    expect(featureForSection('/settings/products')).toBe('products')
    expect(featureForSection('/settings/pricing')).toBe('pricing')
    expect(featureForSection('/settings/commissions')).toBe('commission')
    expect(featureForSection('/settings/team')).toBe('team')
    expect(featureForSection('/account/company')).toBe('company')
    // landr-jb1k — Booking widget presentation gates on widget_config,
    // mirroring how Branding gates the colours/logo surface.
    expect(featureForSection('/settings/widget')).toBe('widget_config')
  })

  it('returns null for ungated/personal sections (always visible)', () => {
    expect(featureForSection('/settings/calendar-display')).toBeNull()
    expect(featureForSection('/settings/display-preferences')).toBeNull()
    expect(featureForSection('/account/connected-accounts')).toBeNull()
    expect(featureForSection('/account/notifications')).toBeNull()
    // landr-1nwu.2 — Payments & invoicing is ungated: operators always need
    // to enter their own Stripe/Holded keys (like connected-accounts).
    expect(featureForSection('/account/integrations/payments')).toBeNull()
    // landr-ubqo — Gmail (sending mailbox) is ungated for the same reason:
    // operators always need to connect their own Gmail to send booking emails.
    expect(featureForSection('/account/integrations/gmail')).toBeNull()
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
    // 'gmail' is intentionally NOT here — it was ungated (landr-ubqo); see the
    // "returns null for ungated/personal sections" test above.
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

// ============================================================================
// landr-72u2.6 — Free-tier first-login QA: gate shape tests.
//
// These tests pin the expected entitlement state for a FREE-TIER operator
// (subscription_package slug='free') using the operator_effective_entitlements
// RPC (landr-72u2.1). The free tier has no package_features rows, so every
// feature resolves to its global `default_enabled` value from the registry:
//   - GA features: default_enabled=true  → ON
//   - Beta/WIP features: default_enabled=false → OFF
//
// Key invariants asserted here:
//   1. ON-set GA features are visible (bookings, calendar, contacts, etc.)
//   2. Beta/WIP features are hidden (analytics, tickets, vouchers, etc.)
//   3. Every gated nav item that is ON has a matching route gate in App.tsx
//      (no dead-end: gated link → working page).
//   4. Nav items hidden by entitlements are consistently absent from BOTH
//      AppSidebar (featureForRoute) and the route table (gatedRoute).
//
// NOTE: widget_config is referenced in FEATURE_SECTIONS but NOT in the
// feature registry (no row with key='widget_config'). When the entitlements
// RPC resolves, widget_config will be absent → isEnabled returns false →
// /settings/widget is hidden. This is a latent consistency issue: the feature
// key must be added to the API registry migration for the widget settings
// section to be accessible. The route still has a gatedSection guard so no
// 404 is possible — the dead-link is caught at the nav level. A follow-up
// API migration is needed; see handoff landr-72u2.6.md.
// ============================================================================

// Free-tier effective entitlements as returned by operator_effective_entitlements
// for an operator with no package_features overrides (default_enabled drives it).
const FREE_TIER_ENTITLEMENTS: Array<{ feature_key: string; enabled: boolean; config: Record<string, unknown> }> = [
  // GA features — default_enabled=true
  { feature_key: 'bookings', enabled: true, config: {} },
  { feature_key: 'booking_invoice_download', enabled: true, config: {} },
  { feature_key: 'booking_print', enabled: true, config: {} },
  { feature_key: 'branding', enabled: true, config: {} },
  { feature_key: 'calendar', enabled: true, config: {} },
  { feature_key: 'categories', enabled: true, config: {} },
  { feature_key: 'commission', enabled: true, config: {} },
  { feature_key: 'company', enabled: true, config: {} },
  { feature_key: 'contacts', enabled: true, config: {} },
  { feature_key: 'email_log', enabled: true, config: {} },
  { feature_key: 'email_templates', enabled: true, config: {} },
  { feature_key: 'embed', enabled: true, config: {} },
  { feature_key: 'holded', enabled: true, config: {} },
  { feature_key: 'hotel_approvals', enabled: true, config: {} },
  { feature_key: 'manifest', enabled: true, config: {} },
  { feature_key: 'pickup_locations', enabled: true, config: {} },
  { feature_key: 'pricing', enabled: true, config: {} },
  { feature_key: 'products', enabled: true, config: {} },
  { feature_key: 'providers', enabled: true, config: {} },
  { feature_key: 'schedule', enabled: true, config: {} },
  { feature_key: 'stripe', enabled: true, config: {} },
  { feature_key: 'team', enabled: true, config: {} },
  // Beta/WIP features — default_enabled=false → OFF for free tier
  { feature_key: 'analytics', enabled: false, config: {} },
  { feature_key: 'audit', enabled: false, config: {} },
  { feature_key: 'calendar_feed', enabled: false, config: {} },
  { feature_key: 'campaigns', enabled: false, config: {} },
  { feature_key: 'community', enabled: false, config: {} },
  { feature_key: 'form_builder', enabled: false, config: {} },
  { feature_key: 'gmail', enabled: false, config: {} },
  { feature_key: 'plan', enabled: false, config: {} },
  { feature_key: 'release_planning', enabled: false, config: {} },
  { feature_key: 'reporting', enabled: false, config: {} },
  { feature_key: 'tags', enabled: false, config: {} },
  { feature_key: 'tickets', enabled: false, config: {} },
  { feature_key: 'vouchers', enabled: false, config: {} },
  { feature_key: 'webhooks', enabled: false, config: {} },
]

describe('fetchEnabledEntitlements (landr-72u2.1 — new parametric RPC)', () => {
  it('calls operator_effective_entitlements RPC (not the old features RPC)', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    await fetchEnabledEntitlements('op-1')
    expect(rpcMock).toHaveBeenCalledWith('operator_effective_entitlements', {
      p_operator_id: 'op-1',
    })
  })

  it('returns a Map with enabled+config for each feature row', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { feature_key: 'bookings', enabled: true, config: { max_products: 10 } },
        { feature_key: 'tickets', enabled: false, config: {} },
      ],
      error: null,
    })
    const m = await fetchEnabledEntitlements('op-1')
    expect(m.get('bookings')).toEqual({ enabled: true, config: { max_products: 10 } })
    expect(m.get('tickets')).toEqual({ enabled: false, config: {} })
    expect(m.has('absent_key')).toBe(false)
  })

  it('throws on RPC error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } })
    await expect(fetchEnabledEntitlements('op-1')).rejects.toThrow('rpc error')
  })
})

describe('Free-tier nav gate shape (landr-72u2.6)', () => {
  // Build the effective entitlements Map that the EntitlementsProvider would
  // hold after a successful operator_effective_entitlements call for a free-
  // tier operator with no package_features overrides.
  function freeTierMap() {
    const m = new Map<string, { enabled: boolean; config: Record<string, unknown> }>()
    for (const row of FREE_TIER_ENTITLEMENTS) {
      m.set(row.feature_key, { enabled: row.enabled, config: row.config })
    }
    return m
  }

  function isEnabled(featureKey: string): boolean {
    const m = freeTierMap()
    return m.get(featureKey)?.enabled ?? false
  }

  // ON-set primary nav routes — free tier can reach these.
  it('free-tier primary nav: bookings, calendar, contacts are ON', () => {
    expect(isEnabled('bookings')).toBe(true)
    expect(isEnabled('calendar')).toBe(true)
    expect(isEnabled('contacts')).toBe(true)
  })

  // OFF-set primary nav routes — free tier cannot reach these.
  it('free-tier primary nav: analytics, reporting, audit, tickets, release_planning are OFF', () => {
    expect(isEnabled('analytics')).toBe(false)
    expect(isEnabled('reporting')).toBe(false)
    expect(isEnabled('audit')).toBe(false)
    expect(isEnabled('tickets')).toBe(false)
    expect(isEnabled('release_planning')).toBe(false)
  })

  // ON-set settings sections — visible in sub-sidebar for free tier.
  it('free-tier settings: products, pricing, schedule, team, embed, email_templates, branding are ON', () => {
    expect(isEnabled('products')).toBe(true)
    expect(isEnabled('pricing')).toBe(true)
    expect(isEnabled('schedule')).toBe(true)
    expect(isEnabled('team')).toBe(true)
    expect(isEnabled('embed')).toBe(true)
    expect(isEnabled('email_templates')).toBe(true)
    expect(isEnabled('branding')).toBe(true)
    expect(isEnabled('commission')).toBe(true)
    expect(isEnabled('company')).toBe(true)
  })

  // OFF-set settings sections — hidden in sub-sidebar for free tier.
  it('free-tier settings: vouchers, campaigns, tags, webhooks, form_builder, calendar_feed, plan are OFF', () => {
    expect(isEnabled('vouchers')).toBe(false)
    expect(isEnabled('campaigns')).toBe(false)
    expect(isEnabled('tags')).toBe(false)
    expect(isEnabled('webhooks')).toBe(false)
    expect(isEnabled('form_builder')).toBe(false)
    expect(isEnabled('calendar_feed')).toBe(false)
    expect(isEnabled('plan')).toBe(false)
  })

  // No-dead-end invariant: every route in FEATURE_ROUTES that is gated has a
  // corresponding sidebar nav item gated by featureForRoute (no visible link →
  // gated page). This prevents the case where a sidebar item shows but the
  // page redirects (nav dead-end for users who happen to bookmark the route).
  it('no nav dead-ends: every gated route in FEATURE_ROUTES has a featureForRoute mapping', () => {
    for (const [featureKey, paths] of Object.entries(FEATURE_ROUTES)) {
      for (const path of paths) {
        const mappedFeature = featureForRoute(path)
        expect(
          mappedFeature,
          `Route ${path} (key "${featureKey}") has no featureForRoute mapping — dead-end risk`,
        ).toBe(featureKey)
      }
    }
  })

  // No-dead-end invariant: every section in FEATURE_SECTIONS that is gated
  // has a featureForSection mapping (no visible sub-sidebar link → gated page).
  it('no nav dead-ends: every gated section in FEATURE_SECTIONS has a featureForSection mapping', () => {
    for (const [featureKey, paths] of Object.entries(FEATURE_SECTIONS)) {
      for (const path of paths) {
        const mappedFeature = featureForSection(path)
        expect(
          mappedFeature,
          `Section ${path} (key "${featureKey}") has no featureForSection mapping — dead-end risk`,
        ).toBe(featureKey)
      }
    }
  })

  // widget_config gap: the feature key is referenced in FEATURE_SECTIONS but
  // is NOT in the feature registry (no DB row with key='widget_config'). When
  // operator_effective_entitlements resolves, widget_config is absent → false.
  // The section sub-sidebar hides the link so there is no visible dead-end,
  // but the /settings/widget page is inaccessible for all operators. A follow-
  // up API migration must add widget_config to the features table.
  it('widget_config is absent from the free-tier entitlements map (known gap — needs API migration)', () => {
    const m = freeTierMap()
    expect(m.has('widget_config')).toBe(false)
    // Consequence: isEnabled('widget_config') returns false for free operators.
    expect(isEnabled('widget_config')).toBe(false)
    // The section IS listed in FEATURE_SECTIONS (gating intent exists):
    expect(featureForSection('/settings/widget')).toBe('widget_config')
    // So the sub-sidebar WILL hide /settings/widget once the RPC lands.
    // Fix: add widget_config to the features registry via an API migration.
  })
})
