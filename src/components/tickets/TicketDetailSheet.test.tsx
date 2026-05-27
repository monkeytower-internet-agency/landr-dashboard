// landr-wwhn.13 — TicketDetailSheet component tests.
// landr-wwhn.14 — Gateway UI tests.
// landr-wwhn.32 — Rework: header who-to-contact, Comments first, read-only
//                 Details, staff actions extracted to TicketTriageCard.
//
// Covers:
//   - Sheet opens and shows ticket title + type
//   - Header: operator org name + reporter email displayed
//   - Tab order: Comments tab is first (primary), Details tab is second
//   - Details tab: core fields, status, description — view-only
//   - Details tab: operator sees read-only assignee display
//   - Staff-only internal section gated on is_landr_staff
//   - Comments tab: shows comment list + compose area (default tab)
//   - Comments tab: internal toggle only shown for staff
//   - Timeline tab: shows events list
//   - Attachments tab: empty state
//   - Watch toggle renders
//   - Close button fires onOpenChange(false)
//   - TicketTriageCard: hidden for non-staff (no assignee picker in sheet)
//   - TicketTriageCard: visible for staff — assignee picker + gateway panel
//   - TicketTriageCard — gateway: shows prompt input + submit button
//   - TicketTriageCard — gateway: shows already-promoted state
//   - TicketTriageCard — gateway: calls promote endpoint and toasts on success
//   - TicketTriageCard — gateway: toasts error on promote failure

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
    // landr-wwhn.16 — notification preference rows
    notifPrefsRow: null as unknown,
    ticketNotifySettingsRow: null as unknown,
    // landr-wwhn.32 — operator + reporter rows for the header
    operatorRow: null as unknown,
    reporterRow: null as unknown,
    error: null as { message: string } | null,
  }

  const resolveRows = (table: string): unknown[] => {
    if (table === 'ticket_comments' || table === 'ticket_comments_staff') {
      return state.commentRows
    }
    if (table === 'ticket_events') return state.eventRows
    if (table === 'ticket_attachments') return state.attachmentRows
    if (table === 'assignable_users') return []
    return state.ticketRows
  }

  const resolveSingle = (table: string): unknown => {
    if (table === 'users') return state.userRows[0] ?? null
    if (table === 'ticket_watchers') return state.watcherRow
    if (table === 'tickets_staff') return state.ticketRows[0] ?? null
    // landr-wwhn.16 — notification preference tables
    if (table === 'notification_preferences') return state.notifPrefsRow
    if (table === 'ticket_notify_settings') return state.ticketNotifySettingsRow
    // landr-wwhn.32 — operator + reporter header fetches
    if (table === 'operators') return state.operatorRow
    return null
  }

  const makeBuilder = (table: string) => {
    // For users table we need to differentiate between the current-user fetch
    // (by supabase_auth_id) and the reporter fetch (by id). We use a simple
    // flag approach: the first .eq() call will store the column name so
    // resolveSingle can pick the right row.
    let eqColumn = ''
    const result = () => ({ data: resolveRows(table), error: state.error })
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: vi.fn(() => b),
      eq: vi.fn((_col: string) => {
        eqColumn = _col
        return b
      }),
      order: vi.fn(() => b),
      limit: vi.fn(() => b),
      insert: vi.fn(() => b),
      delete: vi.fn(() => b),
      upsert: vi.fn(() => b),
      ilike: vi.fn(() => b),
      or: vi.fn(() => b),
      single: vi.fn(async () => ({
        data: null as unknown,
        error: null as { message: string } | null,
      })),
      maybeSingle: vi.fn(async () => {
        if (table === 'users') {
          // If querying by id (reporter fetch), return the reporter row;
          // otherwise return the current public user (supabase_auth_id).
          if (eqColumn === 'id') {
            return { data: state.reporterRow, error: state.error }
          }
          return { data: state.userRows[0] ?? null, error: state.error }
        }
        return { data: resolveSingle(table), error: state.error }
      }),
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
    reporter_id: 'reporter-user-1',
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    created_at: '2026-05-24T10:00:00Z',
    updated_at: '2026-05-24T10:00:00Z',
    ...overrides,
  }
}

function makePublicUser(isStaff = false) {
  return { id: 'user-pub-1', email: 'test@example.com', is_landr_staff: isStaff }
}

function makeOperatorRow() {
  return { id: 'op-1', name: 'Acme Adventures', slug: 'acme-adventures' }
}

