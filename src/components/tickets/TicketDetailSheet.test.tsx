// landr-wwhn.13 — TicketDetailSheet component tests.
// landr-wwhn.14 — Gateway UI tests.
//
// Covers:
//   - Sheet opens and shows ticket title + type
//   - Details tab: core fields, status, description
//   - Staff-only internal section gated on is_landr_staff
//   - Comments tab: shows comment list + compose area
//   - Comments tab: internal toggle only shown for staff
//   - Timeline tab: shows events list
//   - Attachments tab: empty state
//   - Watch toggle renders
//   - Close button fires onOpenChange(false)
//   - Gateway panel: hidden for non-staff
//   - Gateway panel: visible for staff with prompt input + submit button
//   - Gateway panel: shows already-promoted state when linked_bd_id is set
//   - Gateway panel: calls promote endpoint and toasts on success
//   - Gateway panel: toasts error on promote failure

import {
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { TicketRow } from '@/lib/tickets'

// ---- Supabase mock ----------------------------------------------------------

const { mock } = vi.hoisted(() => {
  const state = {
    userRows: [] as unknown[],
    ticketRows: [] as unknown[],
    commentRows: [] as unknown[],
    eventRows: [] as unknown[],
    attachmentRows: [] as unknown[],
    watcherRow: null as unknown,
    error: null as { message: string } | null,
  }

  const resolveRows = (table: string): unknown[] => {
    if (table === 'ticket_comments' || table === 'ticket_comments_staff') {
      return state.commentRows
    }
    if (table === 'ticket_events') return state.eventRows
    if (table === 'ticket_attachments') return state.attachmentRows
    return state.ticketRows
  }

  const resolveSingle = (table: string): unknown => {
    if (table === 'users') return state.userRows[0] ?? null
    if (table === 'ticket_watchers') return state.watcherRow
    if (table === 'tickets_staff') return state.ticketRows[0] ?? null
    return null
  }

  const makeBuilder = (table: string) => {
    const result = () => ({ data: resolveRows(table), error: state.error })
    const b: Record<string, unknown> = {}
    // Make the builder both chainable (return b) and thenable (Promise-like)
    // so `await supabase.from(...).select(...).eq(...).order(...)` resolves.
    Object.assign(b, {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
      insert: vi.fn(() => b),
      delete: vi.fn(() => b),
      single: vi.fn(async () => ({
        data: null as unknown,
        error: null as { message: string } | null,
      })),
      maybeSingle: vi.fn(async () => ({
        data: resolveSingle(table),
        error: state.error,
      })),
      // Terminal: any awaited builder resolves to the rows for this table.
      then: (
        resolve: (v: { data: unknown[]; error: { message: string } | null }) => void,
      ) => Promise.resolve(result()).then(resolve),
    })
    return b
  }

  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  }

  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: 'https://signed.example.com/file.png' },
          error: null,
        })),
      })),
    },
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test' } },
      })),
    },
  }

  return { mock: { state, supabase, channel } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { user: { id: 'auth-uid-1' } },
    user: { id: 'auth-uid-1', email: 'test@example.com' },
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock the api-client module so promoteTicket can be controlled in gateway tests.
// vitest 4's vi.fn<T>() takes a single function-type argument (not the legacy
// [args, return] tuple form), so type it as the api() signature.
const mockApiFn =
  vi.fn<(method: string, path: string, body?: unknown) => Promise<unknown>>()
vi.mock('@/lib/api-client', () => ({
  api: mockApiFn,
  apiBase: () => '',
  getBearerToken: async () => 'test-token',
  registerSessionExpiredHandler: () => () => {},
}))

import { TicketDetailSheet } from './TicketDetailSheet'
import { toast } from 'sonner'

// ---- helpers ----------------------------------------------------------------

function makeTicket(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 'ticket-test-1234',
    context: 'operations',
    type: 'bug',
    title: 'Login fails on iOS 17',
    body: 'Steps: open app, tap login.',
    status: 'ready',
    priority: 'p1',
    perceived_impact: 'blocking',
    reporter_id: null,
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    created_at: '2026-05-24T10:00:00Z',
    updated_at: '2026-05-24T10:00:00Z',
    ...overrides,
  }
}

function makePublicUser(isStaff = false) {
  return { id: 'user-pub-1', email: 'test@example.com', is_landr_staff: isStaff }
}

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    ...options,
  })
}

