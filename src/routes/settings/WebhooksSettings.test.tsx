// landr-ah9u — Settings → Webhooks UI smoke + interaction coverage.
//
// Verifies the page renders the operator's stored webhooks, the v1 stub
// notice is visible, the add/edit dialog validates the URL + events
// fields, save persists to localStorage, and delete walks through the
// confirm-then-remove flow.

import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
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

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

import { WebhooksSettings } from './WebhooksSettings'
import { addWebhook, readWebhooks, storageKey } from '@/lib/webhooks'

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

const clipboardWriteText = vi.fn(() => Promise.resolve())

// Install the clipboard mock fresh in every beforeEach. userEvent v14
// patches navigator.clipboard inside its own setup() call, which
// shadows the spy. Re-installing per-test means tests that don't go
// through userEvent.setup() (the copy-secret test below) see our spy
// even when an earlier test in the file ran userEvent.setup().
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWriteText },
  })
  window.localStorage.clear()
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

describe('WebhooksSettings (landr-ah9u)', () => {
  it('shows the v1 stub notice and the empty state', () => {
    render(<WebhooksSettings />)
    expect(screen.getByTestId('webhooks-v1-notice')).toHaveTextContent(
      /server-side delivery in v2/i,
    )
    expect(screen.getByTestId('webhooks-empty')).toBeInTheDocument()
  })

  it('renders existing webhooks from localStorage', () => {
    addWebhook('op-1', {
      url: 'https://example.com/landr/hook',
      events: ['booking.created', 'payment.received'],
    })
    render(<WebhooksSettings />)
    expect(screen.getByTestId('webhooks-list')).toBeInTheDocument()
    expect(
      screen.getByText('https://example.com/landr/hook'),
    ).toBeInTheDocument()
    // Event labels render in the row subline.
    expect(
      screen.getByText(/booking created, payment received/i),
    ).toBeInTheDocument()
  })

  it('scopes the list to the current operator (other operator rows do not bleed in)', () => {
    addWebhook('op-1', {
      url: 'https://op-1.example.com/hook',
      events: ['booking.created'],
    })
    addWebhook('op-2', {
      url: 'https://op-2.example.com/hook',
      events: ['booking.created'],
    })
    render(<WebhooksSettings />)
    expect(
      screen.getByText('https://op-1.example.com/hook'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('https://op-2.example.com/hook'),
    ).not.toBeInTheDocument()
  })

  it('blocks save when the URL is missing and when events are empty', async () => {
    const user = userEvent.setup()
    render(<WebhooksSettings />)

    await user.click(screen.getByTestId('webhooks-add'))
    const dialog = await screen.findByTestId('webhook-dialog')

    // Submit with no input — both errors should appear.
    await user.click(within(dialog).getByTestId('webhook-dialog-submit'))
    expect(
      within(dialog).getByText(/enter an endpoint url/i),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/pick at least one event/i),
    ).toBeInTheDocument()
    expect(readWebhooks('op-1')).toEqual([])
  })

  it('blocks save when the URL is not https', async () => {
    const user = userEvent.setup()
    render(<WebhooksSettings />)

    await user.click(screen.getByTestId('webhooks-add'))
    const dialog = await screen.findByTestId('webhook-dialog')

    await user.type(
      within(dialog).getByTestId('webhook-dialog-url'),
      'http://insecure.example.com/hook',
    )
    await user.click(
      within(dialog).getByTestId('webhook-dialog-event-booking.created'),
    )
    await user.click(within(dialog).getByTestId('webhook-dialog-submit'))

    expect(
      within(dialog).getByText(/valid https:\/\/ url/i),
    ).toBeInTheDocument()
    expect(readWebhooks('op-1')).toEqual([])
  })

  it('persists a new webhook and shows it in the list', async () => {
    const user = userEvent.setup()
    render(<WebhooksSettings />)

    await user.click(screen.getByTestId('webhooks-add'))
    const dialog = await screen.findByTestId('webhook-dialog')

    await user.type(
      within(dialog).getByTestId('webhook-dialog-url'),
      'https://example.com/landr/hook',
    )
    await user.click(
      within(dialog).getByTestId('webhook-dialog-event-booking.created'),
    )
    await user.click(
      within(dialog).getByTestId('webhook-dialog-event-payment.received'),
    )
    await user.click(within(dialog).getByTestId('webhook-dialog-submit'))

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalled()
    })

    const stored = readWebhooks('op-1')
    expect(stored).toHaveLength(1)
    expect(stored[0].url).toBe('https://example.com/landr/hook')
    expect(stored[0].events).toEqual([
      'booking.created',
      'payment.received',
    ])
    expect(stored[0].secret).toMatch(/^[0-9a-f]{48}$/)

    expect(
      await screen.findByText('https://example.com/landr/hook'),
    ).toBeInTheDocument()

    // The raw localStorage key follows the documented per-operator
    // namespace — pin it so a future rename breaks loudly.
    expect(window.localStorage.getItem(storageKey('op-1'))).not.toBeNull()
  })

  it('copies the generated secret to the clipboard', async () => {
    // Use fireEvent for BOTH the add button and the copy button — the
    // moment we call userEvent.setup() it replaces navigator.clipboard
    // with its own internal proxy, which shadows the per-test spy we
    // installed at module load. Sticking to fireEvent keeps our spy as
    // the active clipboard so the assertion holds.
    render(<WebhooksSettings />)

    fireEvent.click(screen.getByTestId('webhooks-add'))
    const dialog = await screen.findByTestId('webhook-dialog')

    const secretInput = within(dialog).getByTestId(
      'webhook-dialog-secret',
    ) as HTMLInputElement
    const secret = secretInput.value
    expect(secret).toMatch(/^[0-9a-f]{48}$/)

    fireEvent.click(
      within(dialog).getByTestId('webhook-dialog-secret-copy'),
    )

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(secret)
    })
    expect(toastSuccessMock).toHaveBeenCalled()
  })

  it('edits an existing webhook and preserves the original secret', async () => {
    const created = addWebhook('op-1', {
      url: 'https://old.example.com/hook',
      events: ['booking.created'],
    })
    const user = userEvent.setup()
    render(<WebhooksSettings />)

    await user.click(screen.getByTestId(`webhook-row-${created.id}-edit`))
    const dialog = await screen.findByTestId('webhook-dialog')

    const urlInput = within(dialog).getByTestId(
      'webhook-dialog-url',
    ) as HTMLInputElement
    await user.clear(urlInput)
    await user.type(urlInput, 'https://new.example.com/hook')

    // Subscribe to one more event.
    await user.click(
      within(dialog).getByTestId('webhook-dialog-event-booking.cancelled'),
    )

    await user.click(within(dialog).getByTestId('webhook-dialog-submit'))

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalled()
    })

    const stored = readWebhooks('op-1')
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe(created.id)
    expect(stored[0].secret).toBe(created.secret)
    expect(stored[0].url).toBe('https://new.example.com/hook')
    expect(stored[0].events).toEqual([
      'booking.created',
      'booking.cancelled',
    ])
  })

  it('walks through the delete confirmation flow', async () => {
    const created = addWebhook('op-1', {
      url: 'https://example.com/hook',
      events: ['booking.created'],
    })
    const user = userEvent.setup()
    render(<WebhooksSettings />)

    // First click arms confirm — does NOT delete yet.
    await user.click(screen.getByTestId(`webhook-row-${created.id}-delete`))
    expect(readWebhooks('op-1')).toHaveLength(1)

    // Confirm — deletes the row + shows the toast.
    await user.click(
      screen.getByTestId(`webhook-row-${created.id}-confirm-delete`),
    )

    await waitFor(() => {
      expect(readWebhooks('op-1')).toHaveLength(0)
    })
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(
      screen.queryByText('https://example.com/hook'),
    ).not.toBeInTheDocument()
  })
})
