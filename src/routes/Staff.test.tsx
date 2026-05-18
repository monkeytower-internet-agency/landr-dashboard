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

type MembershipFixture = {
  id: string
  operator_id: string
  user_id: string
  contact_id: string | null
  role: string
  permissions: Record<string, unknown> | null
  created_at: string
  updated_at: string
  user: { id: string; email: string | null; is_landr_staff: boolean } | null
}

type UserFixture = {
  id: string
  email: string
}

const { mock } = vi.hoisted(() => {
  const state = {
    memberships: [] as MembershipFixture[],
    membershipsError: null as { message: string } | null,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    deletes: [] as string[],
    users: [] as UserFixture[],
    insertError: null as { message: string } | null,
  }

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation(() => channel)

  function makeBuilder(table: string) {
    type Builder = Record<string, unknown> & {
      _table: string
      _filters: Array<{ col: string; op: string; value: unknown }>
      _updatePayload?: Record<string, unknown>
      _insertPayload?: Record<string, unknown>
      _isDelete?: boolean
      _ilike?: { col: string; value: string }
      then: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
      ) => Promise<unknown>
    }
    const builder = {
      _table: table,
      _filters: [],
      _updatePayload: undefined,
      _insertPayload: undefined,
      _isDelete: false,
    } as unknown as Builder

    Object.assign(builder, {
      select: vi.fn(() => builder),
      insert: vi.fn((payload: Record<string, unknown>) => {
        builder._insertPayload = payload
        state.inserts.push(payload)
        return builder
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        builder._updatePayload = payload
        return builder
      }),
      delete: vi.fn(() => {
        builder._isDelete = true
        return builder
      }),
      eq: vi.fn((col: string, value: unknown) => {
        builder._filters.push({ col, op: 'eq', value })
        return builder
      }),
      ilike: vi.fn((col: string, value: string) => {
        builder._ilike = { col, value }
        return builder
      }),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      // `limit` is used in two ways:
      //   - terminal: `.from(...).select(...).limit(N)` (await fires `then`)
      //   - chainable: `.from(...).select(...).ilike(...).limit(N).maybeSingle()`
      // We return the builder itself; the `then` thenable below handles the
      // terminal case, and `maybeSingle()` handles the chained case.
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === 'users' && builder._ilike) {
          const target = builder._ilike.value.toLowerCase()
          const found = state.users.find(
            (u) => (u.email ?? '').toLowerCase() === target,
          )
          return { data: found ?? null, error: null }
        }
        return { data: null, error: null }
      }),
      single: vi.fn(async () => {
        if (builder._insertPayload && table === 'operator_memberships') {
          if (state.insertError) {
            return { data: null, error: state.insertError }
          }
          const payload = builder._insertPayload
          const newRow: MembershipFixture = {
            id: `m-new-${state.memberships.length + 1}`,
            operator_id: payload.operator_id as string,
            user_id: payload.user_id as string,
            contact_id: null,
            role: payload.role as string,
            permissions:
              (payload.permissions as Record<string, unknown> | null) ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user: {
              id: payload.user_id as string,
              email:
                state.users.find((u) => u.id === payload.user_id)?.email ??
                null,
              is_landr_staff: false,
            },
          }
          state.memberships = [...state.memberships, newRow]
          return { data: newRow, error: null }
        }
        if (builder._updatePayload && table === 'operator_memberships') {
          const idFilter = builder._filters.find(
            (f) => f.col === 'id' && f.op === 'eq',
          )
          const id = idFilter?.value as string
          state.updates.push({ id, payload: builder._updatePayload })
          const idx = state.memberships.findIndex((m) => m.id === id)
          if (idx >= 0) {
            state.memberships[idx] = {
              ...state.memberships[idx],
              ...builder._updatePayload,
            } as MembershipFixture
            return { data: state.memberships[idx], error: null }
          }
          return { data: null, error: null }
        }
        return { data: null, error: null }
      }),
      then(resolve) {
        if (builder._isDelete && table === 'operator_memberships') {
          const idFilter = builder._filters.find(
            (f) => f.col === 'id' && f.op === 'eq',
          )
          const id = idFilter?.value as string
          state.deletes.push(id)
          state.memberships = state.memberships.filter((m) => m.id !== id)
          return Promise.resolve(resolve({ data: null, error: null }))
        }
        if (table === 'operator_memberships' && !builder._isDelete) {
          // Terminal SELECT (used by fetchStaff).
          return Promise.resolve(
            resolve({
              data: state.memberships,
              error: state.membershipsError,
            }),
          )
        }
        return Promise.resolve(resolve({ data: null, error: null }))
      },
    } satisfies Partial<Builder>)
    return builder
  }

  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }
  return { mock: { state, supabase, channel } }
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

