/**
 * EmailSenderSettings — outcome-aware toast on re-verify (landr-iari).
 *
 * The re-verify button previously gave NO success feedback (only an error
 * toast). These tests drive the configured view's Verify button and assert the
 * toast reflects the returned verification_status:
 *   verified → toast.success(verifySuccess)
 *   pending  → toast.info(verifyPending)
 *   failed   → toast.error(verifyError)
 */
import { render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { toastMock, verifyMutate } = vi.hoisted(() => ({
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  // The mutate stub invokes onSuccess with whatever config the test queued.
  verifyMutate: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: toastMock }))

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

vi.mock('@/lib/page-title', () => ({ PageTitle: () => null }))

// A configured-but-PENDING manual domain so the Verify button renders.
const PENDING_CONFIG = {
  configured: true,
  sending_domain: 'para42.com',
  from_local_part: 'bookings',
  from_address: 'bookings@para42.com',
  verification_status: 'pending' as const,
  dns_provider: 'manual' as const,
  dns_records: [
    { type: 'CNAME', name: 'sel1._domainkey', value: 'sel1.dkim.example' },
  ],
  last_error: null,
}

vi.mock('@/lib/email-sender', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/email-sender')>()
  return {
    ...actual,
    useEmailSenderConfig: () => ({
      data: PENDING_CONFIG,
      isLoading: false,
      error: null,
    }),
    useSetupEmailSender: () => ({ mutate: vi.fn(), isPending: false }),
    useVerifyEmailSender: () => ({ mutate: verifyMutate, isPending: false }),
    useSendEmailSenderTest: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

import { EmailSenderSettings } from './EmailSenderSettings'
import { t } from '@/lib/strings'

function render() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EmailSenderSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.clearAllMocks())

async function clickVerifyResolvingTo(status: 'verified' | 'pending' | 'failed') {
  verifyMutate.mockImplementation((_vars: unknown, opts: { onSuccess?: (c: unknown) => void }) => {
    opts.onSuccess?.({ ...PENDING_CONFIG, verification_status: status })
  })
  const user = userEvent.setup()
  render()
  // Both the status card and the manual DNS card render a "Verify" button; both
  // call handleVerify, so clicking the first exercises the toast path.
  const buttons = await screen.findAllByRole('button', {
    name: t.emailSenderSettings.verifyButton,
  })
  await user.click(buttons[0])
}

describe('EmailSenderSettings — re-verify toast', () => {
  it('shows a success toast when the domain becomes verified', async () => {
    await clickVerifyResolvingTo('verified')
    expect(toastMock.success).toHaveBeenCalledWith(
      t.emailSenderSettings.verifySuccess,
    )
    expect(toastMock.info).not.toHaveBeenCalled()
  })

  it('shows an info toast (not silent) when still pending', async () => {
    await clickVerifyResolvingTo('pending')
    expect(toastMock.info).toHaveBeenCalledWith(
      t.emailSenderSettings.verifyPending,
    )
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('shows an error toast when verification failed', async () => {
    await clickVerifyResolvingTo('failed')
    expect(toastMock.error).toHaveBeenCalledWith(
      t.emailSenderSettings.verifyError,
    )
  })
})
