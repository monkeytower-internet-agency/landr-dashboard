import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, type ReactElement, type ReactNode } from 'react'

type ChannelHandle = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

type ContactFixture = {
  id: string
  operator_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  preferred_locale: string | null
  preferred_timezone: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  gdpr_erased_at: string | null
  gdpr_erased_by_user_id: string | null
  gdpr_erasure_note: string | null
}

const { mock } = vi.hoisted(() => {
  const state = {
    contacts: [] as ContactFixture[],
    contactsError: null as { message: string } | null,
    rpcError: null as { message: string } | null,
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
    auditRows: [] as Array<Record<string, unknown>>,
  }
  const realtimeHandlers: Array<(payload: Record<string, unknown>) => void> = []

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation((_type, _filter, cb) => {
    realtimeHandlers.push(cb)
    return channel
  })

  const contactsBuilder = () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      // landr-pqk — fetchContacts hits contacts_with_types view with an
      // optional `.overlaps('types', [...])` call when type chips are active.
      overlaps: vi.fn(() => builder),
      limit: vi.fn(async () => ({
        data: state.contacts,
        error: state.contactsError,
      })),
    })
    return builder
  }

  // landr-mk8o — gdprEraseContact() no longer reads from public.users
  // client-side. The RPC resolves auth.uid() → public.users.id server-side,
  // so the users-table builder stub is gone.

  const auditBuilder = () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: state.auditRows, error: null })),
    })
    return builder
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'audit_log') return auditBuilder()
      return contactsBuilder()
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    // landr-uqr2 — api-client.getBearerToken() reads the session before
    // every fetch; provide a stable test token so the bulk-apply tag
    // path can mount without an AuthProvider.
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
    rpc: vi.fn(async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args })
      if (state.rpcError) return { data: null, error: state.rpcError }
      // Simulate the server marking the contact as erased.
      const contactId = (args as { p_contact_id?: string })?.p_contact_id
      if (contactId) {
        for (const c of state.contacts) {
          if (c.id === contactId) {
            c.gdpr_erased_at = '2026-05-18T12:00:00.000Z'
            c.first_name = '[Erased]'
            c.last_name = null
            c.email = null
            c.phone = null
          }
        }
      }
      return { data: null, error: null }
    }),
  }
  return { mock: { state, supabase, channel, realtimeHandlers } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  // landr-f1s — ContactAuditSheet now reads calendar prefs.
  useOperatorCalendarPrefs: () => ({
    workHoursStart: '08:00',
    workHoursEnd: '20:00',
    hour12: false,
  }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'user-1', email: 'staff@operator.example' },
    loading: false,
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

// Capture the latest set of toast calls so we can assert on them.
const { toastCalls } = vi.hoisted(() => ({
  toastCalls: {
    success: [] as string[],
    warning: [] as string[],
    error: [] as string[],
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => {
      toastCalls.success.push(msg)
    }),
    // landr-uqr2 — bulk-apply tags surfaces a partial-failure warning toast.
    warning: vi.fn((msg: string) => {
      toastCalls.warning.push(msg)
    }),
    error: vi.fn((msg: string) => {
      toastCalls.error.push(msg)
    }),
  },
  Toaster: () => null,
}))

// landr-uqr2 — Contacts route now wires bulk-apply tags through the
// FastAPI router. Centralise a fetch stub that handles auth + tag list +
// per-row setContactTags POSTs. Stubbed at module scope so the tests that
// don't exercise bulk-tag are unaffected (fetchSpy.mockReset() in
// beforeEach restores the default unimplemented spy).
const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

import { Contacts } from './Contacts'

function makeContact(overrides: Partial<ContactFixture>): ContactFixture {
  return {
    id: 'c-default',
    operator_id: 'op-1',
    first_name: 'First',
    last_name: 'Last',
    email: 'first.last@example.com',
    phone: null,
    preferred_locale: null,
    preferred_timezone: null,
    created_at: '2026-05-10T09:00:00.000Z',
    updated_at: '2026-05-10T09:00:00.000Z',
    deleted_at: null,
    gdpr_erased_at: null,
    gdpr_erased_by_user_id: null,
    gdpr_erasure_note: null,
    ...overrides,
  }
}

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

// landr-j57l — captures current location so URL-deep-link tests can
// assert filter / sort / search changes push back to the URL. The probe
// is a module-scope object mutated via useEffect (not during render) so
// React strict mode + react-hooks/globals lint stay happy.
const probe = { search: '' }
function LocationProbe() {
  const loc = useLocation()
  useEffect(() => {
    probe.search = loc.search
  }, [loc.search])
  return null
}