beforeEach(() => {
  mock.state.userRows = [makePublicUser(false)]
  mock.state.ticketRows = []
  mock.state.commentRows = []
  mock.state.eventRows = []
  mock.state.attachmentRows = []
  mock.state.watcherRow = null
  mock.state.error = null
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---- Sheet open / close -----------------------------------------------------

describe('TicketDetailSheet', () => {
  it('renders nothing when ticket is null', () => {
    const { container } = render(
      <TicketDetailSheet ticket={null} onOpenChange={() => {}} />,
    )
    expect(container.querySelector('[data-testid="ticket-detail-tab-details"]')).toBeNull()
  })

  it('shows the ticket title when open', async () => {
    render(
      <TicketDetailSheet
        ticket={makeTicket()}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('Login fails on iOS 17')).toBeInTheDocument()
    })
  })

  it('shows the type in the sheet description', async () => {
    render(
      <TicketDetailSheet
        ticket={makeTicket({ type: 'feature' })}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      // The type appears in the SheetDescription. Use getAllByText and confirm
      // at least one match exists.
      expect(screen.getAllByText(/Feature request/).length).toBeGreaterThan(0)
    })
  })

  it('calls onOpenChange(false) when Close button is clicked', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={onOpenChange} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Login fails on iOS 17')).toBeInTheDocument()
    })

    // Click the explicit Close button in the footer (not the Radix X icon)
    const closeBtn = screen.getByTestId('ticket-detail-close-btn')
    await user.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// ---- Details tab ------------------------------------------------------------

describe('TicketDetailSheet — Details tab', () => {
  it('renders the ticket description', async () => {
    render(
      <TicketDetailSheet
        ticket={makeTicket()}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(
        screen.getByText('Steps: open app, tap login.'),
      ).toBeInTheDocument()
    })
  })

  it('shows placeholder when body is null', async () => {
    render(
      <TicketDetailSheet
        ticket={makeTicket({ body: null })}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/No description provided/)).toBeInTheDocument()
    })
  })

  it('shows High priority label', async () => {
    render(
      <TicketDetailSheet
        ticket={makeTicket({ priority: 'p1' })}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument()
    })
  })

  it('does NOT show internal section for non-staff', async () => {
    mock.state.userRows = [makePublicUser(false)]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.queryByText(/Internal \(staff only\)/),
      ).not.toBeInTheDocument()
    })
  })

  it('shows internal section for staff', async () => {
    mock.state.userRows = [makePublicUser(true)]
    // Staff detail query returns severity etc.
    mock.state.ticketRows = [
      {
        ...makeTicket(),
        severity: 'major',
        linked_bd_id: 'landr-abcd',
        promotion_prompt: null,
        promotion_requested_at: null,
        sync_status: 'synced',
        last_synced_at: null,
      },
    ]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByText(/Internal \(staff only\)/)).toBeInTheDocument()
    })
  })
})

// ---- Comments tab -----------------------------------------------------------

describe('TicketDetailSheet — Comments tab', () => {
  it('switches to Comments tab and shows empty state', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-comments'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-comments'))

    await waitFor(() => {
      expect(screen.getByTestId('ticket-comments-empty')).toBeInTheDocument()
    })
  })

  it('shows comment thread when comments are loaded', async () => {
    mock.state.commentRows = [
      {
        id: 'c1',
        ticket_id: 'ticket-test-1234',
        operator_id: 'op-1',
        author_id: null,
        body: 'A public reply',
        is_internal: false,
        created_at: '2026-05-24T11:00:00Z',
        updated_at: '2026-05-24T11:00:00Z',
      },
    ]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-comments'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-comments'))

    await waitFor(() => {
      expect(screen.getByText('A public reply')).toBeInTheDocument()
    })
  })

  it('does NOT show internal toggle for non-staff', async () => {
    mock.state.userRows = [makePublicUser(false)]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-comments'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-comments'))

    await waitFor(() => {
      expect(
        screen.queryByTestId('comment-internal-toggle'),
      ).not.toBeInTheDocument()
    })
  })

  it('shows internal toggle for staff', async () => {
    mock.state.userRows = [makePublicUser(true)]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-comments'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-comments'))

    await waitFor(() => {
      expect(
        screen.getByTestId('comment-internal-toggle'),
      ).toBeInTheDocument()
    })
  })
})

// ---- Timeline tab -----------------------------------------------------------

