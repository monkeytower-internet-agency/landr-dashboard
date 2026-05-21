// landr-6ybs — Settings → Calendar feed (per-operator subscribable ICS).
//
// Verifies the page fetches + renders the URL, the Copy button writes
// to navigator.clipboard, and Regenerate gates behind the confirmation
// dialog before issuing the rotation request.

import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/operator', async () => {
  const mod = await vi.importActual<typeof import('@/lib/operator')>(
    '@/lib/operator',
  )
  return {
    ...mod,
    useOperator: () => ({
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
      switchOperator: () => {},
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

const { fetchTokenMock, regenerateTokenMock } = vi.hoisted(() => ({
  fetchTokenMock: vi.fn(),
  regenerateTokenMock: vi.fn(),
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperatorIcalToken: (...args: unknown[]) => fetchTokenMock(...args),
    regenerateOperatorIcalToken: (...args: unknown[]) =>
      regenerateTokenMock(...args),
  }
})

// Mock toast so we can assert success/error notifications cheaply.
const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

import { IntegrationsCalendarSettings } from './IntegrationsCalendarSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

const ORIGINAL_URL =
  'https://api.dev.landr.de/api/public/operators/para42/calendar.ics?token=original-token'
const ROTATED_URL =
  'https://api.dev.landr.de/api/public/operators/para42/calendar.ics?token=rotated-token'

const clipboardWriteText = vi.fn(() => Promise.resolve())

// Install the clipboard mock once at module load — userEvent.setup() reads
// navigator.clipboard at construction time, so a per-test redefinition
// can lose the binding.
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: clipboardWriteText },
})

beforeEach(() => {
  fetchTokenMock.mockReset()
  regenerateTokenMock.mockReset()
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
  clipboardWriteText.mockReset()
  clipboardWriteText.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntegrationsCalendarSettings (landr-6ybs)', () => {
  it('renders the fetched feed URL in an input', async () => {
    fetchTokenMock.mockResolvedValue({
      url: ORIGINAL_URL,
      token: 'original-token',
    })
    render(<IntegrationsCalendarSettings />)

    const input = await screen.findByLabelText(/subscribe url/i)
    expect(input).toHaveValue(ORIGINAL_URL)
    // Read-only so operators can copy but not edit by accident.
    expect(input).toHaveAttribute('readonly')
  })

  it('copies the URL to clipboard on Copy click', async () => {
    fetchTokenMock.mockResolvedValue({
      url: ORIGINAL_URL,
      token: 'original-token',
    })
    render(<IntegrationsCalendarSettings />)

    await screen.findByDisplayValue(ORIGINAL_URL)
    const copyButton = screen.getByRole('button', {
      name: /copy url/i,
    })
    // Use fireEvent.click rather than userEvent.click: userEvent v14
    // replaces navigator.clipboard inside its own setup() call, which
    // shadows the per-test spy we installed in beforeEach. fireEvent
    // bypasses that and dispatches a plain click event so the handler
    // (and thus our spy) runs against the spy we control.
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(ORIGINAL_URL)
    })
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('regenerates the URL after confirmation and shows the rotated value', async () => {
    fetchTokenMock.mockResolvedValue({
      url: ORIGINAL_URL,
      token: 'original-token',
    })
    regenerateTokenMock.mockResolvedValue({
      url: ROTATED_URL,
      token: 'rotated-token',
    })
    const user = userEvent.setup()
    render(<IntegrationsCalendarSettings />)

    // Wait for first render
    await screen.findByDisplayValue(ORIGINAL_URL)

    // Click Regenerate — opens confirm dialog, does NOT call mutate yet.
    const regenButtons = screen.getAllByRole('button', {
      name: /regenerate url/i,
    })
    await user.click(regenButtons[0])
    expect(regenerateTokenMock).not.toHaveBeenCalled()

    // Confirm
    const confirmCta = await screen.findByRole('button', {
      name: /^regenerate$/i,
    })
    await user.click(confirmCta)

    await waitFor(() => {
      expect(regenerateTokenMock).toHaveBeenCalledWith('op-1')
    })
    // URL input updates optimistically once the mutation resolves.
    await waitFor(() => {
      expect(screen.getByLabelText(/subscribe url/i)).toHaveValue(ROTATED_URL)
    })
    expect(toastSuccessMock).toHaveBeenCalled()
  })

  it('does NOT regenerate when the user cancels the confirmation', async () => {
    fetchTokenMock.mockResolvedValue({
      url: ORIGINAL_URL,
      token: 'original-token',
    })
    const user = userEvent.setup()
    render(<IntegrationsCalendarSettings />)

    await screen.findByDisplayValue(ORIGINAL_URL)
    const regenButtons = screen.getAllByRole('button', {
      name: /regenerate url/i,
    })
    await user.click(regenButtons[0])

    const cancelCta = await screen.findByRole('button', { name: /cancel/i })
    await user.click(cancelCta)

    expect(regenerateTokenMock).not.toHaveBeenCalled()
    // URL is still the original one.
    expect(screen.getByLabelText(/subscribe url/i)).toHaveValue(ORIGINAL_URL)
  })

  it('renders subscription instructions for Google / Apple / Outlook', async () => {
    fetchTokenMock.mockResolvedValue({
      url: ORIGINAL_URL,
      token: 'original-token',
    })
    render(<IntegrationsCalendarSettings />)

    await screen.findByDisplayValue(ORIGINAL_URL)
    // Section headings are h3 — query by role to avoid matching the
    // instruction body text that mentions the same calendar names.
    expect(
      screen.getByRole('heading', { level: 3, name: /google calendar/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: /apple calendar/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: /outlook/i }),
    ).toBeInTheDocument()
  })

  it('shows an error toast when regenerate fails', async () => {
    fetchTokenMock.mockResolvedValue({
      url: ORIGINAL_URL,
      token: 'original-token',
    })
    regenerateTokenMock.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    render(<IntegrationsCalendarSettings />)

    await screen.findByDisplayValue(ORIGINAL_URL)
    const regenButtons = screen.getAllByRole('button', {
      name: /regenerate url/i,
    })
    await user.click(regenButtons[0])
    const confirmCta = await screen.findByRole('button', {
      name: /^regenerate$/i,
    })
    await user.click(confirmCta)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled()
    })
  })
})