import { Staff } from './Staff'

function makeMembership(
  overrides: Partial<MembershipFixture> = {},
): MembershipFixture {
  return {
    id: 'm-1',
    operator_id: 'op-1',
    user_id: 'u-1',
    contact_id: null,
    role: 'admin',
    permissions: null,
    created_at: '2026-05-10T09:00:00.000Z',
    updated_at: '2026-05-10T09:00:00.000Z',
    user: { id: 'u-1', email: 'martin@operator.example', is_landr_staff: false },
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
  mock.state.memberships = []
  mock.state.membershipsError = null
  mock.state.inserts = []
  mock.state.updates = []
  mock.state.deletes = []
  mock.state.users = []
  mock.state.insertError = null
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Staff route', () => {
  it('renders membership rows fetched from supabase', async () => {
    mock.state.memberships = [
      makeMembership({
        id: 'm-1',
        role: 'owner',
        user: {
          id: 'u-1',
          email: 'martin@operator.example',
          is_landr_staff: false,
        },
      }),
      makeMembership({
        id: 'm-2',
        user_id: 'u-2',
        role: 'staff',
        permissions: { manage_bookings: true },
        user: {
          id: 'u-2',
          email: 'alice@operator.example',
          is_landr_staff: false,
        },
      }),
    ]
    render(<Staff />)

    await screen.findByText('martin@operator.example')
    expect(screen.getByText('alice@operator.example')).toBeInTheDocument()
    expect(screen.getByText('owner')).toBeInTheDocument()
    expect(screen.getByText('staff')).toBeInTheDocument()
    // Permissions count summary for the row that has 1 key
    expect(screen.getByText('1 key')).toBeInTheDocument()
  })

  it('invites a new member by email and posts a membership row', async () => {
    mock.state.memberships = [
      makeMembership({
        id: 'm-1',
        role: 'owner',
        user: {
          id: 'u-1',
          email: 'martin@operator.example',
          is_landr_staff: false,
        },
      }),
    ]
    mock.state.users = [{ id: 'u-2', email: 'newbie@operator.example' }]
    const user = userEvent.setup()
    render(<Staff />)

    await screen.findByText('martin@operator.example')

    await user.click(
      screen.getByRole('button', { name: /invite by email/i }),
    )

    // The sheet renders both the email input and a role select; fill them.
    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText(/^Email$/i),
      'newbie@operator.example',
    )
    // Role defaults to 'staff' — leave it. Add a permissions blob.
    await user.type(
      within(dialog).getByLabelText(/permissions/i),
      '{{"manage_bookings":true}',
    )

    await user.click(
      within(dialog).getByRole('button', { name: /add membership/i }),
    )

    await waitFor(() => {
      expect(mock.state.inserts.length).toBe(1)
    })
    expect(mock.state.inserts[0]).toMatchObject({
      operator_id: 'op-1',
      user_id: 'u-2',
      role: 'staff',
      permissions: { manage_bookings: true },
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('errors when invited email has no matching user', async () => {
    mock.state.memberships = [
      makeMembership({
        id: 'm-1',
        role: 'owner',
        user: {
          id: 'u-1',
          email: 'martin@operator.example',
          is_landr_staff: false,
        },
      }),
    ]
    // No users registered → lookup will return null.
    const user = userEvent.setup()
    render(<Staff />)

    await screen.findByText('martin@operator.example')
    await user.click(screen.getByRole('button', { name: /invite by email/i }))

    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText(/^Email$/i),
      'ghost@example.com',
    )
    await user.click(
      within(dialog).getByRole('button', { name: /add membership/i }),
    )

    await waitFor(() => {
      expect(toastCalls.error.length).toBeGreaterThan(0)
    })
    // No insert attempted.
    expect(mock.state.inserts.length).toBe(0)
  })

  it('rejects invalid permissions JSON in the invite sheet', async () => {
    mock.state.memberships = [
      makeMembership({
        id: 'm-1',
        role: 'owner',
        user: {
          id: 'u-1',
          email: 'martin@operator.example',
          is_landr_staff: false,
        },
      }),
    ]
    mock.state.users = [{ id: 'u-2', email: 'newbie@operator.example' }]
    const user = userEvent.setup()
    render(<Staff />)

    await screen.findByText('martin@operator.example')
    await user.click(screen.getByRole('button', { name: /invite by email/i }))

    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText(/^Email$/i),
      'newbie@operator.example',
    )
    await user.type(
      within(dialog).getByLabelText(/permissions/i),
      'not-json',
    )
    await user.click(
      within(dialog).getByRole('button', { name: /add membership/i }),
    )

    await waitFor(() => {
      expect(toastCalls.error.length).toBeGreaterThan(0)
    })
    expect(mock.state.inserts.length).toBe(0)
  })

  it('opens the edit sheet and updates role + permissions', async () => {
    mock.state.memberships = [
      makeMembership({
        id: 'm-1',
        role: 'staff',
        permissions: { manage_bookings: true },
        user: {
          id: 'u-1',
          email: 'alice@operator.example',
          is_landr_staff: false,
        },
      }),
    ]
    const user = userEvent.setup()
    render(<Staff />)

    await screen.findByText('alice@operator.example')
    await user.click(
      screen.getByRole('button', { name: /Edit — alice@operator.example/i }),
    )

    const dialog = await screen.findByRole('dialog')
    // Role select should be present and pre-filled
    const roleSelect = within(dialog).getByLabelText(
      /role/i,
    ) as HTMLSelectElement
    expect(roleSelect.value).toBe('staff')
    await user.selectOptions(roleSelect, 'admin')

    // Permissions textarea should be pre-filled with the JSON blob
    const permsTextarea = within(dialog).getByLabelText(
      /permissions/i,
    ) as HTMLTextAreaElement
    expect(permsTextarea.value).toContain('manage_bookings')

    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mock.state.updates.length).toBe(1)
    })
    expect(mock.state.updates[0]).toMatchObject({
      id: 'm-1',
      payload: expect.objectContaining({ role: 'admin' }),
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('revokes a membership after typing the confirm phrase', async () => {
    mock.state.memberships = [
      makeMembership({
        id: 'm-1',
        role: 'staff',
        user: {
          id: 'u-1',
          email: 'alice@operator.example',
          is_landr_staff: false,
        },
      }),
    ]
    const user = userEvent.setup()
    render(<Staff />)

    await screen.findByText('alice@operator.example')
    await user.click(
      screen.getByRole('button', { name: /Revoke — alice@operator.example/i }),
    )

    const dialog = await screen.findByRole('alertdialog')
    const submit = within(dialog).getByRole('button', {
      name: /revoke access/i,
    })
    expect(submit).toBeDisabled()

    await user.type(
      within(dialog).getByLabelText(/type revoke/i),
      'REVOKE',
    )
    expect(submit).not.toBeDisabled()
    await user.click(submit)

    await waitFor(() => {
      expect(mock.state.deletes).toContain('m-1')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('subscribes to realtime updates on operator_memberships', async () => {
    mock.state.memberships = [
      makeMembership({
        user: {
          id: 'u-1',
          email: 'martin@operator.example',
          is_landr_staff: false,
        },
      }),
    ]
    render(<Staff />)

    await screen.findByText('martin@operator.example')
    expect(mock.supabase.channel).toHaveBeenCalled()
    expect(mock.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        table: 'operator_memberships',
        filter: 'operator_id=eq.op-1',
      }),
      expect.any(Function),
    )
  })

  it('shows an error card when the query fails', async () => {
    mock.state.membershipsError = { message: 'permission denied' }
    render(<Staff />)

    await screen.findByText(/failed to load staff/i)
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
  })
})
