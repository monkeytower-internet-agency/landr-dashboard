import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { OperatorSettings, GmailStatus } from '@/lib/operatorSettings'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPERATOR_FIXTURE: OperatorSettings = {
  id: 'op-1',
  name: 'Para42',
  legal_name: 'Para42 GmbH',
  slug: 'para42',
  tax_id: 'DE123456789',
  tax_id_kind: 'VAT',
  phone: '+49 1234 567890',
  street: 'Hauptstr. 1',
  city: 'Berlin',
  postal_code: '10115',
  region: 'Berlin',
  country: 'DE',
  timezone: 'Europe/Berlin',
  default_locale: 'de',
}

const GMAIL_NOT_CONNECTED: GmailStatus = { connected: false }

const GMAIL_CONNECTED: GmailStatus = {
  connected: true,
  email_address: 'martin@para42.de',
  connected_at: '2026-05-01T10:00:00.000Z',
}

// ---------------------------------------------------------------------------
// Module mocks (hoisted)
// ---------------------------------------------------------------------------

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: {
    fetchOperator: vi.fn<(id: string) => Promise<OperatorSettings>>(),
    patchOperator: vi.fn<(id: string, patch: Partial<OperatorSettings>) => Promise<OperatorSettings>>(),
    fetchGmailStatus: vi.fn<(id: string) => Promise<GmailStatus>>(),
    fetchGmailInstallUrl: vi.fn<(id: string) => Promise<{ install_url: string; state: string }>>(),
    disconnectGmail: vi.fn<(id: string) => Promise<void>>(),
  },
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: fetchMock.fetchOperator,
    patchOperator: fetchMock.patchOperator,
    fetchGmailStatus: fetchMock.fetchGmailStatus,
    fetchGmailInstallUrl: fetchMock.fetchGmailInstallUrl,
    disconnectGmail: fetchMock.disconnectGmail,
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { access_token: 'tok-1', user: { id: 'user-1' } },
    user: { id: 'user-1', email: 'martin@para42.de' },
    loading: false,
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: { success: [] as string[], error: [] as string[] },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => { toastCalls.success.push(msg) }),
    error: vi.fn((msg: string) => { toastCalls.error.push(msg) }),
  },
  Toaster: () => null,
}))

import { Settings } from './Settings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.fetchOperator.mockResolvedValue({ ...OPERATOR_FIXTURE })
  fetchMock.patchOperator.mockResolvedValue({ ...OPERATOR_FIXTURE })
  fetchMock.fetchGmailStatus.mockResolvedValue({ ...GMAIL_NOT_CONNECTED })
  fetchMock.fetchGmailInstallUrl.mockResolvedValue({
    install_url: 'https://accounts.google.com/o/oauth2/auth?fake=1',
    state: 'hmac-state-abc',
  })
  fetchMock.disconnectGmail.mockResolvedValue(undefined)
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Settings route', () => {
  it('loads and renders the operator row', async () => {
    render(<Settings />)
    await screen.findByDisplayValue('Para42')
    expect(screen.getByDisplayValue('Para42 GmbH')).toBeInTheDocument()
    expect(screen.getByDisplayValue('para42')).toBeInTheDocument()
    expect(screen.getByDisplayValue('DE123456789')).toBeInTheDocument()
    expect(screen.getByDisplayValue('DE')).toBeInTheDocument()
  })

  it('edits company name and calls PATCH on submit', async () => {
    const user = userEvent.setup()
    render(<Settings />)

    const nameInput = await screen.findByDisplayValue('Para42')
    await user.clear(nameInput)
    await user.type(nameInput, 'Para42 Updated')

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(fetchMock.patchOperator).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ name: 'Para42 Updated' }),
      )
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('surfaces a toast error when PATCH returns 4xx', async () => {
    fetchMock.patchOperator.mockRejectedValueOnce(new Error('operator_not_found'))
    const user = userEvent.setup()
    render(<Settings />)

    const nameInput = await screen.findByDisplayValue('Para42')
    await user.clear(nameInput)
    await user.type(nameInput, 'Bad')

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(toastCalls.error.length).toBeGreaterThan(0)
    })
  })

  it('shows inline validation error when name is empty', async () => {
    const user = userEvent.setup()
    render(<Settings />)

    const nameInput = await screen.findByDisplayValue('Para42')
    await user.clear(nameInput)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await screen.findByText(/company name is required/i)
    expect(fetchMock.patchOperator).not.toHaveBeenCalled()
  })

  it('shows Gmail not connected state and renders Connect button', async () => {
    render(<Settings />)
    await screen.findByDisplayValue('Para42')
    await screen.findByText(/not connected/i)
    expect(screen.getByRole('button', { name: /connect gmail/i })).toBeInTheDocument()
  })

  it('shows Gmail connected state with email and Disconnect button', async () => {
    fetchMock.fetchGmailStatus.mockResolvedValue({ ...GMAIL_CONNECTED })
    render(<Settings />)
    await screen.findByDisplayValue('Para42')
    await screen.findByText('martin@para42.de')
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
  })

  it('calls disconnect and shows success toast', async () => {
    fetchMock.fetchGmailStatus.mockResolvedValue({ ...GMAIL_CONNECTED })
    const user = userEvent.setup()
    render(<Settings />)

    await screen.findByText('martin@para42.de')
    await user.click(screen.getByRole('button', { name: /disconnect/i }))

    await waitFor(() => {
      expect(fetchMock.disconnectGmail).toHaveBeenCalledWith('op-1')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })
})
