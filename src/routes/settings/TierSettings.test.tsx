/**
 * TierSettings — Operator Override panel params-only write (bd landr-c53m.15).
 *
 * Real fix, replacing the landr-7hac interim workaround (which resolved and
 * sent an `enabled` value from `override?.enabled ?? eff?.enabled ?? false`,
 * and gated every mutating control on `effectiveQuery` settling to avoid a
 * race where an unresolved `eff` fell back to `false`). Now that
 * operator_features.enabled is nullable with no DEFAULT (landr-api migration
 * 20260703072000_operator_features_enabled_nullable), the params popover's
 * save is a TRUE partial upsert: it never sends `enabled` at all, so there is
 * no resolved-value race to guard against, and the popover need not wait on
 * `effectiveQuery` to become interactive.
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
    // Never resolves until the test explicitly resolves it — proves the
    // params popover no longer needs this to settle before it's usable.
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

describe('TierSettings — Operator Override panel params-only write (bd landr-c53m.15)', () => {
  it('the params popover is usable even while effectiveQuery is still pending', async () => {
    const user = userEvent.setup()
    render(<TierSettings />)

    const picker = await screen.findByLabelText('Operator')
    await screen.findByRole('option', { name: 'Para42 (para42)' })
    await user.selectOptions(picker, 'op-1')

    // overridesQuery resolves fast (mocked as an immediate empty array);
    // effectiveQuery is still pending (deferred, unresolved) — the params
    // popover no longer waits on it, since it never needs a resolved
    // `enabled` value to save.
    const paramsButton = await screen.findByRole('button', { name: 'params' })
    await waitFor(() => expect(paramsButton).not.toBeDisabled())
  })

  it('saving a param never includes `enabled` in the write — a true partial upsert', async () => {
    const user = userEvent.setup()
    render(<TierSettings />)

    const picker = await screen.findByLabelText('Operator')
    await screen.findByRole('option', { name: 'Para42 (para42)' })
    await user.selectOptions(picker, 'op-1')

    const paramsButton = await screen.findByRole('button', { name: 'params' })
    await user.click(paramsButton)

    const saveButton = await screen.findByRole('button', { name: 'Save params' })
    await user.click(saveButton)

    await waitFor(() => expect(setOperatorFeatureConfigMock).toHaveBeenCalled())
    const [args] = setOperatorFeatureConfigMock.mock.calls[0] as [
      Record<string, unknown>,
    ]
    expect(args).not.toHaveProperty('enabled')
    expect(args).toMatchObject({ operatorId: 'op-1', featureId: 'feat-1' })
  })
})
