// landr-wwhn.12 — tests for the ReportFab + create-ticket dialog.
//
// Strategy mirrors QuickCaptureFab.test.tsx:
//   - vi.mock useOperator      (no full provider tree)
//   - vi.mock useAuth          (no Supabase session needed for the form)
//   - vi.mock createTicket     (no Supabase connection; assert payload shape)
//   - vi.mock fetchCurrentPublicUser  (no Supabase connection; returns public.users.id)
//   - vi.mock sonner            (assert toast calls)
//
// We exercise:
//   1. FAB hidden when no operator is selected.
//   2. FAB visible → click → dialog opens.
//   3. Submit disabled until title is filled.
//   4. Type toggle: "Problem" shows repro hint; "Idea" hides it.
//   5. Impact options visible/hidden per toggle (problem → blocking+annoying+idea;
//      idea → only idea, auto-selected).
//   6. Happy-path submit — correct payload sent with reporter_id resolved, toast fired, dialog closed.
//   7. Error path — toast shown, dialog stays open.
//   8. resolveTicketType logic (isolated unit tests, no DOM).
//   9. Null-reporter graceful fallback when fetchCurrentPublicUser returns null.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { TicketCreate, TicketRow, PublicUser } from '@/lib/tickets'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    createTicket: vi.fn<(payload: TicketCreate) => Promise<TicketRow>>(),
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

const OP_ID = 'op-test-1'

function makeTicketRow(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 'ticket-1',
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
    created_at: '2026-05-24T10:00:00Z',
    updated_at: '2026-05-24T10:00:00Z',
    ...overrides,
  }
}

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

const PUBLIC_USER_ID = 'public-user-uuid-1'

beforeEach(() => {
  mocks.createTicket.mockReset()
  mocks.fetchCurrentPublicUser.mockReset()
  mocks.useOperator.mockReset()
  mocks.useAuth.mockReset()
  mocks.useOperator.mockReturnValue({ currentOperatorId: OP_ID })
  mocks.useAuth.mockReturnValue({ user: { id: 'auth-user-1' } })
  // Default: auth uid resolves to a public.users row.
  mocks.fetchCurrentPublicUser.mockResolvedValue({
    id: PUBLIC_USER_ID,
    email: 'martin@example.com',
    is_landr_staff: false,
  })
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

// ---- Unit tests for resolveTicketType (import directly) --------------------
// We test the mapping logic without the DOM to keep the contract clear. The
// helper lives in @/lib/tickets (a non-component module) so it doesn't trip
// react-refresh/only-export-components; here we exercise the real impl via the
// vi.importActual passthrough in the @/lib/tickets mock above.

import { resolveTicketType } from '@/lib/tickets'

describe('resolveTicketType (unit)', () => {
  it('problem + blocking → bug', () => {
    expect(resolveTicketType('problem', 'blocking')).toBe('bug')
  })
  it('problem + annoying → bug', () => {
    expect(resolveTicketType('problem', 'annoying')).toBe('bug')
  })
  it('problem + idea → annoyance', () => {
    expect(resolveTicketType('problem', 'idea')).toBe('annoyance')
  })
  it('idea + any → feature', () => {
    expect(resolveTicketType('idea', 'blocking')).toBe('feature')
    expect(resolveTicketType('idea', 'annoying')).toBe('feature')
    expect(resolveTicketType('idea', 'idea')).toBe('feature')
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
      screen.getByRole('heading', { name: /tell us what/i }),
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

  it('shows the repro hint when toggle is "Problem"', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    // Default is "Problem"
    expect(screen.getByTestId('report-repro-hint')).toBeInTheDocument()
  })

  it('hides the repro hint when toggle is "Idea"', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    // Click the "Idea" type-toggle chip label (not the impact radio).
    // getByText scoped to the type radiogroup chip avoids the ambiguity with
    // the "Just an idea" impact option.
    const typeGroup = screen.getByRole('radiogroup', { name: /^type$/i })
    await user.click(typeGroup.querySelector('label:last-child') as HTMLElement)
    expect(screen.queryByTestId('report-repro-hint')).not.toBeInTheDocument()
  })

  it('shows blocking + annoying impact options for Problem toggle', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    // Default is Problem — all three impact options visible
    expect(screen.getByTestId('report-impact-blocking')).toBeInTheDocument()
    expect(screen.getByTestId('report-impact-annoying')).toBeInTheDocument()
    expect(screen.getByTestId('report-impact-idea')).toBeInTheDocument()
  })

  it('hides blocking/annoying impact options when Idea toggle is selected', async () => {
    const user = userEvent.setup()
    render(<ReportFab />)
    await user.click(screen.getByTestId('report-fab-trigger'))

    await user.click(screen.getByText('Idea'))

    expect(screen.queryByTestId('report-impact-blocking')).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-impact-annoying')).not.toBeInTheDocument()
    expect(screen.getByTestId('report-impact-idea')).toBeInTheDocument()
  })

  it('submits correct payload and closes dialog on success', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow())
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), 'Login fails')
    await user.type(screen.getByLabelText(/details/i), 'Steps to repro here')

    // Select "Blocking" impact
    await user.click(screen.getByTestId('report-impact-blocking'))

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    // reporter_id must be the resolved public.users.id (not the auth uid).
    expect(mocks.fetchCurrentPublicUser).toHaveBeenCalledWith('auth-user-1')
    expect(mocks.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        operator_id: OP_ID,
        reporter_id: PUBLIC_USER_ID,
        type: 'bug',
        title: 'Login fails',
        body: 'Steps to repro here',
        perceived_impact: 'blocking',
      }),
    )

    // Toast fired
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })

    // Dialog closed
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /tell us what/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('submits an Idea ticket with feature type and idea impact', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(
      makeTicketRow({ type: 'feature', perceived_impact: 'idea' }),
    )
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.click(screen.getByText('Idea'))
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
      screen.getByRole('heading', { name: /tell us what/i }),
    ).toBeInTheDocument()
  })

  it('trims whitespace from title and omits empty body', async () => {
    const user = userEvent.setup()
    mocks.createTicket.mockResolvedValue(makeTicketRow({ body: null }))
    render(<ReportFab />)

    await user.click(screen.getByTestId('report-fab-trigger'))
    await user.type(screen.getByLabelText(/summary/i), '  Missing feature  ')
    // Leave body blank

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    await waitFor(() => {
      expect(mocks.createTicket).toHaveBeenCalledTimes(1)
    })
    const payload = mocks.createTicket.mock.calls[0][0] as TicketCreate
    expect(payload.title).toBe('Missing feature')
    expect(payload.body).toBeNull()
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
        screen.queryByRole('heading', { name: /tell us what/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('submits with reporter_id=null when fetchCurrentPublicUser returns null (broken signup)', async () => {
    // Covers the graceful fallback: public.users row missing — ticket still
    // created without reporter attribution; auto-watch trigger silently skips.
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
    // Toast still fires — the ticket was created successfully.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
    })
  })

  it('submits with reporter_id=null when user is not authenticated', async () => {
    // Covers the unauthenticated edge — fetchCurrentPublicUser must not be called.
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