function makeReporterRow() {
  return { id: 'reporter-user-1', email: 'reporter@acme.com' }
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
  mock.state.notifPrefsRow = null
  mock.state.ticketNotifySettingsRow = null
  mock.state.operatorRow = makeOperatorRow()
  mock.state.reporterRow = makeReporterRow()
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

// ---- Header: who-to-contact (landr-wwhn.32) ---------------------------------

describe('TicketDetailSheet — Header', () => {
  it('shows the operator org name in the header', async () => {
    mock.state.operatorRow = makeOperatorRow()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('ticket-header-operator')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-header-operator')).toHaveTextContent(
        'Acme Adventures',
      )
    })
  })

  it('shows fallback when operator name is missing', async () => {
    mock.state.operatorRow = { id: 'op-1', name: null, slug: 'acme' }
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('ticket-header-operator')).toHaveTextContent(
        'Unknown org',
      )
    })
  })

  it('shows the reporter email in the header when reporter_id is set', async () => {
    mock.state.reporterRow = makeReporterRow()
    render(
      <TicketDetailSheet ticket={makeTicket({ reporter_id: 'reporter-user-1' })} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('ticket-header-reporter')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-header-reporter')).toHaveTextContent(
        'reporter@acme.com',
      )
    })
  })

  it('omits the reporter section when reporter_id is null', async () => {
    render(
      <TicketDetailSheet
        ticket={makeTicket({ reporter_id: null })}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('Login fails on iOS 17')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('ticket-header-reporter')).not.toBeInTheDocument()
  })
})

// ---- Tab order (landr-wwhn.32): Comments first ------------------------------

describe('TicketDetailSheet — Tab order', () => {
  it('opens on the Comments tab by default', async () => {
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      // The comment compose area (part of CommentsPanel) should be immediately visible
      expect(screen.getByTestId('comment-body-input')).toBeInTheDocument()
    })
  })

  it('all four tabs are present: Comments, Details, Timeline, Attachments', async () => {
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('ticket-detail-tab-comments')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-detail-tab-details')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-detail-tab-timeline')).toBeInTheDocument()
      expect(screen.getByTestId('ticket-detail-tab-attachments')).toBeInTheDocument()
    })
  })
})

// ---- Details tab (view-only) ------------------------------------------------

describe('TicketDetailSheet — Details tab', () => {
  it('renders the ticket description', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet
        ticket={makeTicket()}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(
        screen.getByText('Steps: open app, tap login.'),
      ).toBeInTheDocument()
    })
  })

  it('shows placeholder when body is null', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet
        ticket={makeTicket({ body: null })}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByText(/No description provided/)).toBeInTheDocument()
    })
  })

  it('shows High priority label', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet
        ticket={makeTicket({ priority: 'p1' })}
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument()
    })
  })

  it('does NOT show internal section for non-staff', async () => {
    mock.state.userRows = [makePublicUser(false)]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
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
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByText(/Internal \(staff only\)/)).toBeInTheDocument()
    })
  })

  it('shows read-only unassigned text for non-staff operator', async () => {
    mock.state.userRows = [makePublicUser(false)]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket({ assignee_id: null })} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByTestId('assignee-unassigned')).toBeInTheDocument()
    })
  })
})

// ---- Comments tab (now default) ---------------------------------------------

describe('TicketDetailSheet — Comments tab', () => {
  it('shows empty state immediately (default tab)', async () => {
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
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
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByText('A public reply')).toBeInTheDocument()
    })
  })

  it('does NOT show internal toggle for non-staff', async () => {
    mock.state.userRows = [makePublicUser(false)]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('comment-body-input')).toBeInTheDocument()
    })
    expect(
      screen.queryByTestId('comment-internal-toggle'),
    ).not.toBeInTheDocument()
  })

  it('shows internal toggle for staff on comments tab', async () => {
    mock.state.userRows = [makePublicUser(true)]
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByTestId('comment-internal-toggle'),
      ).toBeInTheDocument()
    })
  })

  it('navigating to Comments tab from another tab still shows compose area', async () => {
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    // Switch away then back
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-comments'))
    await waitFor(() => {
      expect(screen.getByTestId('comment-body-input')).toBeInTheDocument()
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

  it('shows "Watch" label when user is not watching (no watcher row)', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.watcherRow = null
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      // Button should show "Watch" (not "Watching") when not subscribed
      const btn = screen.getByTestId('ticket-watch-toggle')
      expect(btn).toHaveTextContent('Watch')
    })
  })

  it('shows "Watching" label when user already has a watcher row', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.watcherRow = {
      ticket_id: 'ticket-test-1234',
      user_id: 'user-pub-1',
      created_at: '2026-05-24T10:00:00Z',
    }
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      const btn = screen.getByTestId('ticket-watch-toggle')
      expect(btn).toHaveTextContent('Watching')
    })
  })

  it('calls watchTicket and shows success toast when user watches a ticket', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.watcherRow = null
    mock.state.error = null

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ticket-watch-toggle')).toBeInTheDocument()
    })

    // Wait until the toggle is no longer pending (watchQuery resolved)
    await waitFor(() => {
      expect(screen.getByTestId('ticket-watch-toggle')).not.toBeDisabled()
    })

    await user.click(screen.getByTestId('ticket-watch-toggle'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Watching this ticket')
    })
  })

  it('calls unwatchTicket and shows success toast when user unwatches a ticket', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.watcherRow = {
      ticket_id: 'ticket-test-1234',
      user_id: 'user-pub-1',
      created_at: '2026-05-24T10:00:00Z',
    }
    mock.state.error = null

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('ticket-watch-toggle')).not.toBeDisabled()
    })

    await user.click(screen.getByTestId('ticket-watch-toggle'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Stopped watching')
    })
  })
})

// ---- Notify override panel (landr-wwhn.16) ----------------------------------

