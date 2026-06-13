import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

// ---------------------------------------------------------------------------
// Mocks. The Trash route reads operator from useOperator(), pulls rows via
// lib/trash.fetchTrash(), and restores via lib/trash.restoreTrashRow().
// We mock both surfaces so the route renders in isolation.
// ---------------------------------------------------------------------------

const { mock } = vi.hoisted(() => {
  const state = {
    rowsByKind: {} as Record<string, unknown[]>,
    restoreCalls: [] as Array<{ kind: string; rowId: string }>,
    restoreShouldThrow: null as Error | null,
    fetchCalls: [] as Array<{ kind: string; operatorId: string }>,
  }
  return { mock: { state } }
})

vi.mock('@/lib/trash', async () => {
  const actual = await vi.importActual<typeof import('@/lib/trash')>(
    '@/lib/trash',
  )
  return {
    ...actual,
    fetchTrash: vi.fn(async (operatorId: string, kind: string) => {
      mock.state.fetchCalls.push({ kind, operatorId })
      return mock.state.rowsByKind[kind] ?? []
    }),
    restoreTrashRow: vi.fn(async (_op: string, kind: string, rowId: string) => {
      mock.state.restoreCalls.push({ kind, rowId })
      if (mock.state.restoreShouldThrow) throw mock.state.restoreShouldThrow
      return { id: rowId, deleted_at: null }
    }),
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
    refreshOperators: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: {
    success: [] as unknown[],
    error: [] as unknown[],
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: unknown) => {
      toastCalls.success.push(msg)
    }),
    error: vi.fn((msg: unknown) => {
      toastCalls.error.push(msg)
    }),
  },
  Toaster: () => null,
}))

import { Trash } from './Trash'

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
  mock.state.rowsByKind = {}
  mock.state.restoreCalls = []
  mock.state.restoreShouldThrow = null
  mock.state.fetchCalls = []
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Trash route', () => {
  it('renders all five category tabs', async () => {
    render(<Trash />)

    // Tabs use radix role="tab"; assert each is present by label.
    expect(
      screen.getByRole('tab', { name: 'Bookings' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Contacts' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Products' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tags' })).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Pricing schemes' }),
    ).toBeInTheDocument()
  })

  it('fetches the active category (bookings by default)', async () => {
    mock.state.rowsByKind['bookings'] = [
      {
        id: 'b-1',
        deleted_at: '2026-05-20T10:00:00.000Z',
        created_at: '2026-05-10T10:00:00.000Z',
        currency: 'EUR',
        gross_total: 300,
        customer: {
          id: 'c-1',
          first_name: 'Carol',
          last_name: 'Chen',
          email: 'c@example.com',
        },
      },
    ]

    render(<Trash />)

    await waitFor(() => {
      expect(screen.getByText('Carol Chen')).toBeInTheDocument()
    })
    expect(mock.state.fetchCalls).toContainEqual({
      operatorId: 'op-1',
      kind: 'bookings',
    })
  })

  it('shows the empty state when a category has no soft-deleted rows', async () => {
    render(<Trash />)
    await waitFor(() => {
      expect(
        screen.getByText('Nothing in the bin here.'),
      ).toBeInTheDocument()
    })
  })

  it('switching tabs fetches the new category', async () => {
    mock.state.rowsByKind['contacts'] = [
      {
        id: 'c-1',
        deleted_at: '2026-05-20T10:00:00.000Z',
        first_name: 'Carol',
        last_name: 'Chen',
        email: 'c@example.com',
        phone: null,
      },
    ]

    render(<Trash />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Contacts' }))

    await waitFor(() => {
      expect(mock.state.fetchCalls.some((c) => c.kind === 'contacts')).toBe(
        true,
      )
    })
    expect(await screen.findByText('Carol Chen')).toBeInTheDocument()
  })

  it('clicking Restore calls restoreTrashRow + removes the row + toasts', async () => {
    mock.state.rowsByKind['contacts'] = [
      {
        id: 'c-1',
        deleted_at: '2026-05-20T10:00:00.000Z',
        first_name: 'Carol',
        last_name: 'Chen',
        email: 'c@example.com',
        phone: null,
      },
    ]

    render(<Trash />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Contacts' }))

    const restoreBtn = await screen.findByRole('button', {
      name: 'Restore Carol Chen',
    })
    await user.click(restoreBtn)

    await waitFor(() => {
      expect(mock.state.restoreCalls).toEqual([
        { kind: 'contacts', rowId: 'c-1' },
      ])
    })

    // Row drops out of the table after a successful restore.
    await waitFor(() => {
      expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument()
    })
    expect(toastCalls.success.length).toBe(1)
  })

  it('surfaces an error toast when restore fails', async () => {
    mock.state.rowsByKind['contacts'] = [
      {
        id: 'c-1',
        deleted_at: '2026-05-20T10:00:00.000Z',
        first_name: 'Carol',
        last_name: 'Chen',
        email: null,
        phone: null,
      },
    ]
    mock.state.restoreShouldThrow = new Error('row_not_found')

    render(<Trash />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Contacts' }))

    const restoreBtn = await screen.findByRole('button', {
      name: 'Restore Carol Chen',
    })
    await user.click(restoreBtn)

    await waitFor(() => {
      expect(toastCalls.error.length).toBe(1)
    })
    // Row stays put because the restore failed.
    expect(screen.getByText('Carol Chen')).toBeInTheDocument()
  })
})
