// landr-8ou3 — Tests for ViewCard (the visual card on /views).
//
// Covers:
//   - layout → icon + gradient palette mapping (table / board / calendar)
//   - filter count chip pluralization (0 / 1 / 3)
//   - card click navigates to /views/<id>
//   - pin button is inside the card but does NOT navigate when clicked
//   - unknown layout falls back to the table palette so the card never breaks
import {
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const { mocks } = vi.hoisted(() => ({
  mocks: { setViewUserState: vi.fn() },
}))

vi.mock('@/lib/saved-views', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/saved-views')>(
      '@/lib/saved-views',
    )
  return { ...actual, setViewUserState: mocks.setViewUserState }
})

import { ViewCard } from './ViewCard'
import type { SavedViewWithState } from '@/lib/saved-views'

function buildView(
  overrides: Partial<SavedViewWithState> = {},
): SavedViewWithState {
  return {
    id: 'view-1',
    operator_id: 'op-1',
    creator_user_id: 'user-1',
    entity_type: 'booking',
    visibility: 'personal',
    name: 'My view',
    config: { layout: 'table', filters: [] },
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
    user_state: { pinned: false, hidden: false, sort_order: 0 },
    ...overrides,
  }
}

function LocationProbe(): ReactElement {
  const loc = useLocation()
  return <span data-testid="loc">{`${loc.pathname}${loc.search}`}</span>
}

function ViewIdProbe(): ReactElement {
  const params = useParams()
  return <span data-testid="view-id">{params.id ?? ''}</span>
}

function render(view: SavedViewWithState): ReturnType<typeof rtlRender> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const options: RenderOptions = {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/views']}>
          <Routes>
            <Route path="/views" element={<>{children}</>} />
            <Route
              path="/views/:id"
              element={
                <>
                  <LocationProbe />
                  <ViewIdProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
  return rtlRender(<ViewCard view={view} operatorId="op-1" />, options)
}

beforeEach(() => {
  mocks.setViewUserState.mockReset()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('ViewCard (landr-8ou3)', () => {
  it('renders the View name, the layout icon, and a 0-filter chip by default', () => {
    render(buildView())
    expect(screen.getByText('My view')).toBeInTheDocument()
    expect(
      screen.getByTestId('view-card-filter-count-view-1'),
    ).toHaveTextContent('0 filters')
    // Table layout → blue gradient header.
    const header = screen.getByTestId('view-card-header-view-1')
    expect(header).toHaveAttribute('data-layout', 'table')
    expect(header.className).toMatch(/from-blue-/)
  })

  it('uses the violet gradient + Columns3 marker for board layouts', () => {
    render(
      buildView({
        config: { layout: 'board', filters: [{ field: 'x', op: 'eq', values: ['y'] }] },
      }),
    )
    const header = screen.getByTestId('view-card-header-view-1')
    expect(header).toHaveAttribute('data-layout', 'board')
    expect(header.className).toMatch(/from-violet-/)
    expect(screen.getByText(/board layout/i)).toBeInTheDocument()
    expect(
      screen.getByTestId('view-card-filter-count-view-1'),
    ).toHaveTextContent('1 filter')
  })

  it('uses the emerald gradient for calendar layouts and pluralises filter chips', () => {
    render(
      buildView({
        config: {
          layout: 'calendar',
          filters: [
            { field: 'a', op: 'eq', values: ['1'] },
            { field: 'b', op: 'eq', values: ['2'] },
            { field: 'c', op: 'eq', values: ['3'] },
          ],
        },
      }),
    )
    const header = screen.getByTestId('view-card-header-view-1')
    expect(header).toHaveAttribute('data-layout', 'calendar')
    expect(header.className).toMatch(/from-emerald-/)
    expect(
      screen.getByTestId('view-card-filter-count-view-1'),
    ).toHaveTextContent('3 filters')
  })

  it('falls back to the table palette when the layout key is unknown', () => {
    render(buildView({ config: { layout: 'nonsense', filters: [] } }))
    const header = screen.getByTestId('view-card-header-view-1')
    // Unknown layout collapses to 'table' (resolver mirrors ViewPage).
    expect(header).toHaveAttribute('data-layout', 'table')
    expect(header.className).toMatch(/from-blue-/)
  })

  it('navigates to /views/<id> when the card body is clicked', async () => {
    const user = userEvent.setup()
    render(buildView({ id: 'view-42' }))
    await user.click(screen.getByTestId('view-card-view-42'))
    await waitFor(() => {
      expect(screen.getByTestId('view-id')).toHaveTextContent('view-42')
    })
  })

  it('navigates when Enter is pressed on the focused card', async () => {
    const user = userEvent.setup()
    render(buildView({ id: 'view-kbd' }))
    const card = screen.getByTestId('view-card-view-kbd')
    card.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(screen.getByTestId('view-id')).toHaveTextContent('view-kbd')
    })
  })

  it('clicking the pin button toggles pin and does NOT navigate', async () => {
    const user = userEvent.setup()
    mocks.setViewUserState.mockResolvedValueOnce(undefined)
    render(buildView({ id: 'view-pin' }))
    await user.click(screen.getByRole('button', { name: /pin this view/i }))
    await waitFor(() => {
      expect(mocks.setViewUserState).toHaveBeenCalledWith(
        'op-1',
        'view-pin',
        { pinned: true },
      )
    })
    // Pin must not navigate.
    expect(screen.queryByTestId('view-id')).not.toBeInTheDocument()
  })
})
