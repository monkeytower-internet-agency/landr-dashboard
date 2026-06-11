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
import type { ReactNode } from 'react'

// ---- Fixtures -------------------------------------------------------

type LocationFixture = {
  id: string
  operator_id: string
  parent_id: string | null
  name: string
  role_type_id: string | null
  email: string | null
  created_at: string
  updated_at: string
}

type RoleTypeFixture = {
  id: string
  operator_id: string
  code: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

// ---- API mock (fetch) ------------------------------------------------

const { mock } = vi.hoisted(() => {
  const state = {
    locations: [] as LocationFixture[],
    roleTypes: [] as RoleTypeFixture[],
    fetchError: false,
    lastPost: null as Record<string, unknown> | null,
    lastPatch: null as { id: string; payload: Record<string, unknown> } | null,
    lastDelete: null as string | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/locations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/locations')>()
  return {
    ...actual,
    fetchLocations: vi.fn(async () => {
      if (mock.state.fetchError) throw new Error('fetch failed')
      return mock.state.locations
    }),
    fetchLocationRoleTypes: vi.fn(async () => mock.state.roleTypes),
    createLocation: vi.fn(
      async (_opId: string, body: Record<string, unknown>) => {
        mock.state.lastPost = body
        const newLoc: LocationFixture = {
          id: `loc-${mock.state.locations.length + 1}`,
          operator_id: 'op-1',
          parent_id: (body.parent_id as string | null) ?? null,
          name: body.name as string,
          role_type_id: (body.role_type_id as string | null) ?? null,
          email: (body.email as string | null) ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        mock.state.locations = [...mock.state.locations, newLoc]
        return newLoc
      },
    ),
    updateLocation: vi.fn(
      async (_opId: string, id: string, body: Record<string, unknown>) => {
        mock.state.lastPatch = { id, payload: body }
        const idx = mock.state.locations.findIndex((l) => l.id === id)
        if (idx >= 0) {
          mock.state.locations[idx] = {
            ...mock.state.locations[idx],
            ...body,
          } as LocationFixture
          return mock.state.locations[idx]
        }
        throw new Error('not found')
      },
    ),
    deleteLocation: vi.fn(async (_opId: string, id: string) => {
      mock.state.lastDelete = id
      mock.state.locations = mock.state.locations.filter((l) => l.id !== id)
    }),
  }
})

// ---- Supabase / realtime stub ----------------------------------------

type ChannelHandle = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

const { channel } = vi.hoisted(() => {
  const ch: ChannelHandle = { on: vi.fn(), subscribe: vi.fn() }
  ch.on.mockImplementation(() => ch)
  return { channel: ch }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'tok' } },
      })),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  },
}))

// ---- App providers mock ----------------------------------------------

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

import { PickupLocations } from './PickupLocations'

function makeLocation(overrides: Partial<LocationFixture> = {}): LocationFixture {
  return {
    id: 'loc-1',
    operator_id: 'op-1',
    parent_id: null,
    name: 'Hotel Sol',
    role_type_id: 'rt-hotel',
    email: 'front@hotel-sol.example',
    created_at: '2026-05-18T10:00:00.000Z',
    updated_at: '2026-05-18T10:00:00.000Z',
    ...overrides,
  }
}

function makeRoleType(overrides: Partial<RoleTypeFixture> = {}): RoleTypeFixture {
  return {
    id: 'rt-hotel',
    operator_id: 'op-1',
    code: 'hotel',
    label: 'Hotel',
    sort_order: 0,
    created_at: '2026-05-18T10:00:00.000Z',
    updated_at: '2026-05-18T10:00:00.000Z',
    ...overrides,
  }
}

