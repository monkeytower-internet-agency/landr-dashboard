// landr-wwhn.29 — updated tests for the simplified ReportFab + create-ticket dialog.
//
// Strategy (same mocking pattern as QuickCaptureFab.test.tsx):
//   - vi.mock useOperator      (no full provider tree)
//   - vi.mock useAuth          (no Supabase session needed for the form)
//   - vi.mock createTicket     (no Supabase connection; assert payload shape)
//   - vi.mock uploadTicketAttachment (no Storage connection; assert called)
//   - vi.mock fetchCurrentPublicUser  (no Supabase connection)
//   - vi.mock sonner            (assert toast calls)
//   - vi.mock react-router-dom  (inject location for route auto-capture)
//
// We exercise:
//   1. FAB hidden when no operator is selected.
//   2. FAB visible → click → dialog opens.
//   3. Submit disabled until title is filled.
//   4. All three impact options always visible (no type toggle).
//   5. Contextual repro hint shown for Blocking / Annoying; absent for Idea.
//   6. Happy-path submit — correct payload (type derived from impact), toast fired, dialog closed.
//   7. Error path — toast shown, dialog stays open.
//   8. resolveTicketType (new single-arg form) unit tests.
//   9. Null-reporter graceful fallback.
//  10. Staged file attachment — file is uploaded after ticket created.
//  11. Link URL validation — invalid URL shows error, valid passes.
//  12. Auto-context appended to body (route + app version).

import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type {
  TicketCreate,
  TicketRow,
  PublicUser,
  TicketAttachment,
} from '@/lib/tickets'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    createTicket: vi.fn<(payload: TicketCreate) => Promise<TicketRow>>(),
    uploadTicketAttachment: vi.fn<
      (
        ticketId: string,
        file: File,
        uploaderId: string | null,
      ) => Promise<{ attachment: TicketAttachment; signedUrl: string }>
    >(),
    fetchCurrentPublicUser: vi.fn<(authUid: string) => Promise<PublicUser | null>>(),
    useOperator: vi.fn<() => { currentOperatorId: string | null }>(),
    useAuth: vi.fn<() => { user: { id: string } | null }>(),
  },
}))

vi.mock('@/lib/tickets', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tickets')>(
    '@/lib/tickets',
  )
  return {
    ...actual,
    createTicket: (payload: TicketCreate) => mocks.createTicket(payload),
    uploadTicketAttachment: (
      ticketId: string,
      file: File,
      uploaderId: string | null,
    ) => mocks.uploadTicketAttachment(ticketId, file, uploaderId),
    fetchCurrentPublicUser: (authUid: string) =>
      mocks.fetchCurrentPublicUser(authUid),
  }
})

