import {
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

  // landr-39nw — gdprEraseContact() resolves auth.uid → public.users.id via
  // `.from('users').select('id').eq('supabase_auth_id', uid).maybeSingle()`
  // before calling the rpc. Without a terminal maybeSingle() the chain
  // throws and the rpc is never reached. We return `id: 'user-1'` so the
  // bridged id matches the auth.uid stubbed by the useAuth() mock above —
  // existing rpc assertions check `p_requested_by_user_id: 'user-1'`.
  const usersBuilder = () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'user-1' },
        error: null,
      })),
    })
    return builder
  }

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
      if (table === 'users') return usersBuilder()
      return contactsBuilder()
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
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
  toastCalls: { success: [] as string[], error: [] as string[] },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => {
      toastCalls.success.push(msg)
    }),
    error: vi.fn((msg: string) => {
      toastCalls.error.push(msg)
    }),
  },
  Toaster: () => null,
}))

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

beforeEach(() => {
  mock.state.contacts = []
  mock.state.contactsError = null
  mock.state.rpcError = null
  mock.state.rpcCalls = []
  mock.state.auditRows = []
  mock.realtimeHandlers.length = 0
  toastCalls.success.length = 0
  toastCalls.error.length = 0
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
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
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
      expect(mock.supabase.rpc).toHaveBeenCalledWith(
        'gdpr_erase_contact',
        expect.objectContaining({
          p_contact_id: 'c-1',
          p_requested_by_user_id: 'user-1',
          p_jurisdiction_note: 'GDPR Art. 17 — email request 2026-05-18',
        }),
      )
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
})