describe('TicketDetailSheet — Timeline tab', () => {
  it('shows empty state when no events', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-timeline'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-timeline'))

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-timeline-empty'),
      ).toBeInTheDocument()
    })
  })

  it('renders events in the timeline', async () => {
    mock.state.eventRows = [
      {
        id: 'ev1',
        ticket_id: 'ticket-test-1234',
        actor_id: null,
        event_type: 'created',
        payload: {},
        is_internal: false,
        created_at: '2026-05-24T10:00:00Z',
      },
      {
        id: 'ev2',
        ticket_id: 'ticket-test-1234',
        actor_id: 'u1',
        event_type: 'status_changed',
        payload: { from: 'backlog', to: 'ready' },
        is_internal: false,
        created_at: '2026-05-24T10:05:00Z',
      },
    ]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-timeline'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-timeline'))

    await waitFor(() => {
      expect(screen.getByText('Ticket opened')).toBeInTheDocument()
      expect(
        screen.getByText('Status changed from backlog to ready'),
      ).toBeInTheDocument()
    })
  })
})

// ---- Attachments tab --------------------------------------------------------

describe('TicketDetailSheet — Attachments tab', () => {
  it('shows empty state when no attachments', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-attachments'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-attachments'))

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-attachments-empty'),
      ).toBeInTheDocument()
    })
  })

  it('renders upload button', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-detail-tab-attachments'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('ticket-detail-tab-attachments'))

    await waitFor(() => {
      expect(
        screen.getByTestId('attachment-upload-btn'),
      ).toBeInTheDocument()
    })
  })
})

// ---- Watch toggle -----------------------------------------------------------

describe('TicketDetailSheet — Watch toggle', () => {
  it('shows watch toggle when public user is loaded', async () => {
    mock.state.userRows = [makePublicUser(false)]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ticket-watch-toggle')).toBeInTheDocument()
    })
  })
})

// ---- Gateway panel (landr-wwhn.14) ------------------------------------------

function makeStaffTicketRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...makeTicket(),
    severity: null,
    linked_bd_id: null,
    promotion_prompt: null,
    promotion_requested_at: null,
    sync_status: null,
    last_synced_at: null,
    ...overrides,
  }
}

describe('TicketDetailSheet — Gateway panel', () => {
  beforeEach(() => {
    mockApiFn.mockReset()
  })

  it('does NOT show gateway panel for non-staff', async () => {
    mock.state.userRows = [makePublicUser(false)]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.queryByTestId('gateway-panel')).not.toBeInTheDocument()
    })
  })

  it('shows gateway panel for staff', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow()]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('gateway-panel')).toBeInTheDocument()
    })
  })

  it('shows prompt input and submit button when not yet promoted', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow({ linked_bd_id: null })]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('gateway-prompt-input')).toBeInTheDocument()
      expect(screen.getByTestId('gateway-submit-btn')).toBeInTheDocument()
    })
  })

  it('shows already-promoted state when linked_bd_id is set', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow({ linked_bd_id: 'landr-abcd' })]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('gateway-already-promoted')).toBeInTheDocument()
      expect(screen.getByTestId('gateway-already-promoted')).toHaveTextContent(
        'landr-abcd',
      )
    })
    // Prompt input and submit button should not be visible
    expect(screen.queryByTestId('gateway-prompt-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('gateway-submit-btn')).not.toBeInTheDocument()
  })

  it('calls promote endpoint and shows success toast', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow()]
    mockApiFn.mockResolvedValue({
      linked_bd_id: 'landr-new1',
      promotion_requested_at: '2026-05-24T11:00:00Z',
    })

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('gateway-prompt-input')).toBeInTheDocument()
    })

    await user.type(
      screen.getByTestId('gateway-prompt-input'),
      'Fix the login crash on iOS 17',
    )

    const submitBtn = screen.getByTestId('gateway-submit-btn')
    expect(submitBtn).not.toBeDisabled()
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockApiFn).toHaveBeenCalledWith(
        'POST',
        `/api/landr-staff/tickets/ticket-test-1234/promote`,
        { prompt: 'Fix the login crash on iOS 17' },
      )
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('landr-new1'),
      )
    })
  })

  it('disables submit button when prompt is empty', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow()]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('gateway-submit-btn')).toBeDisabled()
    })
  })

  it('shows error toast when promote call fails', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow()]
    mockApiFn.mockRejectedValue(new Error('Not authorized'))

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('gateway-prompt-input')).toBeInTheDocument()
    })

    await user.type(
      screen.getByTestId('gateway-prompt-input'),
      'Fix the login crash',
    )
    await user.click(screen.getByTestId('gateway-submit-btn'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Not authorized'),
      )
    })
  })
})
