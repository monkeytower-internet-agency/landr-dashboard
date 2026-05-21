import {
  render as rtlRender,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import type { AuditFilters, AuditRow } from '@/lib/audit'

const { mock } = vi.hoisted(() => {
  const state = {
    rows: [] as AuditRow[],
    error: null as Error | null,
    lastFilters: null as AuditFilters | null,
    callCount: 0,
  }
  return { mock: { state } }
})

vi.mock('@/lib/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit')>(
    '@/lib/audit',
  )
  return {
    ...actual,
    fetchAuditPage: vi.fn(async (filters: AuditFilters) => {
      mock.state.lastFilters = filters
      mock.state.callCount += 1
      if (mock.state.error) throw mock.state.error
      return mock.state.rows
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
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

import { Audit } from './Audit'
import { AUDIT_PAGE_SIZE } from '@/lib/audit'

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  })
}

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  mock.state.lastFilters = null
  mock.state.callCount = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

function makeRow(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    occurred_at: '2026-05-21T10:00:00.000Z',
    operator_id: 'op-1',
    table_name: 'bookings',
    row_id: 'b-1',
    operation: 'UPDATE',
    actor_kind: 'user',
    actor_subkind: 'staff',
    user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    external_correlation_id: null,
    old_row: { stage: 'pending' },
    new_row: { stage: 'confirmed' },
    ...overrides,
  }
}

describe('Audit route — smoke', () => {
  it('renders the page title and filter card', async () => {
    render(<Audit />)
    expect(
      await screen.findByRole('heading', { name: /audit log/i, level: 1 }),
    ).toBeInTheDocument()
    // Filter form labels live in a card; pin to the entity-type dropdown
    // as a load-bearing proof the filter UI mounted.
    expect(screen.getByLabelText(/entity type/i)).toBeInTheDocument()
  })

  it('renders rows returned by fetchAuditPage', async () => {
    mock.state.rows = [
      makeRow({ id: 'row-1' }),
      makeRow({ id: 'row-2', operation: 'INSERT' }),
    ]
    render(<Audit />)
    const rows = await screen.findAllByTestId('audit-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('bookings')).toBeInTheDocument()
  })

  it('renders empty-state card when no rows', async () => {
    mock.state.rows = []
    render(<Audit />)
    expect(
      await screen.findByText(/no audit entries match/i),
    ).toBeInTheDocument()
  })

  it('renders the error card on fetch failure', async () => {
    mock.state.error = new Error('rls-denied')
    render(<Audit />)
    expect(
      await screen.findByText(/failed to load audit log/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/rls-denied/i)).toBeInTheDocument()
  })
})

describe('Audit route — filters', () => {
  it('forwards entity_type filter to the fetcher', async () => {
    const user = userEvent.setup()
    render(<Audit />)
    await screen.findByText(/no audit entries match/i)
    mock.state.lastFilters = null

    const select = screen.getByLabelText(/entity type/i)
    await user.selectOptions(select, 'contacts')

    // The query refetches when filters change; wait for the new call.
    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.tableName).toBe('contacts')
    })
  })

  it('forwards operation filter to the fetcher', async () => {
    const user = userEvent.setup()
    render(<Audit />)
    await screen.findByText(/no audit entries match/i)
    mock.state.lastFilters = null

    const select = screen.getByLabelText(/operation/i)
    await user.selectOptions(select, 'DELETE')

    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.operation).toBe('DELETE')
    })
  })

  it('forwards from/to date filters as ISO bounds', async () => {
    const user = userEvent.setup()
    render(<Audit />)
    await screen.findByText(/no audit entries match/i)

    const fromInput = screen.getByLabelText(/^from$/i) as HTMLInputElement
    await user.type(fromInput, '2026-05-01')
    const toInput = screen.getByLabelText(/^to$/i) as HTMLInputElement
    await user.type(toInput, '2026-05-21')

    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.from).toBe('2026-05-01')
      expect(mock.state.lastFilters?.to).toBe('2026-05-21')
    })
  })

  it('forwards actor user_id (trimmed) to the fetcher', async () => {
    const user = userEvent.setup()
    render(<Audit />)
    await screen.findByText(/no audit entries match/i)

    const actorInput = screen.getByLabelText(/actor user id/i)
    await user.type(actorInput, '  user-42  ')

    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.userId).toBe('user-42')
    })
  })

  it('reset button clears all filters and returns to page 0', async () => {
    const user = userEvent.setup()
    render(<Audit />)
    await screen.findByText(/no audit entries match/i)

    await user.selectOptions(screen.getByLabelText(/entity type/i), 'contacts')
    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.tableName).toBe('contacts')
    })

    await user.click(screen.getByRole('button', { name: /reset filters/i }))

    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.tableName).toBeNull()
      expect(mock.state.lastFilters?.page).toBe(0)
    })
  })

  it('changing a filter resets page index to 0', async () => {
    // Pre-load a full page so the Next button is enabled.
    mock.state.rows = Array.from({ length: AUDIT_PAGE_SIZE }, (_, i) =>
      makeRow({ id: `row-${i}` }),
    )
    const user = userEvent.setup()
    render(<Audit />)
    await screen.findAllByTestId('audit-row')

    // Click Next to land on page 2.
    await user.click(screen.getByRole('button', { name: /next/i }))
    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.page).toBe(1)
    })

    // Now change a filter — the route should reset to page 0.
    await user.selectOptions(
      screen.getByLabelText(/entity type/i),
      'contacts',
    )
    await vi.waitFor(() => {
      expect(mock.state.lastFilters?.page).toBe(0)
    })
  })
})

describe('Audit route — pagination', () => {
  it('disables Previous on the first page', async () => {
    mock.state.rows = [makeRow()]
    render(<Audit />)
    await screen.findAllByTestId('audit-row')
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('disables Next when fewer than PAGE_SIZE rows are returned', async () => {
    mock.state.rows = [makeRow()]
    render(<Audit />)
    await screen.findAllByTestId('audit-row')
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('enables Next when exactly PAGE_SIZE rows are returned', async () => {
    mock.state.rows = Array.from({ length: AUDIT_PAGE_SIZE }, (_, i) =>
      makeRow({ id: `row-${i}` }),
    )
    render(<Audit />)
    await screen.findAllByTestId('audit-row')
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })
})

describe('Audit route — drawer', () => {
  it('opens the drawer with pretty-printed payload when a row is clicked', async () => {
    mock.state.rows = [makeRow({ id: 'row-1' })]
    const user = userEvent.setup()
    render(<Audit />)
    const [row] = await screen.findAllByTestId('audit-row')

    await user.click(row)

    const payload = await screen.findByTestId('audit-payload')
    const text = payload.textContent ?? ''
    expect(text).toContain('"old_row"')
    expect(text).toContain('"stage": "pending"')
    expect(text).toContain('"new_row"')
    expect(text).toContain('"stage": "confirmed"')
  })
})
