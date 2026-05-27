// landr-7dya.11 — TicketFilterBar projection tests.
//
// The bar holds no state of its own — it projects the shared filter and writes
// back through patchFilter / clearFilter. We mock useTicketFilter + useOperator
// so the test asserts the bar's wiring (chips → the right patch, active-count
// badge, clear-all visibility) without standing up the full provider stack.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TICKET_FILTER_DEFAULTS,
  type TicketFilter,
} from '@/lib/ticket-filters'

const { mock } = vi.hoisted(() => ({
  mock: {
    filter: null as TicketFilter | null,
    patchFilter: vi.fn(),
    clearFilter: vi.fn(),
    staffOperators: [] as Array<{ id: string; slug: string; name: string | null }>,
  },
}))

vi.mock('@/lib/ticket-filter-context', () => ({
  useTicketFilter: () => ({
    filter: mock.filter,
    setFilter: vi.fn(),
    patchFilter: mock.patchFilter,
    clearFilter: mock.clearFilter,
    matches: () => true,
    serverFilteredIds: null,
    isResolving: false,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({ staffOperators: mock.staffOperators }),
}))

import { TicketFilterBar } from './TicketFilterBar'

beforeEach(() => {
  mock.filter = { ...TICKET_FILTER_DEFAULTS }
  mock.patchFilter.mockReset()
  mock.clearFilter.mockReset()
  mock.staffOperators = [
    { id: 'op-1', slug: 'acme', name: 'Acme Co' },
    { id: 'op-2', slug: 'globex', name: 'Globex' },
  ]
})

afterEach(() => vi.clearAllMocks())

describe('TicketFilterBar — quick chips', () => {
  it('renders the four quick chips', () => {
    render(<TicketFilterBar />)
    expect(screen.getByTestId('ticket-filter-chip-mine')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-filter-chip-unread')).toBeInTheDocument()
    expect(
      screen.getByTestId('ticket-filter-chip-mentioned'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('ticket-filter-chip-unassigned'),
    ).toBeInTheDocument()
  })

  it('toggling "assigned to me" patches assignedToMe=true', async () => {
    const user = userEvent.setup()
    render(<TicketFilterBar />)
    await user.click(screen.getByTestId('ticket-filter-chip-mine'))
    expect(mock.patchFilter).toHaveBeenCalledWith({ assignedToMe: true })
  })

  it('an active chip reflects aria-pressed=true', () => {
    mock.filter = { ...TICKET_FILTER_DEFAULTS, unreadOnly: true }
    render(<TicketFilterBar />)
    expect(screen.getByTestId('ticket-filter-chip-unread')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('toggling an already-active chip patches it back off', async () => {
    mock.filter = { ...TICKET_FILTER_DEFAULTS, mentionedMeOnly: true }
    const user = userEvent.setup()
    render(<TicketFilterBar />)
    await user.click(screen.getByTestId('ticket-filter-chip-mentioned'))
    expect(mock.patchFilter).toHaveBeenCalledWith({ mentionedMeOnly: false })
  })
})

describe('TicketFilterBar — active count + clear', () => {
  it('hides the active-count badge and clear-all when no facets active', () => {
    render(<TicketFilterBar />)
    expect(
      screen.queryByTestId('ticket-filter-active-count'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('ticket-filter-clear-all'),
    ).not.toBeInTheDocument()
  })

  it('shows the active-count badge with the facet count', () => {
    mock.filter = {
      ...TICKET_FILTER_DEFAULTS,
      status: 'ready',
      blockedOnly: true,
      assignedToMe: true,
    }
    render(<TicketFilterBar />)
    expect(screen.getByTestId('ticket-filter-active-count')).toHaveTextContent(
      '3',
    )
  })

  it('clear-all calls clearFilter', async () => {
    mock.filter = { ...TICKET_FILTER_DEFAULTS, status: 'done' }
    const user = userEvent.setup()
    render(<TicketFilterBar />)
    await user.click(screen.getByTestId('ticket-filter-clear-all'))
    expect(mock.clearFilter).toHaveBeenCalledTimes(1)
  })
})

describe('TicketFilterBar — popover selects', () => {
  it('opens the popover and patches the status filter', async () => {
    const user = userEvent.setup()
    render(<TicketFilterBar />)
    await user.click(screen.getByTestId('ticket-filter-more'))
    const statusSelect = await screen.findByTestId('ticket-filter-status')
    await user.selectOptions(statusSelect, 'ready')
    expect(mock.patchFilter).toHaveBeenCalledWith({ status: 'ready' })
  })

  it('lists the staff operators in the operator select', async () => {
    const user = userEvent.setup()
    render(<TicketFilterBar />)
    await user.click(screen.getByTestId('ticket-filter-more'))
    const opSelect = await screen.findByTestId('ticket-filter-operator')
    expect(opSelect).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Acme Co' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Globex' })).toBeInTheDocument()
  })
})
