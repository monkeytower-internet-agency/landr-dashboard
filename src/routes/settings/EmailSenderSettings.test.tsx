/**
 * EmailSenderSettings — "Check domain" eligibility pre-check (landr-oqrz.6).
 *
 * Tests the SetupForm's new affordance: clicking "Check domain" calls
 * fetchEmailSenderEligibility and shows an inline hint below the domain input.
 *   path='auto'   → green "your domain is already hosted with us…" hint
 *   path='manual' → muted "You'll add a few DNS records…" hint
 *
 * The existing setup flow (domain submit → POST /setup) is not tested here;
 * these tests only verify the additive Check domain button behaviour.
 */
import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Module mocks — hoisted so they are in scope for vi.mock factories
// ---------------------------------------------------------------------------

const { fetchEligibilityMock } = vi.hoisted(() => ({
  fetchEligibilityMock: vi.fn(),
}))

// Stub useOperator so the panel renders with a fixed operator id.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: 'op-1',
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    loading: false,
    switchOperator: vi.fn(),
    refreshOperators: vi.fn(),
  }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

// Stub page-title to avoid router-dependent breadcrumbs in tests.
vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

// Mock the entire email-sender module:
// - useEmailSenderConfig returns unconfigured state (renders SetupForm)
// - useSetupEmailSender is a no-op mutation stub
// - useVerifyEmailSender is a no-op mutation stub
// - fetchEmailSenderEligibility delegates to the per-test mock
vi.mock('@/lib/email-sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email-sender')>()
  return {
    ...actual,
    useEmailSenderConfig: () => ({
      data: { configured: false },
      isLoading: false,
      error: null,
    }),
    useSetupEmailSender: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    useVerifyEmailSender: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    fetchEmailSenderEligibility: (...args: unknown[]) =>
      fetchEligibilityMock(...args),
  }
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

import { EmailSenderSettings } from './EmailSenderSettings'
import { t } from '@/lib/strings'

function makeQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function render(qc: QueryClient) {
  return rtlRender(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EmailSenderSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Check domain button — path=auto', () => {
  it('shows the auto hint after a successful check', async () => {
    fetchEligibilityMock.mockResolvedValue({
      domain: 'para42.com',
      path: 'auto',
      provider: 'cloudflare',
      in_pool: null,
    })

    const user = userEvent.setup()
    render(makeQc())

    // Wait for the setup form to appear (config loaded).
    const domainInput = await screen.findByPlaceholderText(
      t.emailSenderSettings.domainPlaceholder,
    )

    await user.type(domainInput, 'para42.com')

    const checkBtn = screen.getByTestId('check-domain-button')
    await user.click(checkBtn)

    // The eligibility hint should appear.
    await waitFor(() => {
      expect(screen.getByTestId('eligibility-hint')).toHaveTextContent(
        t.emailSenderSettings.checkDomainHintAuto,
      )
    })

    // The api was called with the typed domain.
    expect(fetchEligibilityMock).toHaveBeenCalledWith('para42.com')
  })
})

describe('Check domain button — path=manual', () => {
  it('shows the manual hint after a successful check', async () => {
    fetchEligibilityMock.mockResolvedValue({
      domain: 'registrar-hosted.example',
      path: 'manual',
      provider: 'manual',
      in_pool: null,
    })

    const user = userEvent.setup()
    render(makeQc())

    const domainInput = await screen.findByPlaceholderText(
      t.emailSenderSettings.domainPlaceholder,
    )
    await user.type(domainInput, 'registrar-hosted.example')

    await user.click(screen.getByTestId('check-domain-button'))

    await waitFor(() => {
      expect(screen.getByTestId('eligibility-hint')).toHaveTextContent(
        t.emailSenderSettings.checkDomainHintManual,
      )
    })
  })
})

describe('Check domain button — hint resets when domain changes', () => {
  it('clears the eligibility hint when the domain input is edited after a check', async () => {
    fetchEligibilityMock.mockResolvedValue({
      domain: 'para42.com',
      path: 'auto',
      provider: 'cloudflare',
      in_pool: null,
    })

    const user = userEvent.setup()
    render(makeQc())

    const domainInput = await screen.findByPlaceholderText(
      t.emailSenderSettings.domainPlaceholder,
    )
    await user.type(domainInput, 'para42.com')
    await user.click(screen.getByTestId('check-domain-button'))
    await waitFor(() => {
      expect(screen.getByTestId('eligibility-hint')).toBeInTheDocument()
    })

    // Now edit the domain — hint should disappear.
    await user.type(domainInput, 'x')
    expect(screen.queryByTestId('eligibility-hint')).not.toBeInTheDocument()
  })
})

describe('Check domain button — disabled state', () => {
  it('is disabled when the domain input is empty', async () => {
    render(makeQc())
    const checkBtn = await screen.findByTestId('check-domain-button')
    expect(checkBtn).toBeDisabled()
  })
})

describe('Check domain button — error resilience', () => {
  it('does not crash when the API call fails (hint simply absent)', async () => {
    fetchEligibilityMock.mockRejectedValue(new Error('network error'))

    const user = userEvent.setup()
    render(makeQc())

    const domainInput = await screen.findByPlaceholderText(
      t.emailSenderSettings.domainPlaceholder,
    )
    await user.type(domainInput, 'para42.com')
    await user.click(screen.getByTestId('check-domain-button'))

    // After the failure the hint should not appear (silently swallowed).
    await waitFor(() => {
      expect(fetchEligibilityMock).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('eligibility-hint')).not.toBeInTheDocument()
  })
})
