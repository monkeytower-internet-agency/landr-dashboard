// landr-hgtv — ViewPage integration tests.
//
// Covers:
//   - Shell renders header (name), layout switcher, toolbar, and body
//     placeholder when the view loads.
//   - Layout switcher updates the ?layout= URL param (Decision B2).
//   - Duplicate button POSTs and navigates to the new view.
//
// Note: dirty-state mechanics are exercised directly in
// useViewDirtyState.test.tsx — here we only assert the wire-up.

import {
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
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

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSavedView: vi.fn(),
    patchSavedView: vi.fn(),
    duplicateSavedView: vi.fn(),
    deleteSavedView: vi.fn(),
  },
}))

vi.mock('@/lib/saved-views', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/saved-views')>()
  return {
    ...actual,
    getSavedView: mocks.getSavedView,
    patchSavedView: mocks.patchSavedView,
    duplicateSavedView: mocks.duplicateSavedView,
    deleteSavedView: mocks.deleteSavedView,
  }
})

import { ViewPage } from './ViewPage'

// Canonical v4 UUIDs (Zod 4 enforces version+variant nibbles).
const VIEW_ID = '22222222-2222-4222-8222-222222222222'
const VIEW_ID_2 = '22222222-2222-4222-8222-22222222ffff'
const OP_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'

function makeView(overrides: Record<string, unknown> = {}) {
  return {
    id: VIEW_ID,
    operator_id: OP_ID,
    creator_user_id: USER_ID,
    entity_type: 'booking',
    visibility: 'personal',
    name: 'My bookings',
    config: { layout: 'table', filters: [], sort: [] },
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
    user_state: { starred: false, hidden: false, updated_at: null },
    ...overrides,
  }
}

function LocationProbe() {
  const loc = useLocation()
  return (
    <span data-testid="loc">{`${loc.pathname}${loc.search}`}</span>
  )
}

function render(initial: string = `/views/${VIEW_ID}`): ReturnType<typeof rtlRender> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const options: RenderOptions = {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route
              path="/views/:viewId"
              element={
                <>
                  {children}
                  <LocationProbe />
                </>
              }
            />
            <Route path="/views" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
  return rtlRender(<ViewPage />, options)
}

beforeEach(() => {
  mocks.getSavedView.mockReset()
  mocks.patchSavedView.mockReset()
  mocks.duplicateSavedView.mockReset()
  mocks.deleteSavedView.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ViewPage shell (landr-hgtv)', () => {
  it('renders the view name, layout switcher, toolbar, and body placeholder', async () => {
    mocks.getSavedView.mockResolvedValueOnce(makeView())
    render()
    // Wait for the body to mount — the layout stub only appears once the
    // useQuery resolves. The header (view-name h1, layout switcher) is
    // present from first render but its text depends on the query result.
    expect(
      await screen.findByTestId('view-layout-stub-table'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('view-name')).toHaveTextContent('My bookings')
    expect(screen.getByTestId('layout-switcher')).toBeInTheDocument()
    expect(screen.getByTestId('view-toolbar-bar')).toBeInTheDocument()
  })

  it('falls back to the config layout when ?layout= is not present', async () => {
    mocks.getSavedView.mockResolvedValueOnce(
      makeView({ config: { layout: 'board', filters: [], sort: [] } }),
    )
    render()
    expect(
      await screen.findByTestId('view-layout-stub-board'),
    ).toBeInTheDocument()
  })

  it('clicking Board in the switcher updates ?layout=board (Decision B2)', async () => {
    mocks.getSavedView.mockResolvedValueOnce(makeView())
    const user = userEvent.setup()
    render()
    await screen.findByTestId('view-name')
    await user.click(screen.getByTestId('layout-switcher-board'))
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe(
        `/views/${VIEW_ID}?layout=board`,
      )
    })
    expect(
      await screen.findByTestId('view-layout-stub-board'),
    ).toBeInTheDocument()
    // Clicking Table (the config default) clears the URL param.
    await user.click(screen.getByTestId('layout-switcher-table'))
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe(`/views/${VIEW_ID}`)
    })
  })

  it('Duplicate posts and navigates to the new view', async () => {
    mocks.getSavedView.mockResolvedValue(makeView())
    mocks.duplicateSavedView.mockResolvedValueOnce(
      makeView({ id: VIEW_ID_2, name: 'My bookings (copy)' }),
    )
    const user = userEvent.setup()
    render()
    await screen.findByTestId('view-name')
    await user.click(screen.getByTestId('view-duplicate'))
    await waitFor(() => {
      expect(mocks.duplicateSavedView).toHaveBeenCalledWith('op-1', VIEW_ID)
    })
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe(`/views/${VIEW_ID_2}`)
    })
  })

  it('renders the dirty banner only when a Shared view has unsaved changes', async () => {
    mocks.getSavedView.mockResolvedValueOnce(
      makeView({ visibility: 'shared' }),
    )
    const user = userEvent.setup()
    render()
    // Wait for the toolbar to mount (depends on query data).
    await screen.findByTestId('view-toolbar-bar')
    expect(screen.queryByTestId('view-dirty-banner')).not.toBeInTheDocument()

    // Add a filter — the toolbar's add button stages a config change.
    await user.click(screen.getByTestId('view-toolbar-filters-add-trigger'))
    await screen.findByTestId('filter-editor')
    const valueInput = screen.getByTestId('filter-editor-value')
    await user.type(valueInput, 'Marie')
    await user.click(screen.getByTestId('filter-editor-apply'))

    expect(await screen.findByTestId('view-dirty-banner')).toBeInTheDocument()
  })
})