describe('TicketDetailSheet — Notification override panel', () => {
  it('shows the notify override panel in the details tab when user is loaded', async () => {
    mock.state.userRows = [makePublicUser(false)]
    // No override row → follows global
    mock.state.ticketNotifySettingsRow = null
    mock.state.notifPrefsRow = null

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      expect(
        screen.getByTestId('notify-override-panel'),
      ).toBeInTheDocument()
    })
  })

  it('shows "Following your global default" badge when no override exists', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.ticketNotifySettingsRow = null
    mock.state.notifPrefsRow = null

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      expect(
        screen.getByTestId('notify-override-badge-following'),
      ).toBeInTheDocument()
    })
  })

  it('shows "Custom for this ticket" badge when an override exists', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.ticketNotifySettingsRow = {
      ticket_id: 'ticket-test-1234',
      user_id: 'user-pub-1',
      bell: false,
      email: null,
      push: null,
      delivery_mode: null,
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
    }
    mock.state.notifPrefsRow = null

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      expect(
        screen.getByTestId('notify-override-badge-custom'),
      ).toBeInTheDocument()
    })
  })

  it('shows "Reset to global default" button when an override is active', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.ticketNotifySettingsRow = {
      ticket_id: 'ticket-test-1234',
      user_id: 'user-pub-1',
      bell: false,
      email: null,
      push: null,
      delivery_mode: null,
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
    }

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      expect(
        screen.getByTestId('notify-override-clear'),
      ).toBeInTheDocument()
    })
  })

  it('does not show clear button when no override is active', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.ticketNotifySettingsRow = null

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      // Panel must be rendered first
      expect(screen.getByTestId('notify-override-panel')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('notify-override-clear')).not.toBeInTheDocument()
  })

  it('shows all three channel toggle switches', async () => {
    mock.state.userRows = [makePublicUser(false)]
    mock.state.ticketNotifySettingsRow = null
    mock.state.notifPrefsRow = null

    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      expect(screen.getByTestId('notify-override-bell')).toBeInTheDocument()
      expect(screen.getByTestId('notify-override-email')).toBeInTheDocument()
      expect(screen.getByTestId('notify-override-push')).toBeInTheDocument()
    })
  })
})

// ---- TicketTriageCard — staff actions (landr-wwhn.32) -------------------------

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

describe('TicketDetailSheet — Triage card (staff actions)', () => {
  beforeEach(() => {
    mockApiFn.mockReset()
  })

  it('does NOT show triage card (assignee picker) for non-staff', async () => {
    mock.state.userRows = [makePublicUser(false)]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.queryByTestId('triage-card')).not.toBeInTheDocument()
      expect(screen.queryByTestId('triage-assignee-picker')).not.toBeInTheDocument()
      expect(screen.queryByTestId('triage-gateway-panel')).not.toBeInTheDocument()
    })
  })

  it('shows triage card for staff in the details tab', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow()]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByTestId('triage-card')).toBeInTheDocument()
    })
  })

  it('shows assignee picker in triage card for staff', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow()]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByTestId('triage-assignee-picker')).toBeInTheDocument()
    })
  })

  it('shows gateway prompt input and submit button when not yet promoted', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow({ linked_bd_id: null })]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByTestId('triage-gateway-prompt-input')).toBeInTheDocument()
      expect(screen.getByTestId('triage-gateway-submit-btn')).toBeInTheDocument()
    })
  })

  it('shows already-promoted state when linked_bd_id is set', async () => {
    mock.state.userRows = [makePublicUser(true)]
    mock.state.ticketRows = [makeStaffTicketRow({ linked_bd_id: 'landr-abcd' })]
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByTestId('triage-gateway-already-promoted')).toBeInTheDocument()
      expect(screen.getByTestId('triage-gateway-already-promoted')).toHaveTextContent(
        'landr-abcd',
      )
    })
    // Prompt input and submit button should not be visible
    expect(screen.queryByTestId('triage-gateway-prompt-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('triage-gateway-submit-btn')).not.toBeInTheDocument()
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
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      expect(screen.getByTestId('triage-gateway-prompt-input')).toBeInTheDocument()
    })

    await user.type(
      screen.getByTestId('triage-gateway-prompt-input'),
      'Fix the login crash on iOS 17',
    )

    const submitBtn = screen.getByTestId('triage-gateway-submit-btn')
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
    const user = userEvent.setup()
    render(
      <TicketDetailSheet ticket={makeTicket()} onOpenChange={() => {}} />,
    )
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))
    await waitFor(() => {
      expect(screen.getByTestId('triage-gateway-submit-btn')).toBeDisabled()
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
    await waitFor(() => screen.getByTestId('ticket-detail-tab-details'))
    await user.click(screen.getByTestId('ticket-detail-tab-details'))

    await waitFor(() => {
      expect(screen.getByTestId('triage-gateway-prompt-input')).toBeInTheDocument()
    })

    await user.type(
      screen.getByTestId('triage-gateway-prompt-input'),
      'Fix the login crash',
    )
    await user.click(screen.getByTestId('triage-gateway-submit-btn'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Not authorized'),
      )
    })
  })
})
