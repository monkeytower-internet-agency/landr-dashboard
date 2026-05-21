/**
 * ProductGroupManager tests — happy-path CRUD coverage for the
 * per-operator `product_groups` editor reached via the pen icon next
 * to the product-form "Product group" select.
 *
 * landr-19m.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type GroupFixture = {
  id: string
  operator_id: string
  slug: string
  name: string
  name_localized: Record<string, string> | null
  description: string | null
  description_localized: Record<string, string> | null
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

const { mock } = vi.hoisted(() => {
  const state = {
    groups: [] as GroupFixture[],
    lastCreate: null as Record<string, unknown> | null,
    lastPatch: null as { id: string; payload: Record<string, unknown> } | null,
    lastDelete: null as string | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/productGroups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/productGroups')>()
  return {
    ...actual,
    fetchProductGroupsFull: vi.fn(async () => mock.state.groups),
    createProductGroup: vi.fn(
      async (_opId: string, body: Record<string, unknown>) => {
        mock.state.lastCreate = body
        const row: GroupFixture = {
          id: `pg-${mock.state.groups.length + 1}`,
          operator_id: 'op-1',
          slug: body.slug as string,
          name: body.name as string,
          name_localized: null,
          description: null,
          description_localized: null,
          sort_order: (body.sort_order as number) ?? 0,
          active: true,
          created_at: '2026-05-21T12:00:00Z',
          updated_at: '2026-05-21T12:00:00Z',
        }
        mock.state.groups = [...mock.state.groups, row]
        return row
      },
    ),
    updateProductGroup: vi.fn(
      async (_opId: string, id: string, body: Record<string, unknown>) => {
        mock.state.lastPatch = { id, payload: body }
        const idx = mock.state.groups.findIndex((g) => g.id === id)
        if (idx >= 0) {
          mock.state.groups[idx] = {
            ...mock.state.groups[idx],
            ...body,
          } as GroupFixture
          return mock.state.groups[idx]
        }
        throw new Error('not found')
      },
    ),
    deleteProductGroup: vi.fn(async (_opId: string, id: string) => {
      mock.state.lastDelete = id
      mock.state.groups = mock.state.groups.filter((g) => g.id !== id)
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

import { ProductGroupManager } from './ProductGroupManager'

function makeGroup(overrides: Partial<GroupFixture> = {}): GroupFixture {
  return {
    id: 'pg-courses',
    operator_id: 'op-1',
    slug: 'courses',
    name: 'Courses',
    name_localized: null,
    description: null,
    description_localized: null,
    sort_order: 10,
    active: true,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
    ...overrides,
  }
}

function renderManager() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProductGroupManager operatorId="op-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mock.state.groups = []
  mock.state.lastCreate = null
  mock.state.lastPatch = null
  mock.state.lastDelete = null
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('<ProductGroupManager>', () => {
  it('shows the empty state when no groups exist', async () => {
    mock.state.groups = []
    renderManager()
    await screen.findByText(/no groups yet/i)
  })

  it('renders existing groups fetched from the API', async () => {
    mock.state.groups = [
      makeGroup(),
      makeGroup({ id: 'pg-specialty', slug: 'specialty', name: 'Specialty' }),
    ]
    renderManager()
    await screen.findByText('Courses')
    expect(screen.getByText('Specialty')).toBeInTheDocument()
  })

  it('creates a new group via the add form (slug auto-derived from name)', async () => {
    const user = userEvent.setup()
    renderManager()

    await screen.findByText(/no groups yet/i)
    const addForm = screen.getByRole('form', { name: /add group/i })
    await user.type(within(addForm).getByLabelText(/^Name$/i), 'Guided Days')
    await user.click(within(addForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastCreate).toMatchObject({
        name: 'Guided Days',
        slug: 'guided-days',
      })
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('renames an existing group via the inline edit form', async () => {
    mock.state.groups = [makeGroup()]
    const user = userEvent.setup()
    renderManager()

    await screen.findByText('Courses')
    await user.click(
      screen.getByRole('button', { name: /Edit group — Courses/i }),
    )

    const editForm = await screen.findByRole('form', { name: /rename group/i })
    const nameInput = within(editForm).getByLabelText(
      /^Name$/i,
    ) as HTMLInputElement
    expect(nameInput.value).toBe('Courses')

    await user.clear(nameInput)
    await user.type(nameInput, 'Liveaboard Courses')
    await user.click(within(editForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastPatch).not.toBeNull()
    })
    expect(mock.state.lastPatch?.payload).toMatchObject({
      name: 'Liveaboard Courses',
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('deletes a group when the trash button is confirmed', async () => {
    mock.state.groups = [makeGroup()]
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    await screen.findByText('Courses')
    await user.click(
      screen.getByRole('button', { name: /Delete group — Courses/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastDelete).toBe('pg-courses')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
    confirmSpy.mockRestore()
  })
})
