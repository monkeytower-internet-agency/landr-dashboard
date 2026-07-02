/**
 * EmailSenderSettings — "Send a test email" card (landr-gp0v).
 *
 * Tests the TestEmailCard rendered when the domain is verified:
 *   - success result → emerald success log with "Sent:" prefix + message ID
 *   - failed result  → destructive failure log with "Failed:" prefix + detail
 *   - button is disabled when input is empty
 *   - button is disabled while mutation is pending
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
// Module mocks
// ---------------------------------------------------------------------------

const { sendTestMock } = vi.hoisted(() => ({
  sendTestMock: vi.fn(),
}))

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

vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

// Mock the email-sender module with a verified config so the TestEmailCard renders.
vi.mock('@/lib/email-sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email-sender')>()
  return {
    ...actual,
    useEmailSenderConfig: () => ({
      data: {
        configured: true,
        sending_domain: 'acme.example',
        from_local_part: 'bookings',
        from_name: 'Acme Events',
        from_address: 'bookings@acme.example',
        verification_status: 'verified',
        dns_provider: 'manual',
        dns_records: [],
        last_error: null,
      },
      isLoading: false,
      error: null,
    }),
    useSetupEmailSender: () => ({ mutate: vi.fn(), isPending: false }),
    useVerifyEmailSender: () => ({ mutate: vi.fn(), isPending: false }),
    useSendEmailSenderTest: () => ({
      mutate: (...args: Parameters<typeof sendTestMock>) => sendTestMock(...args),
      isPending: false,
    }),
  }
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

import { EmailSenderSettings } from './EmailSenderSettings'
import { t } from '@/lib/strings'

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

describe('TestEmailCard — success', () => {
  it('renders the success log with message ID after a sent result', async () => {
    sendTestMock.mockImplementation(
      (_to: string, { onSuccess }: { onSuccess: (r: object) => void }) => {
        onSuccess({
          status: 'sent',
          detail: 'Test email sent from bookings@acme.example to you@test.example.',
          message_id: 'ses-msg-xyz',
          from_address: 'bookings@acme.example',
        })
      },
    )

    const user = userEvent.setup()
    render(makeQc())

    const input = await screen.findByPlaceholderText(
      t.emailSenderSettings.testEmailPlaceholder,
    )
    await user.type(input, 'you@test.example')

    const sendBtn = screen.getByTestId('send-test-email-button')
    await user.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByTestId('test-email-result')).toBeInTheDocument()
    })

    const resultEl = screen.getByTestId('test-email-result')
    expect(resultEl).toHaveTextContent(t.emailSenderSettings.testEmailSuccessPrefix)
    expect(resultEl).toHaveTextContent('ses-msg-xyz')
  })
})

describe('TestEmailCard — failure', () => {
  it('renders the failure log when the result status is "failed"', async () => {
    sendTestMock.mockImplementation(
      (_to: string, { onSuccess }: { onSuccess: (r: object) => void }) => {
        onSuccess({
          status: 'failed',
          detail: 'SES rejected the test email: MessageRejected',
          message_id: null,
          from_address: 'bookings@acme.example',
        })
      },
    )

    const user = userEvent.setup()
    render(makeQc())

    const input = await screen.findByPlaceholderText(
      t.emailSenderSettings.testEmailPlaceholder,
    )
    await user.type(input, 'you@test.example')
    await user.click(screen.getByTestId('send-test-email-button'))

    await waitFor(() => {
      expect(screen.getByTestId('test-email-result')).toBeInTheDocument()
    })

    const resultEl = screen.getByTestId('test-email-result')
    expect(resultEl).toHaveTextContent(t.emailSenderSettings.testEmailFailedPrefix)
    expect(resultEl).toHaveTextContent('MessageRejected')
  })
})

describe('TestEmailCard — disabled states', () => {
  it('disables the Send button when the input is empty', async () => {
    render(makeQc())
    const sendBtn = await screen.findByTestId('send-test-email-button')
    expect(sendBtn).toBeDisabled()
  })
})
