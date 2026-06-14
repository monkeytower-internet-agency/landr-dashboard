// landr-2soj — EntitlementsProvider gating under "view as operator" mode.
//
// Two gaps this feature closes, pinned here:
//   1. Staff bypass: isEnabled() returns true for everything when the session
//      user is Landr staff AND not in view-as.
//   2. View-as: while a staff user is viewing-as operator X, the bypass is
//      DROPPED — gating resolves against X's operator_effective_features set
//      (effectiveIsStaff === false, the features query RUNS).
//
// useAuth / useOperator / fetchCurrentPublicUser / fetchEnabledFeatures are
// mocked so this is a pure context test (no Supabase, no network).
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => {
  const state = {
    isLandrStaff: false,
    viewAsActive: false,
    currentOperatorId: 'op-x' as string | null,
    // Entitlements map returned by fetchEnabledEntitlements.
    // enabledKeys drives isEnabled; featureConfigs drives getFeatureConfig.
    enabledKeys: ['bookings'] as string[],
    featureConfigs: {} as Record<string, Record<string, unknown>>,
  }
  return { mock: { state } }
})

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { user: { id: 'auth-uid', email: 'ok@landr.de' } },
    user: { id: 'auth-uid', email: 'ok@landr.de' },
    loading: false,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: mock.state.currentOperatorId,
    loading: false,
    viewAsActive: mock.state.viewAsActive,
  }),
}))

vi.mock('@/lib/tickets', () => ({
  fetchCurrentPublicUser: vi.fn(async () => ({
    id: 'pub-1',
    email: 'ok@landr.de',
    is_landr_staff: mock.state.isLandrStaff,
  })),
}))

vi.mock('@/lib/entitlements-map', () => ({
  // Old RPC — kept for backward compat (mobile callers).
  fetchEnabledFeatures: vi.fn(async () => new Set(mock.state.enabledKeys)),
  // New RPC — used by EntitlementsProvider since landr-72u2.2.
  fetchEnabledEntitlements: vi.fn(async () => {
    const m = new Map<string, { enabled: boolean; config: Record<string, unknown> }>()
    for (const key of mock.state.enabledKeys) {
      m.set(key, { enabled: true, config: mock.state.featureConfigs[key] ?? {} })
    }
    return m
  }),
}))

import { EntitlementsProvider, useEntitlements, useFeatureConfig } from './entitlements'

// Probe component: renders the resolved gating decisions as data-attrs so the
// tests can read them without poking context internals.
function Probe() {
  const { isEnabled, isLandrStaff, effectiveIsStaff, isLoading } =
    useEntitlements()
  return (
    <div
      data-testid="probe"
      data-loading={String(isLoading)}
      data-staff={String(isLandrStaff)}
      data-effective-staff={String(effectiveIsStaff)}
      data-bookings={String(isEnabled('bookings'))}
      data-vouchers={String(isEnabled('vouchers'))}
    />
  )
}

// ConfigProbe: tests useFeatureConfig hook via data-attr. Also surfaces
// isLoading so waitFor can gate on the entitlements query RESOLVING — before
// it settles, getFeatureConfig returns {} (loading default), which would let an
// assertion run against the not-yet-loaded value.
function ConfigProbe({ featureKey }: { featureKey: string }) {
  const config = useFeatureConfig(featureKey)
  const { isLoading } = useEntitlements()
  return (
    <div
      data-testid="config-probe"
      data-loading={String(isLoading)}
      data-config={JSON.stringify(config)}
    />
  )
}

function renderProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <EntitlementsProvider>
        <Probe />
      </EntitlementsProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mock.state.isLandrStaff = false
  mock.state.viewAsActive = false
  mock.state.currentOperatorId = 'op-x'
  mock.state.enabledKeys = ['bookings']
  mock.state.featureConfigs = {}
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EntitlementsProvider — staff bypass (landr-2soj)', () => {
  it('bypasses gating for staff NOT in view-as (everything enabled)', async () => {
    mock.state.isLandrStaff = true
    mock.state.viewAsActive = false
    // The operator's resolved set would NOT include vouchers, but the bypass
    // must override that for a normal staff session.
    mock.state.enabledKeys = ['bookings']
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('probe').dataset.loading).toBe('false'),
    )
    const el = screen.getByTestId('probe')
    expect(el.dataset.staff).toBe('true')
    expect(el.dataset.effectiveStaff).toBe('true')
    // Bypass: both ON-set and OFF-set features read as enabled.
    expect(el.dataset.bookings).toBe('true')
    expect(el.dataset.vouchers).toBe('true')
  })
})

describe('EntitlementsProvider — view-as drops the bypass (landr-2soj)', () => {
  it("applies the viewed-as operator's set (no staff bypass) when viewAs active", async () => {
    mock.state.isLandrStaff = true
    mock.state.viewAsActive = true
    // Operator X (e.g. Para42) has bookings ON, vouchers OFF.
    mock.state.enabledKeys = ['bookings']
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('probe').dataset.loading).toBe('false'),
    )
    const el = screen.getByTestId('probe')
    // Raw staff flag stays true (the user IS staff), but effective is false.
    expect(el.dataset.staff).toBe('true')
    expect(el.dataset.effectiveStaff).toBe('false')
    // Gating now mirrors X's tier: bookings ON, vouchers OFF.
    expect(el.dataset.bookings).toBe('true')
    expect(el.dataset.vouchers).toBe('false')
  })
})

describe('EntitlementsProvider — non-staff (control)', () => {
  it('gates a non-staff operator against their resolved set', async () => {
    mock.state.isLandrStaff = false
    mock.state.viewAsActive = false
    mock.state.enabledKeys = ['bookings']
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('probe').dataset.loading).toBe('false'),
    )
    const el = screen.getByTestId('probe')
    expect(el.dataset.staff).toBe('false')
    expect(el.dataset.effectiveStaff).toBe('false')
    expect(el.dataset.bookings).toBe('true')
    expect(el.dataset.vouchers).toBe('false')
  })
})

describe('useFeatureConfig (landr-72u2.2)', () => {
  function renderConfigProvider(featureKey: string) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={client}>
        <EntitlementsProvider>
          <ConfigProbe featureKey={featureKey} />
        </EntitlementsProvider>
      </QueryClientProvider>,
    )
  }

  it('returns {} for an unknown feature key when not loaded', async () => {
    mock.state.enabledKeys = ['bookings']
    mock.state.featureConfigs = {}
    renderConfigProvider('unknown-feature')
    await waitFor(() =>
      expect(screen.getByTestId('config-probe').dataset.loading).toBe('false'),
    )
    const el = screen.getByTestId('config-probe')
    expect(JSON.parse(el.dataset.config ?? '{}')).toEqual({})
  })

  it('returns {} for a feature key with no config set', async () => {
    mock.state.enabledKeys = ['bookings']
    mock.state.featureConfigs = {} // bookings has no config
    renderConfigProvider('bookings')
    await waitFor(() =>
      expect(screen.getByTestId('config-probe').dataset.loading).toBe('false'),
    )
    const el = screen.getByTestId('config-probe')
    expect(JSON.parse(el.dataset.config ?? '{}')).toEqual({})
  })

  it('returns the config blob when one is set for the feature', async () => {
    mock.state.enabledKeys = ['products']
    mock.state.featureConfigs = { products: { max_products: 50 } }
    renderConfigProvider('products')
    await waitFor(() =>
      expect(screen.getByTestId('config-probe').dataset.loading).toBe('false'),
    )
    const el = screen.getByTestId('config-probe')
    expect(JSON.parse(el.dataset.config ?? '{}')).toEqual({ max_products: 50 })
  })
})