function render(ui: React.ReactElement) {
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
  mock.state.locations = []
  mock.state.roleTypes = []
  mock.state.fetchError = false
  mock.state.lastPost = null
  mock.state.lastPatch = null
  mock.state.lastDelete = null
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PickupLocations route', () => {
  it('renders location rows fetched from the API', async () => {
    mock.state.locations = [
      makeLocation({ id: 'loc-1', name: 'Hotel Sol', email: 'front@hotel-sol.example' }),
      makeLocation({ id: 'loc-2', name: 'Harbour Point', email: null, role_type_id: null }),
    ]
    mock.state.roleTypes = [makeRoleType()]
    render(<PickupLocations />)

    await screen.findByText('Hotel Sol')
    expect(screen.getByText('Harbour Point')).toBeInTheDocument()
    expect(screen.getByText('front@hotel-sol.example')).toBeInTheDocument()
  })

  it('opens create sheet and submits a new location', async () => {
    mock.state.roleTypes = [makeRoleType()]
    const user = userEvent.setup()
    render(<PickupLocations />)

    await screen.findByRole('button', { name: /add location/i })
    await user.click(screen.getByRole('button', { name: /add location/i }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Name$/i), 'Hotel Sol')
    await user.click(screen.getByRole('button', { name: /^Add location$/i }))

    await waitFor(() => {
      expect(mock.state.lastPost).not.toBeNull()
    })
    expect(mock.state.lastPost).toMatchObject({ name: 'Hotel Sol' })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('opens edit sheet and updates an existing location', async () => {
    // landr-cyoi — hotel rows are read-only in the pickup list (managed under
    // Settings → Hotels). Use a basic (non-hotel) location so the Edit
    // affordance is present.
    mock.state.locations = [
      makeLocation({ name: 'Beach Point', role_type_id: null, email: null }),
    ]
    mock.state.roleTypes = [makeRoleType()]
    const user = userEvent.setup()
    render(<PickupLocations />)

    await screen.findByText('Beach Point')
    await user.click(
      screen.getByRole('button', { name: /Edit — Beach Point/i }),
    )

    const dialog = await screen.findByRole('dialog')
    const nameInput = within(dialog).getByLabelText(/^Name$/i) as HTMLInputElement
    expect(nameInput.value).toBe('Beach Point')

    await user.clear(nameInput)
    await user.type(nameInput, 'Beach Updated')
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mock.state.lastPatch).not.toBeNull()
    })
    expect(mock.state.lastPatch?.payload).toMatchObject({ name: 'Beach Updated' })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('shows error state when fetch fails', async () => {
    mock.state.fetchError = true
    render(<PickupLocations />)

    await screen.findByText(/failed to load locations/i)
  })

  it('deletes a location after confirming the dialog', async () => {
    // landr-cyoi — hotel rows are read-only; use a basic location so the
    // Delete affordance is present.
    mock.state.locations = [
      makeLocation({ name: 'Beach Point', role_type_id: null, email: null }),
    ]
    mock.state.roleTypes = [makeRoleType()]
    const user = userEvent.setup()
    render(<PickupLocations />)

    await screen.findByText('Beach Point')
    await user.click(
      screen.getByRole('button', { name: /Delete — Beach Point/i }),
    )

    const alertDialog = await screen.findByRole('alertdialog')
    await user.click(
      within(alertDialog).getByRole('button', { name: /^Delete$/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastDelete).toBe('loc-1')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('subscribes to realtime updates on locations table', async () => {
    mock.state.locations = [makeLocation()]
    render(<PickupLocations />)

    await screen.findByText('Hotel Sol')
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        table: 'locations',
        filter: 'operator_id=eq.op-1',
      }),
      expect.any(Function),
    )
  })

  // landr-cyoi — the basic pickup-location form no longer carries an email
  // field (email belongs to hotels, managed under Settings → Hotels).
  it('basic location form has no email field', async () => {
    mock.state.roleTypes = [makeRoleType()]
    const user = userEvent.setup()
    render(<PickupLocations />)

    await user.click(
      await screen.findByRole('button', { name: /add location/i }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).queryByLabelText(/contact email/i),
    ).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  // landr-cyoi — 'hotel' is filtered out of the role-type dropdown so a basic
  // pickup location can't be tagged as a hotel from this editor.
  it('role-type dropdown does not include the hotel option', async () => {
    mock.state.roleTypes = [
      makeRoleType({ id: 'rt-hotel', code: 'hotel', label: 'Hotel' }),
      makeRoleType({ id: 'rt-port', code: 'port', label: 'Port' }),
    ]
    const user = userEvent.setup()
    render(<PickupLocations />)

    await user.click(
      await screen.findByRole('button', { name: /add location/i }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).queryByRole('option', { name: 'Hotel' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('option', { name: 'Port' }),
    ).toBeInTheDocument()
  })

  // landr-cyoi — hotel rows surface read-only ("Managed under Hotels") with no
  // Edit/Delete affordance; basic rows keep their Edit/Delete buttons.
  it('renders hotel rows read-only and basic rows editable', async () => {
    mock.state.locations = [
      makeLocation({ id: 'loc-1', name: 'Hotel Sol', role_type_id: 'rt-hotel' }),
      makeLocation({
        id: 'loc-2',
        name: 'Beach Point',
        role_type_id: null,
        email: null,
      }),
    ]
    mock.state.roleTypes = [makeRoleType()]
    render(<PickupLocations />)

    await screen.findByText('Hotel Sol')
    // The hotel row shows the read-only affordance and no Edit/Delete.
    expect(screen.getAllByText(/managed under hotels/i).length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /Edit — Hotel Sol/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Delete — Hotel Sol/i }),
    ).not.toBeInTheDocument()
    // The basic row keeps Edit + Delete.
    expect(
      screen.getByRole('button', { name: /Edit — Beach Point/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Delete — Beach Point/i }),
    ).toBeInTheDocument()
  })
})