vi.mock('@/lib/operator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/operator')>(
    '@/lib/operator',
  )
  return {
    ...actual,
    useOperator: () => mocks.useOperator(),
  }
})

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>(
    '@/lib/auth',
  )
  return {
    ...actual,
    useAuth: () => mocks.useAuth(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { ReportFab } from './ReportFab'
import { ReportFabProvider } from '@/lib/report-fab-context'

const OP_ID = 'op-test-1'
const TICKET_ID = 'ticket-uuid-0001'

function makeTicketRow(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: TICKET_ID,
    context: 'operations',
    type: 'bug',
    title: 'Something broke',
    body: null,
    status: 'backlog',
    priority: 'p2',
    perceived_impact: 'annoying',
    reporter_id: null,
    operator_id: OP_ID,
    assignee_id: null,
    blocked: false,
    moscow: null,
    origin_tier: null,
    origin_operator_label: null,
    created_at: '2026-05-24T10:00:00Z',
    updated_at: '2026-05-24T10:00:00Z',
    ...overrides,
  }
}

function makeAttachment(): { attachment: TicketAttachment; signedUrl: string } {
  return {
    attachment: {
      id: 'att-1',
      ticket_id: TICKET_ID,
      uploader_id: null,
      storage_path: 'ticket-attachments/ticket-uuid-0001/att-1/file.png',
      filename: 'file.png',
      content_type: 'image/png',
      size_bytes: 1024,
      created_at: '2026-05-24T10:00:00Z',
    },
    signedUrl: 'https://example.com/signed/file.png',
  }
}

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // landr-q9ph: cd1ebac moved ReportFab's open state into ReportFabContext
  // (the provider wraps AppShell in production). ReportFab now calls
  // useReportFab(), which throws outside a provider — so wrap the render here,
  // mirroring how AppShell mounts <ReportFabProvider>.
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/dashboard/overview']}>
          <ReportFabProvider>{children}</ReportFabProvider>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

const PUBLIC_USER_ID = 'public-user-uuid-1'

beforeEach(() => {
  mocks.createTicket.mockReset()
  mocks.uploadTicketAttachment.mockReset()
  mocks.fetchCurrentPublicUser.mockReset()
  mocks.useOperator.mockReset()
  mocks.useAuth.mockReset()
  mocks.useOperator.mockReturnValue({ currentOperatorId: OP_ID })
  mocks.useAuth.mockReturnValue({ user: { id: 'auth-user-1' } })
  mocks.fetchCurrentPublicUser.mockResolvedValue({
    id: PUBLIC_USER_ID,
    email: 'martin@example.com',
    is_landr_staff: false,
  })
  mocks.uploadTicketAttachment.mockResolvedValue(makeAttachment())
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

// ---- Unit tests for resolveTicketType (new single-arg form) -----------------

import { resolveTicketType } from '@/lib/tickets'

describe('resolveTicketType (unit — single-arg, landr-wwhn.29)', () => {
  it('blocking → bug', () => {
    expect(resolveTicketType('blocking')).toBe('bug')
  })
  it('annoying → bug', () => {
    expect(resolveTicketType('annoying')).toBe('bug')
  })
  it('idea → feature', () => {
    expect(resolveTicketType('idea')).toBe('feature')
  })
})

// ---- DOM integration tests -------------------------------------------------

describe('ReportFab', () => {
  it('hides the button when no operator is selected', () => {
    mocks.useOperator.mockReturnValue({ currentOperatorId: null })
    render(<ReportFab />)
    expect(screen.queryByTestId('report-fab-trigger')).not.toBeInTheDocument()
  })

  it('renders the Feedback button when an operator is selected', () => {
    render(<ReportFab />)
    expect(screen.getByTestId('report-fab-trigger')).toBeInTheDocument()
    expect(screen.getByText(/feedback/i)).toBeInTheDocument()
  })

  it('opens the dialog when clicked', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))
    expect(
      screen.getByRole('heading', { name: /report an issue/i }),
    ).toBeInTheDocument()
  })

  it('keeps Submit disabled until a title is entered', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    const submit = screen.getByRole('button', { name: /send feedback/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/summary/i), 'It crashes')
    expect(submit).toBeEnabled()
  })

  it('shows all three impact options always', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    expect(screen.getByTestId('report-impact-blocking')).toBeInTheDocument()
    expect(screen.getByTestId('report-impact-annoying')).toBeInTheDocument()
    expect(screen.getByTestId('report-impact-idea')).toBeInTheDocument()
  })

  it('shows repro hint for Blocking impact', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    await user.click(screen.getByTestId('report-impact-blocking'))
    expect(screen.getByTestId('report-repro-hint')).toBeInTheDocument()
  })

  it('shows repro hint for Annoying impact (default)', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    // Default impact is "annoying"
    expect(screen.getByTestId('report-repro-hint')).toBeInTheDocument()
  })

  it('hides repro hint for Idea/suggestion impact', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    await user.click(screen.getByTestId('report-impact-idea'))
    expect(screen.queryByTestId('report-repro-hint')).not.toBeInTheDocument()
  })

  it('submits correct payload (blocking → bug) and closes dialog on success', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.click(screen.getByTestId('report-impact-blocking'))
    await user.type(screen.getByLabelText(/summary/i), 'Login fails')
    await user.type(screen.getByLabelText(/details/i), 'Steps to repro here')

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    expect(mocks.fetchCurrentPublicUser).toHaveBeenCalledWith('auth-user-1')
    expect(mocks.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        operator_id: OP_ID,
        reporter_id: PUBLIC_USER_ID,
        type: 'bug',
        perceived_impact: 'blocking',
        title: 'Login fails',
      }),
    )

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })
    // Friendly toast includes short ticket ID
    const msg = vi.mocked(toast.success).mock.calls[0][0] as string
    expect(msg).toMatch(TICKET_ID.slice(0, 8))

    // Dialog closed
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /report an issue/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('submits idea ticket with feature type', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(
      makeTicketRow({ type: 'feature', perceived_impact: 'idea' }),
    )
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.click(screen.getByTestId('report-impact-idea'))
    await user.type(screen.getByLabelText(/summary/i), 'Export to PDF')
    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    expect(mocks.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'feature',
        perceived_impact: 'idea',
      }),
    )
  })

  it('appends auto-context (route + version) to body', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'Context test')
    await user.type(screen.getByLabelText(/details/i), 'User body')

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => expect(mocks.createTicket).toHaveBeenCalledTimes(1))
    const payload = mocks.createTicket.mock.calls[0][0] as TicketCreate
    expect(payload.body).toMatch(/\[context: route=/)
    expect(payload.body).toMatch(/app=test/)
    expect(payload.body).toContain('User body')
  })

  it('appends context even with empty body', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'No body test')
    // Leave body blank

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => expect(mocks.createTicket).toHaveBeenCalledTimes(1))
    const payload = mocks.createTicket.mock.calls[0][0] as TicketCreate
    // body still has the context note even when the operator left it blank
    expect(payload.body).toMatch(/\[context: route=/)
  })

  it('appends link URL into context note when provided', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'Link test')
    await user.type(
      screen.getByTestId('report-link-input'),
      'https://example.com/page',
    )

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => expect(mocks.createTicket).toHaveBeenCalledTimes(1))
    const payload = mocks.createTicket.mock.calls[0][0] as TicketCreate
    expect(payload.body).toContain('https://example.com/page')
  })

  it('shows link validation error for non-https URL', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'Link error test')
    await user.type(
      screen.getByTestId('report-link-input'),
      'http://example.com',
    )

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    // createTicket must NOT have been called
    expect(mocks.createTicket).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('uploads staged file after ticket is created', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'With attachment')

    // Use the file input (click-to-attach path) since jsdom does not ship
    // ClipboardEvent. The Ctrl+V paste handler is exercised in a browser e2e
    // test; here we verify the upload flow itself is correct.
    const file = new File(['content'], 'screenshot.png', { type: 'image/png' })
    const fileInput = screen.getByTestId('report-file-input') as HTMLInputElement
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByTestId('report-staged-files')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(mocks.uploadTicketAttachment).toHaveBeenCalledTimes(1)
    })
    expect(mocks.uploadTicketAttachment).toHaveBeenCalledWith(
      TICKET_ID,
      file,
      PUBLIC_USER_ID,
    )
  })

  it('shows an error toast and keeps dialog open on failure', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockRejectedValue(
      new Error('permission denied for table tickets'),
    )
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'Something broke')
    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1)
    })
    const msg = vi.mocked(toast.error).mock.calls[0][0] as string
    expect(msg).toMatch(/permission denied/)

    // Dialog stays open
    expect(
      screen.getByRole('heading', { name: /report an issue/i }),
    ).toBeInTheDocument()
  })

  it('trims whitespace from title', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow({ body: null }))
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), '  Missing feature  ')

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    const payload = mocks.createTicket.mock.calls[0][0] as TicketCreate
    expect(payload.title).toBe('Missing feature')
  })

  it('shows Sending… and disables buttons while mutation is in flight', async () => {
    const user = userEvent.setup()
    let resolve: (r: TicketRow) => void = () => {}
    mocks.createTicket.mockImplementation(
      () => new Promise<TicketRow>((res) => { resolve = res }),
    )
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'A bug')
    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /sending…/i }),
      ).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

    resolve(makeTicketRow())
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /report an issue/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('submits with reporter_id=null when fetchCurrentPublicUser returns null', async () => {
    const user = userEvent.setup()
    mocks.fetchCurrentPublicUser.mockResolvedValue(null)
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'Broken signup test')
    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    const payload = mocks.createTicket.mock.calls[0][0] as TicketCreate
    expect(payload.reporter_id).toBeNull()
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })
  })

  it('submits with reporter_id=null when user is not authenticated', async () => {
    const user = userEvent.setup()
    mocks.useAuth.mockReturnValue({ user: null })
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'Anon report')
    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    expect(mocks.fetchCurrentPublicUser).not.toHaveBeenCalled()
    const payload = mocks.createTicket.mock.calls[0][0] as TicketCreate
    expect(payload.reporter_id).toBeNull()
  })
})