beforeEach(() => {
  mock.state.contacts = []
  mock.state.contactsError = null
  mock.state.rpcError = null
  mock.state.rpcCalls = []
  mock.state.auditRows = []
  mock.realtimeHandlers.length = 0
  fetchSpy.mockReset()
  toastCalls.success.length = 0
  toastCalls.warning.length = 0
  toastCalls.error.length = 0
  // landr-j57l — clear per-test localStorage so URL-vs-storage assertions
  // start from a known baseline.
  window.localStorage.clear()
  probe.search = ''
})

afterEach(() => {
  vi.clearAllMocks()
})

function freshSampleContacts(): ContactFixture[] {
  return [
    makeContact({
      id: 'c-1',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@example.com',
      phone: '+34 600 111 222',
    }),
    makeContact({
      id: 'c-2',
      first_name: 'Bob',
      last_name: 'Brown',
      email: 'bob@example.com',
      phone: null,
    }),
    makeContact({
      id: 'c-3',
      first_name: '[Erased]',
      last_name: null,
      email: null,
      phone: null,
      gdpr_erased_at: '2026-05-01T10:00:00.000Z',
    }),
  ]
}

describe('Contacts route', () => {
  it('renders contact rows fetched from supabase', async () => {
    mock.state.contacts = freshSampleContacts()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('+34 600 111 222')).toBeInTheDocument()
    // Erased contact shows the status badge
    expect(screen.getAllByText(/erased/i).length).toBeGreaterThan(0)
  })

  it('filters rows via the global search input', async () => {
    mock.state.contacts = freshSampleContacts()
    const user = userEvent.setup()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    await user.type(screen.getByLabelText(/search contacts/i), 'Bob')

    await waitFor(() =>
      expect(screen.queryByText('Alice Anderson')).not.toBeInTheDocument(),
    )
    // landr-11d5 — the matching substring is wrapped in a yellow <mark>,
    // so 'Bob Brown' is split across nodes. Assert via the <mark> element
    // and walk up to its containing cell to verify the surrounding text.
    const marks = document.querySelectorAll('mark')
    expect(marks.length).toBeGreaterThan(0)
    const bobMark = Array.from(marks).find((m) => m.textContent === 'Bob')
    expect(bobMark).toBeDefined()
    expect(bobMark?.className).toContain('bg-yellow-200/40')
    expect(bobMark?.parentElement?.textContent).toBe('Bob Brown')
  })

  it('subscribes to realtime updates on the contacts table', async () => {
    mock.state.contacts = freshSampleContacts()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    expect(mock.supabase.channel).toHaveBeenCalled()
    expect(mock.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        table: 'contacts',
        filter: 'operator_id=eq.op-1',
      }),
      expect.any(Function),
    )
  })

  it('shows an error card when the query fails', async () => {
    mock.state.contactsError = { message: 'boom' }
    render(<Contacts />)

    await screen.findByText(/failed to load contacts/i)
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })

  // landr-s1mr — friendly empty-state card surfaces when the operator
  // has zero contacts.
  it('renders the shared EmptyState card when there are zero contacts', async () => {
    mock.state.contacts = []
    render(<Contacts />)

    const empty = await screen.findByTestId('contacts-empty-state')
    expect(empty).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /no contacts yet/i }),
    ).toBeInTheDocument()
  })

  // ---- landr-uqr2 — bulk-apply tags -----------------------------------

  it('bulk toolbar is hidden until a contact row is selected', async () => {
    mock.state.contacts = freshSampleContacts()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    expect(
      screen.queryByTestId('contacts-bulk-toolbar'),
    ).not.toBeInTheDocument()
  })

  it('selecting a contact reveals the bulk toolbar with the Apply tag action', async () => {
    mock.state.contacts = freshSampleContacts()
    const user = userEvent.setup()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    await user.click(screen.getByTestId('contacts-select-c-1'))

    expect(screen.getByTestId('contacts-bulk-toolbar')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByTestId('contacts-bulk-toolbar-tag')).toBeInTheDocument()
  })

  it('bulk-apply tag fans setContactTags out per selected contact and toasts on success', async () => {
    mock.state.contacts = freshSampleContacts()
    // landr-uqr2 / fetch-spy-response-mockResolvedValue-footgun — use
    // mockImplementation so each parallel POST gets a fresh Response.
    const tagListBody = JSON.stringify([
      {
        id: 't-vip',
        operator_id: 'op-1',
        name: 'VIP',
        color: '#3b82f6',
        created_at: '2026-05-21T00:00:00Z',
        updated_at: '2026-05-21T00:00:00Z',
      },
    ])
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.endsWith('/tags') && !url.includes('/contacts/')) {
        return new Response(tagListBody, { status: 200 })
      }
      return new Response(JSON.stringify({ tag_ids: ['t-vip'] }), {
        status: 200,
      })
    })

    const user = userEvent.setup()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    await user.click(screen.getByTestId('contacts-select-c-1'))
    await user.click(screen.getByTestId('contacts-select-c-2'))

    await user.click(screen.getByTestId('contacts-bulk-toolbar-tag'))
    await user.click(
      screen.getByTestId('contacts-bulk-toolbar-tag-picker-trigger'),
    )
    await screen.findByTestId(
      'contacts-bulk-toolbar-tag-picker-option-t-vip',
    )
    await user.click(
      screen.getByTestId('contacts-bulk-toolbar-tag-picker-option-t-vip'),
    )
    await user.click(screen.getByTestId('contacts-bulk-toolbar-tag-confirm'))

    // Two POSTs to /contacts/{id}/tags expected (one per selected row).
    await waitFor(() => {
      const setCalls = fetchSpy.mock.calls.filter((c) =>
        String((c as [string])[0]).match(
          /\/api\/staff\/operators\/op-1\/contacts\/[^/]+\/tags$/,
        ),
      )
      expect(setCalls.length).toBe(2)
    })
    await waitFor(() => expect(toastCalls.success).toHaveLength(1))
    expect(toastCalls.success[0]).toMatch(/^Applied 1 tag to 2 rows$/)
  })

  it('triggers the GDPR erase RPC after confirmation', async () => {
    mock.state.contacts = [freshSampleContacts()[0]]
    const user = userEvent.setup()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    // Click the erase action button.
    const eraseBtn = screen.getByRole('button', {
      name: /GDPR erase — Alice Anderson/i,
    })
    await user.click(eraseBtn)

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(/trigger gdpr erase/i),
    ).toBeInTheDocument()

    // The submit button is disabled until confirmation + reason are valid.
    const submit = within(dialog).getByRole('button', {
      name: /erase contact/i,
    })
    expect(submit).toBeDisabled()

    await user.type(
      within(dialog).getByLabelText(/jurisdiction note/i),
      'GDPR Art. 17 — email request 2026-05-18',
    )
    await user.type(within(dialog).getByLabelText(/type erase/i), 'ERASE')

    expect(submit).not.toBeDisabled()
    await user.click(submit)

    await waitFor(() => {
      // landr-mk8o — RPC signature dropped p_requested_by_user_id; the
      // server now resolves auth.uid() → public.users.id internally.
      expect(mock.supabase.rpc).toHaveBeenCalledWith(
        'gdpr_erase_contact',
        expect.objectContaining({
          p_contact_id: 'c-1',
          p_jurisdiction_note: 'GDPR Art. 17 — email request 2026-05-18',
        }),
      )
      const [, args] = (mock.supabase.rpc as ReturnType<typeof vi.fn>).mock
        .calls[0]
      expect(args).not.toHaveProperty('p_requested_by_user_id')
    })

    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('disables the erase button for already-erased contacts', async () => {
    mock.state.contacts = [freshSampleContacts()[2]]
    render(<Contacts />)

    await screen.findByText(/\[Erased\]/i)
    const eraseBtn = screen.getByRole('button', {
      name: /GDPR erase — \[Erased\]/i,
    })
    expect(eraseBtn).toBeDisabled()
  })

  it('surfaces a toast error when the RPC fails', async () => {
    mock.state.contacts = [makeContact({
      id: 'c-err',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@example.com',
    })]
    mock.state.rpcError = { message: 'permission denied' }
    const user = userEvent.setup()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    await user.click(
      screen.getByRole('button', { name: /GDPR erase — Alice Anderson/i }),
    )

    const dialog = await screen.findByRole('alertdialog')
    await user.type(
      within(dialog).getByLabelText(/jurisdiction note/i),
      'reason',
    )
    await user.type(within(dialog).getByLabelText(/type erase/i), 'ERASE')
    await user.click(within(dialog).getByRole('button', { name: /erase contact/i }))

    await waitFor(() => {
      expect(toastCalls.error.length).toBeGreaterThan(0)
    })
  })

  it('opens the audit log sheet for a contact', async () => {
    mock.state.contacts = [makeContact({
      id: 'c-1',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@example.com',
    })]
    mock.state.auditRows = [
      {
        id: 'a-1',
        occurred_at: '2026-05-15T10:00:00.000Z',
        table_name: 'contacts',
        row_id: 'c-1',
        operation: 'UPDATE',
        actor_kind: 'user',
        actor_subkind: null,
        user_id: 'user-1',
      },
    ]
    const user = userEvent.setup()
    render(<Contacts />)

    await screen.findByText('Alice Anderson')
    await user.click(
      screen.getByRole('button', { name: /Audit log — Alice Anderson/i }),
    )

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/audit log/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(within(dialog).getByText('UPDATE')).toBeInTheDocument(),
    )
  })

  // ---- landr-j57l — URL ⇄ filter round-trip ---------------------------

  describe('URL deep-linking (landr-j57l)', () => {
    function renderWithProbe(initialEntry: string) {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      return rtlRender(<Contacts />, {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[initialEntry]}>
              {children}
              <LocationProbe />
            </MemoryRouter>
          </QueryClientProvider>
        ),
      })
    }

    it('mount with ?type= preselects the type chip', async () => {
      mock.state.contacts = freshSampleContacts()
      renderWithProbe('/?type=customer')

      await screen.findByText('Alice Anderson')
      const chip = screen.getByTestId('contacts-filters-type-customer')
      expect(chip).toHaveAttribute('aria-pressed', 'true')
    })

    it('mount with ?q= deep-links the search input', async () => {
      mock.state.contacts = freshSampleContacts()
      renderWithProbe('/?q=Bob')

      // The search input shows the URL-derived value on first paint.
      await waitFor(() =>
        expect(screen.getByLabelText(/search contacts/i)).toHaveValue('Bob'),
      )
      // 'Bob' is wrapped in <mark> when the search matches, so the text
      // is split across nodes — assert via the <mark> instead of a plain
      // findByText('Bob Brown') match.
      await waitFor(() => {
        const bobMark = Array.from(document.querySelectorAll('mark')).find(
          (m) => m.textContent === 'Bob',
        )
        expect(bobMark).toBeDefined()
        expect(bobMark?.parentElement?.textContent).toBe('Bob Brown')
      })
      // Alice is filtered out by the global search.
      expect(screen.queryByText('Alice Anderson')).not.toBeInTheDocument()
    })

    it('mount with ?sort= preselects the sort dropdown', async () => {
      mock.state.contacts = freshSampleContacts()
      renderWithProbe('/?sort=name_asc')

      await screen.findByText('Alice Anderson')
      expect(
        (screen.getByTestId('contacts-filters-sort-select') as HTMLSelectElement)
          .value,
      ).toBe('name_asc')
    })

    it('mount with ?erased=1 flips the include-erased toggle on', async () => {
      mock.state.contacts = freshSampleContacts()
      renderWithProbe('/?erased=1')

      await screen.findByText('Alice Anderson')
      expect(screen.getByTestId('contacts-filters-show-erased')).toBeChecked()
    })

    it('mount URL params win over stored localStorage selection', async () => {
      // Pre-seed localStorage with a DIFFERENT type selection…
      window.localStorage.setItem(
        'landr.dashboard.contactsFilters.user-1',
        JSON.stringify({ types: ['employee'], includeErased: false }),
      )
      window.localStorage.setItem(
        'landr.dashboard.contactsSort.user-1',
        'created_at_desc',
      )
      mock.state.contacts = freshSampleContacts()
      // …mount with a URL pointing at a different selection.
      renderWithProbe('/?type=customer&sort=name_asc')

      await screen.findByText('Alice Anderson')
      expect(
        screen.getByTestId('contacts-filters-type-customer'),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(
        screen.getByTestId('contacts-filters-type-employee'),
      ).toHaveAttribute('aria-pressed', 'false')
      expect(
        (screen.getByTestId('contacts-filters-sort-select') as HTMLSelectElement)
          .value,
      ).toBe('name_asc')
    })

    it('clicking a type chip pushes ?type= to the URL', async () => {
      // The chip is disabled when type count is 0 (CountedFilterChip
      // gates clicks on count > 0). Inject a `types` field on the fixture
      // so the parallel contact-type-counts query reports `customer: >0`
      // and the chip is clickable.
      mock.state.contacts = freshSampleContacts().map((c) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ ...c, types: ['customer'] }) as any,
      )
      const user = userEvent.setup()
      renderWithProbe('/')

      await screen.findByText('Alice Anderson')
      // Wait for the count to land so the chip is enabled.
      await waitFor(() => {
        const chip = screen.getByTestId('contacts-filters-type-customer')
        expect(chip).not.toBeDisabled()
      })
      await user.click(screen.getByTestId('contacts-filters-type-customer'))
      await waitFor(() => expect(probe.search).toContain('type=customer'))
    })

    it('changing the sort dropdown pushes ?sort= to the URL', async () => {
      mock.state.contacts = freshSampleContacts()
      const user = userEvent.setup()
      renderWithProbe('/')

      await screen.findByText('Alice Anderson')
      await user.selectOptions(
        screen.getByTestId('contacts-filters-sort-select'),
        'name_asc',
      )
      await waitFor(() => expect(probe.search).toContain('sort=name_asc'))
    })

    it('typing in the search input pushes ?q= to the URL', async () => {
      mock.state.contacts = freshSampleContacts()
      const user = userEvent.setup()
      renderWithProbe('/')

      await screen.findByText('Alice Anderson')
      await user.type(screen.getByLabelText(/search contacts/i), 'Bob')
      await waitFor(() => expect(probe.search).toContain('q=Bob'))
    })
  })
})
