// landr-6s44 — EmailSenderNudgeBanner component tests.
//
// Covers:
//   - Shows when configured=false
//   - Shows when configured=true but verification_status !== 'verified'
//   - Hidden when verified
//   - Hidden while loading
//   - Hidden on fetch error
//   - Hidden when no operator selected
//   - CTA links to the canonical /account/integrations/email-sender route
//   - Dismiss hides the banner for the session

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import type { EmailSenderConfig } from '@/lib/email-sender'

// ---- operator context mock -------------------------------------------

const { operatorState } = vi.hoisted(() => ({
  operatorState: { currentOperatorId: 'op-1' as string | null },
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: operatorState.currentOperatorId,
    operators: [],
    currentOperator: null,
    loading: false,
    switchOperator: vi.fn(),
  }),
}))

// ---- email-sender status hook mock ------------------------------------

const { emailSenderState } = vi.hoisted(() => ({
  emailSenderState: {
    data: undefined as Partial<EmailSenderConfig> | undefined,
    isLoading: false,
    error: null as unknown,
  },
}))

vi.mock('@/lib/email-sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email-sender')>()
  return {
    ...actual,
    useEmailSenderConfig: () => ({
      data: emailSenderState.data,
      isLoading: emailSenderState.isLoading,
      error: emailSenderState.error,
    }),
  }
})

// ---- helpers ------------------------------------------------------------

import { EmailSenderNudgeBanner } from './EmailSenderNudgeBanner'
import { t } from '@/lib/strings'

function renderBanner() {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter>{children}</MemoryRouter>
  }
  return render(<EmailSenderNudgeBanner />, { wrapper: Wrapper })
}

afterEach(() => {
  operatorState.currentOperatorId = 'op-1'
  emailSenderState.data = undefined
  emailSenderState.isLoading = false
  emailSenderState.error = null
  window.sessionStorage.clear()
  vi.clearAllMocks()
})

describe('EmailSenderNudgeBanner (landr-6s44)', () => {
  it('shows the banner when configured is false', () => {
    emailSenderState.data = { configured: false, verification_status: null }
    renderBanner()
    expect(screen.getByTestId('email-sender-nudge-banner')).toBeInTheDocument()
    expect(screen.getByText(t.emailSenderNudge.title)).toBeInTheDocument()
  })

  it('shows the banner when configured but verification_status is pending', () => {
    emailSenderState.data = { configured: true, verification_status: 'pending' }
    renderBanner()
    expect(screen.getByTestId('email-sender-nudge-banner')).toBeInTheDocument()
  })

  it('shows the banner when configured but verification_status is failed', () => {
    emailSenderState.data = { configured: true, verification_status: 'failed' }
    renderBanner()
    expect(screen.getByTestId('email-sender-nudge-banner')).toBeInTheDocument()
  })

  it('hides the banner when verified', () => {
    emailSenderState.data = { configured: true, verification_status: 'verified' }
    const { container } = renderBanner()
    expect(container.firstChild).toBeNull()
  })

  it('hides the banner while loading', () => {
    emailSenderState.isLoading = true
    emailSenderState.data = undefined
    const { container } = renderBanner()
    expect(container.firstChild).toBeNull()
  })

  it('hides the banner on fetch error', () => {
    emailSenderState.error = new Error('network error')
    emailSenderState.data = undefined
    const { container } = renderBanner()
    expect(container.firstChild).toBeNull()
  })

  it('hides the banner when no operator is selected', () => {
    operatorState.currentOperatorId = null
    emailSenderState.data = { configured: false, verification_status: null }
    const { container } = renderBanner()
    expect(container.firstChild).toBeNull()
  })

  it('CTA links to the canonical /account/integrations/email-sender route', () => {
    emailSenderState.data = { configured: false, verification_status: null }
    renderBanner()
    const link = screen.getByRole('link', { name: t.emailSenderNudge.cta })
    expect(link).toHaveAttribute('href', '/account/integrations/email-sender')
  })

  describe('dismiss', () => {
    it('clicking dismiss hides the banner', async () => {
      const user = userEvent.setup()
      emailSenderState.data = { configured: false, verification_status: null }
      renderBanner()

      const banner = await screen.findByTestId('email-sender-nudge-banner')
      const dismissBtn = within(banner).getByRole('button', { name: /dismiss/i })
      await user.click(dismissBtn)

      await waitFor(() => {
        expect(screen.queryByTestId('email-sender-nudge-banner')).toBeNull()
      })
    })
  })
})
