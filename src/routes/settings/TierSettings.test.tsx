/**
 * TierSettings — Operator Override panel race-condition regression test
 * (landr-7hac CRITICAL 4).
 *
 * OperatorOverridePanel's "params" popover resolves the `enabled` value it
 * writes to `operator_features` from
 *   override?.enabled ?? eff?.enabled ?? false
 * — if `effectiveQuery` (operator_effective_entitlements) hasn't resolved
 * yet, `eff` is undefined and that falls back to `false`, silently
 * INSERTing a forced-OFF override for an operator who was actually
 * inheriting an ON default. The fix disables every mutating control in the
 * panel (force on/off, clear, params) until BOTH `overridesQuery` and
 * `effectiveQuery` have settled.
 */
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'auth-user-1' },
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    isLandrStaff: true,
    effectiveIsStaff: true,
    isLoading: false,
  }),
}))

vi.mock('@/lib/tickets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tickets')>()
  return {
    ...actual,
    fetchCurrentPublicUser: async () => ({
      id: 'public-user-1',
      email: 'staff@landr.test',
      is_landr_staff: true,
    }),
  }
})

const { effectiveDeferred, setOperatorFeatureConfigMock } = vi.hoisted(() => {
  let resolveEffective: ((value: unknown) => void) | null = null
  const promise = new Promise((resolve) => {
    resolveEffective = resolve
  })
  return {
    effectiveDeferred: {
      promise,
      resolve: (value: unknown) => resolveEffective?.(value),
    },
    setOperatorFeatureConfigMock: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/tiers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tiers')>()

  const feature = {
    id: 'feat-1',
    key: 'feat_key_1',
    name: 'Feature One',
    description: null,
    surface: 'dashboard',
    category: 'bookings',
    status: 'ga' as const,
    default_enabled: true,
    sort_order: 1,
    value_schema: {
      params: [{ key: 'limit', type: 'integer' as const, label: 'Limit', min: 0 }],
    },
    active: true,
  }

  return {
    ...actual,
    fetchFeatures: async () => [feature],
    fetchAllFeatures: async () => [feature],
    fetchPackages: async () => [],
    fetchPackageFeatures: async () => [],
    fetchOperators: async () => [
      { id: 'op-1', slug: 'para42', name: 'Para42', subscription_package_id: 'pkg-1' },
    ],
    // No prior override row — this feature is purely inherited.
    fetchOperatorFeatures: async () => [],
    // Never resolves until the test explicitly resolves it — simulates the
    // in-flight window the race depends on.
    fetchEffectiveEntitlements: () => effectiveDeferred.promise,
    setOperatorFeatureConfig: (...args: unknown[]) =>
      setOperatorFeatureConfigMock(...args),
  }
})

import { TierSettings } from './TierSettings'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  setOperatorFeatureConfigMock.mockClear()
})

describe('TierSettings — Operator Override panel (landr-7hac CRITICAL 4)', () => {
  it('disables the params popover while effectiveQuery is pending, even after overridesQuery resolves', async () => {
    const user = userEvent.setup()
    render(<TierSettings />)

    const picker = await screen.findByLabelText('Operator')
    await screen.findByRole('option', { name: 'Para42 (para42)' })
    await user.selectOptions(picker, 'op-1')

    // overridesQuery resolves fast (mocked as an immediate empty array);
    // effectiveQuery is still pending (deferred, unresolved).
    const paramsButton = await screen.findByRole('button', { name: 'params' })
    await waitFor(() => expect(paramsButton).toBeDisabled())

    // Also cover the on/off toggles + clear button for the same gate.
    expect(screen.getByRole('button', { name: 'On' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })

  it('re-enables the params popover once effectiveQuery resolves', async () => {
    render(<TierSettings />)

    const picker = await screen.findByLabelText('Operator')
    await screen.findByRole('option', { name: 'Para42 (para42)' })
    await userEvent.setup().selectOptions(picker, 'op-1')

    const paramsButton = await screen.findByRole('button', { name: 'params' })
    expect(paramsButton).toBeDisabled()

    effectiveDeferred.resolve(
      new Map([['feat_key_1', { feature_key: 'feat_key_1', enabled: true, config: {} }]]),
    )

    await waitFor(() => expect(paramsButton).not.toBeDisabled())
  })
})
