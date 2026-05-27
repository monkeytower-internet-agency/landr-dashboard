/**
 * LocationRoleTypeManager tests — happy-path CRUD coverage for the
 * per-operator `location_role_types` editor reached via the pen icon
 * next to the pickup-location "Type" select.
 *
 * landr-ogf.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RoleTypeFixture = {
  id: string
  operator_id: string
  code: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

const { mock } = vi.hoisted(() => {
  const state = {
    roleTypes: [] as RoleTypeFixture[],
    lastCreate: null as Record<string, unknown> | null,
    lastPatch: null as { id: string; payload: Record<string, unknown> } | null,
    lastDelete: null as string | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/locations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/locations')>()
  return {
    ...actual,
    fetchLocationRoleTypes: vi.fn(async () => mock.state.roleTypes),
    createLocationRoleType: vi.fn(
      async (_opId: string, body: Record<string, unknown>) => {
        mock.state.lastCreate = body
        const row: RoleTypeFixture = {
          id: `rt-${mock.state.roleTypes.length + 1}`,
          operator_id: 'op-1',
          code: body.code as string,
          label: body.label as string,
          sort_order: (body.sort_order as number) ?? 0,
          created_at: '2026-05-19T12:00:00Z',
          updated_at: '2026-05-19T12:00:00Z',
        }
        mock.state.roleTypes = [...mock.state.roleTypes, row]
        return row
      },
    ),
    updateLocationRoleType: vi.fn(
      async (_opId: string, id: string, body: Record<string, unknown>) => {
        mock.state.lastPatch = { id, payload: body }
        const idx = mock.state.roleTypes.findIndex((r) => r.id === id)
        if (idx >= 0) {
          mock.state.roleTypes[idx] = {
            ...mock.state.roleTypes[idx],
            ...body,
          } as RoleTypeFixture
          return mock.state.roleTypes[idx]
        }
        throw new Error('not found')
      },
    ),
    deleteLocationRoleType: vi.fn(async (_opId: string, id: string) => {
      mock.state.lastDelete = id
      mock.state.roleTypes = mock.state.roleTypes.filter((r) => r.id !== id)
    }),
  }
})

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

import { LocationRoleTypeManager } from './LocationRoleTypeManager'

function makeRoleType(overrides: Partial<RoleTypeFixture> = {}): RoleTypeFixture {
  return {
    id: 'rt-hotel',
    operator_id: 'op-1',
    code: 'hotel',
    label: 'Hotel',
    sort_order: 10,
    created_at: '2026-05-18T10:00:00Z',
    updated_at: '2026-05-18T10:00:00Z',
    ...overrides,
  }
}

function renderManager() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <LocationRoleTypeManager operatorId="op-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mock.state.roleTypes = []
  mock.state.lastCreate = null
  mock.state.lastPatch = null
  mock.state.lastDelete = null
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('<LocationRoleTypeManager>', () => {
  it('lists existing role types and shows the empty state when none exist', async () => {
    mock.state.roleTypes = []
    renderManager()
    await screen.findByText(/no types yet/i)
  })

  it('renders existing role types fetched from the API', async () => {
    mock.state.roleTypes = [
      makeRoleType(),
      makeRoleType({ id: 'rt-port', code: 'port', label: 'Port' }),
    ]
    renderManager()
    await screen.findByText('Hotel')
    expect(screen.getByText('Port')).toBeInTheDocument()
  })

  it('creates a new role type via the add form', async () => {
    const user = userEvent.setup()
    renderManager()

    await screen.findByText(/no types yet/i)
    await user.type(screen.getByLabelText(/^Code$/i), 'port')
    await user.type(screen.getByLabelText(/^Label$/i), 'Port')

    const addForm = screen.getByRole('form', { name: /add type/i })
    await user.click(within(addForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastCreate).toMatchObject({
        code: 'port',
        label: 'Port',
      })
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('renames an existing role type via the edit form', async () => {
    mock.state.roleTypes = [makeRoleType()]
    const user = userEvent.setup()
    renderManager()

    await screen.findByText('Hotel')
    await user.click(
      screen.getByRole('button', { name: /Edit type — Hotel/i }),
    )

    const editForm = await screen.findByRole('form', { name: /rename type/i })
    const labelInput = within(editForm).getByLabelText(
      /^Label$/i,
    ) as HTMLInputElement
    expect(labelInput.value).toBe('Hotel')

    await user.clear(labelInput)
    await user.type(labelInput, 'Hotel Lobby')
    await user.click(within(editForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastPatch).not.toBeNull()
    })
    expect(mock.state.lastPatch?.payload).toMatchObject({ label: 'Hotel Lobby' })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('deletes a role type when the trash button is clicked', async () => {
    mock.state.roleTypes = [makeRoleType()]
    const user = userEvent.setup()
    renderManager()

    await screen.findByText('Hotel')
    await user.click(
      screen.getByRole('button', { name: /Delete type — Hotel/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastDelete).toBe('rt-hotel')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })
})
