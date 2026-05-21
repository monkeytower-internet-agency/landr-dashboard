// landr-v0xg — tests for the ViewsIndex page.
//
// Covers:
//   - empty-state renders the 4 template cards when the API returns []
//   - clicking a template card navigates to /views/new?from=template:<key>
//   - clicking '+ New view' navigates to /views/new
//   - when there are visible Views, the pick-from-sidebar help text shows
import {
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

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

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      listSavedViews: vi.fn(),
      createSavedView: vi.fn(),
    },
  }
})

vi.mock('@/lib/saved-views', async () => {
  const actual = await vi.importActual<typeof import('@/lib/saved-views')>(
    '@/lib/saved-views',
  )
  return {
    ...actual,
    listSavedViews: mocks.listSavedViews,
    createSavedView: mocks.createSavedView,
  }
})

import { ViewsIndex } from './ViewsIndex'

function LocationProbe() {
  const loc = useLocation()
  return (
    <span data-testid="loc">{`${loc.pathname}${loc.search}`}</span>
  )
}

function render(initialEntries: string[] = ['/views']): ReturnType<typeof rtlRender> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const options: RenderOptions = {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/views" element={<>{children}</>} />
            <Route path="/views/new" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
  return rtlRender(<ViewsIndex />, options)
}

beforeEach(() => {
  mocks.listSavedViews.mockReset()
  mocks.createSavedView.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ViewsIndex (landr-v0xg)', () => {
  it('renders the empty-state + 4 template cards when the user has 0 views', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([])

    render()

    expect(await screen.findByText(/no views yet/i)).toBeInTheDocument()
    expect(screen.getByText(/start with a template/i)).toBeInTheDocument()

    // landr-s1mr — the no-views state uses the shared <EmptyState> card.
    expect(screen.getByTestId('views-empty-state')).toBeInTheDocument()

    // Four template cards
    expect(screen.getByText('All bookings')).toBeInTheDocument()
    expect(screen.getByText('Pending approvals')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText("Today's pickups")).toBeInTheDocument()
  })

  it('also shows the empty-state when every existing view is hidden by the user', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      {
        id: '99999999-9999-4999-8999-999999999999',
        operator_id: '11111111-1111-4111-8111-111111111111',
        creator_user_id: '33333333-3333-4333-8333-333333333333',
        entity_type: 'booking',
        visibility: 'shared',
        name: 'Hidden view',
        config: {},
        sort_order: 0,
        created_at: '2026-05-21T10:00:00Z',
        updated_at: '2026-05-21T10:00:00Z',
        user_state: { starred: false, hidden: true },
      },
    ])

    render()
    expect(await screen.findByText(/no views yet/i)).toBeInTheDocument()
  })

  it('shows the pick-from-sidebar helper when the user has at least one visible view', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      {
        id: '99999999-9999-4999-8999-999999999999',
        operator_id: '11111111-1111-4111-8111-111111111111',
        creator_user_id: '33333333-3333-4333-8333-333333333333',
        entity_type: 'booking',
        visibility: 'personal',
        name: 'My view',
        config: {},
        sort_order: 0,
        created_at: '2026-05-21T10:00:00Z',
        updated_at: '2026-05-21T10:00:00Z',
        user_state: { starred: false, hidden: false },
      },
    ])

    render()
    expect(
      await screen.findByText(/pick a view from the sidebar/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/no views yet/i)).not.toBeInTheDocument()
  })

  it('clicking a template card navigates to /views/new?from=template:<key>', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([])
    const user = userEvent.setup()

    render()

    await screen.findByText('All bookings')
    await user.click(screen.getByText('Pending approvals'))

    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe(
        '/views/new?from=template:pending-approvals',
      )
    })
  })

  it("clicking '+ New view' navigates to /views/new (no ?from)", async () => {
    mocks.listSavedViews.mockResolvedValueOnce([])
    const user = userEvent.setup()

    render()

    await screen.findByText(/no views yet/i)
    await user.click(screen.getByRole('button', { name: /\+ new view/i }))

    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/views/new')
    })
  })
})
