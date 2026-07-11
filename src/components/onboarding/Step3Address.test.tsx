/**
 * landr-1url — Step3Address phone-format nudge.
 *
 * The operator's own phone field gets a placeholder + inline help text
 * suggesting international format, plus a client-side check (layered on
 * top of the shared OperatorPatchSchema, not baked into it — that schema
 * is also used by CompanySettings.tsx and others) that flags a filled-in
 * phone missing its leading '+' / country code before the patch is sent.
 * Phone stays optional: leaving it blank must still save successfully.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

import type { OperatorSettings } from '@/lib/operatorSettings'
import { t } from '@/lib/strings'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    patchOperator: vi.fn(),
  },
}))

vi.mock('@/lib/operatorSettings', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    patchOperator: mocks.patchOperator,
  }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  )
}

const BASE_OPERATOR: OperatorSettings = {
  id: 'op-test',
  name: 'Test Operator',
  slug: 'test-operator',
  legal_name: null,
  tax_id: null,
  tax_id_kind: null,
  phone: null,
  street: null,
  city: null,
  postal_code: null,
  region: null,
  country: null,
  timezone: null,
  default_locale: null,
  onboarded_at: null,
}

async function renderStep3(operator: OperatorSettings = BASE_OPERATOR) {
  const { Step3Address } = await import('./Step3Address')
  const onAdvance = vi.fn()
  const onBack = vi.fn()
  render(
    <Step3Address
      operator={operator}
      operatorId="op-test"
      onAdvance={onAdvance}
      onBack={onBack}
    />,
    { wrapper },
  )
  return { onAdvance, onBack }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.patchOperator.mockResolvedValue(BASE_OPERATOR)
})

describe('Step3Address phone-format nudge (landr-1url)', () => {
  it('shows placeholder + help text nudging international format', async () => {
    await renderStep3()
    expect(screen.getByLabelText(t.settings.fieldPhone)).toHaveAttribute(
      'placeholder',
      '+34 600 123 456',
    )
    expect(screen.getByText(t.onboarding.step3.phoneHint)).toBeInTheDocument()
  })

  it('flags a phone missing the leading "+" / country code and does NOT save', async () => {
    const user = userEvent.setup()
    const { onAdvance } = await renderStep3()

    await user.type(screen.getByLabelText(t.settings.fieldPhone), '600123456')
    await user.click(screen.getByRole('button', { name: t.onboarding.next }))

    await waitFor(() => {
      expect(screen.getByText(t.onboarding.step3.phoneError)).toBeInTheDocument()
    })
    expect(mocks.patchOperator).not.toHaveBeenCalled()
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('saves successfully once the phone includes a leading "+" / country code', async () => {
    const user = userEvent.setup()
    const { onAdvance } = await renderStep3()

    await user.type(screen.getByLabelText(t.settings.fieldPhone), '+34 600 123 456')
    await user.click(screen.getByRole('button', { name: t.onboarding.next }))

    await waitFor(() => {
      expect(mocks.patchOperator).toHaveBeenCalledTimes(1)
    })
    const [, patch] = mocks.patchOperator.mock.calls[0]
    expect(patch.phone).toBe('+34 600 123 456')
    await waitFor(() => {
      expect(onAdvance).toHaveBeenCalledTimes(1)
    })
  })

  it('leaves the optional phone blank and still saves (no format error)', async () => {
    const user = userEvent.setup()
    const { onAdvance } = await renderStep3()

    // Phone left blank entirely — only touch an unrelated field so the form
    // has something to submit.
    await user.type(screen.getByLabelText(t.settings.fieldStreet), 'Calle Test 1')
    await user.click(screen.getByRole('button', { name: t.onboarding.next }))

    await waitFor(() => {
      expect(mocks.patchOperator).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText(t.onboarding.step3.phoneError)).not.toBeInTheDocument()
    await waitFor(() => {
      expect(onAdvance).toHaveBeenCalledTimes(1)
    })
  })
})
