// landr-c58d — ViewsSidebar tests.
//
// Covers:
//   - sort order: starred first, then sort_order ASC, then name ASC
//   - hidden views excluded by default
//   - "Show hidden views" toggle includes them at reduced opacity
//   - row click navigates to /views/:id
//   - empty state links to /views
import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
}))

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      listSavedViews: vi.fn(),
      setViewUserState: vi.fn(),
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
    setViewUserState: mocks.setViewUserState,
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { ViewsSidebar } from './ViewsSidebar'
import { sortViewsForSidebar } from './sidebar-sort'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { SavedViewWithState } from '@/lib/saved-views'

function makeView(overrides: Partial<SavedViewWithState> = {}): SavedViewWithState {
  const id =
    overrides.id ?? '11111111-1111-4111-8111-111111111111'
  return {
    id,
    operator_id: 'op-1',
    creator_user_id: '33333333-3333-4333-8333-333333333333',
    entity_type: 'booking',
    visibility: 'personal',
    name: 'A view',
    config: {},
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
    user_state: { starred: false, hidden: false },
    ...overrides,
  }
}

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname}</span>
}

function renderSidebar(initialPath: string = '/views'): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SidebarProvider>{children}</SidebarProvider>
        <Routes>
          <Route path="/views/:viewId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  render(
    <Wrapper>
      <ViewsSidebar />
    </Wrapper>,
  )
  return { client }
}

beforeEach(() => {
  mocks.listSavedViews.mockReset()
  mocks.setViewUserState.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('sortViewsForSidebar (landr-c58d)', () => {
  it('puts starred views first, then by sort_order, then by name', () => {
    const v1 = makeView({
      id: '11111111-1111-4111-8111-000000000001',
      name: 'Charlie',
      sort_order: 2,
      user_state: { starred: false, hidden: false },
    })
    const v2 = makeView({
      id: '11111111-1111-4111-8111-000000000002',
      name: 'Alpha',
      sort_order: 5,
      user_state: { starred: true, hidden: false },
    })
    const v3 = makeView({
      id: '11111111-1111-4111-8111-000000000003',
      name: 'Bravo',
      sort_order: 5,
      user_state: { starred: true, hidden: false },
    })
    const v4 = makeView({
      id: '11111111-1111-4111-8111-000000000004',
      name: 'Delta',
      sort_order: 1,
      user_state: { starred: false, hidden: false },
    })

    const sorted = sortViewsForSidebar([v1, v2, v3, v4])
    expect(sorted.map((v) => v.name)).toEqual([
      'Alpha', // starred, sort_order 5, name A
      'Bravo', // starred, sort_order 5, name B (tiebreak)
      'Delta', // unstarred, sort_order 1
      'Charlie', // unstarred, sort_order 2
    ])
  })
})

describe('ViewsSidebar (landr-c58d) — rendering + filtering', () => {
  it('lists visible views in star-first / sort_order / name order', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'Zeta',
        sort_order: 0,
        user_state: { starred: false, hidden: false },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'Apple',
        sort_order: 0,
        user_state: { starred: true, hidden: false },
      }),
    ])

    renderSidebar()

    const apple = await screen.findByRole('link', { name: /apple/i })
    const zeta = await screen.findByRole('link', { name: /zeta/i })
    // Apple must come BEFORE Zeta in the DOM (starred first).
    expect(
      apple.compareDocumentPosition(zeta) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('excludes hidden views by default', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'Visible',
        user_state: { starred: false, hidden: false },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'Tucked away',
        user_state: { starred: false, hidden: true },
      }),
    ])

    renderSidebar()

    expect(await screen.findByRole('link', { name: /visible/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /tucked away/i })).toBeNull()
  })

  it('show-hidden toggle reveals hidden views at reduced opacity', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'Visible',
        user_state: { starred: false, hidden: false },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'Tucked away',
        user_state: { starred: false, hidden: true },
      }),
    ])

    renderSidebar()

    await screen.findByRole('link', { name: /visible/i })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /show hidden views/i }))

    const hiddenLink = await screen.findByRole('link', { name: /tucked away/i })
    // Reduced opacity is applied to the SidebarMenuSubItem (the <li>).
    const li = hiddenLink.closest('li')
    expect(li?.className).toContain('opacity-60')
  })

  it('renders an empty-state link to /views when the user has no views', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([])

    renderSidebar()

    const link = await screen.findByRole('link', {
      name: /no views yet/i,
    })
    expect(link.getAttribute('href')).toBe('/views')
  })

  it('clicking a row navigates to /views/:id', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000042',
        name: 'Click me',
        user_state: { starred: false, hidden: false },
      }),
    ])

    renderSidebar()

    const link = await screen.findByRole('link', { name: /click me/i })
    expect(link.getAttribute('href')).toBe(
      '/views/11111111-1111-4111-8111-000000000042',
    )
  })
})

describe('ViewsSidebar (landr-c58d) — Hide control', () => {
  it('overflow menu Hide calls setViewUserState({hidden: true})', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000099',
        name: 'Hide me',
        user_state: { starred: false, hidden: false },
      }),
    ])
    mocks.setViewUserState.mockResolvedValueOnce(undefined)

    renderSidebar()
    const user = userEvent.setup()

    const row = await screen.findByRole('link', { name: /hide me/i })
    // The overflow trigger sits next to the link in the same parent <li>.
    const li = row.closest('li') as HTMLElement
    const trigger = within(li).getByRole('button', {
      name: /more actions for hide me/i,
    })
    await user.click(trigger)

    // Radix renders the menu in a portal — query the whole document.
    const menuItem = await screen.findByRole('menuitem', {
      name: /hide from sidebar/i,
    })
    await user.click(menuItem)

    await waitFor(() => {
      expect(mocks.setViewUserState).toHaveBeenCalledWith(
        'op-1',
        '11111111-1111-4111-8111-000000000099',
        { hidden: true },
      )
    })
  })
})
