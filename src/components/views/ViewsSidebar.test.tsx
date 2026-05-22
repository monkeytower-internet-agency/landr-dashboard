// landr-c58d / landr-45pb / landr-79f5 — ViewsSidebar tests.
//
// Pin-or-nothing IA (landr-79f5):
//   - Sidebar renders ONLY pinned views in user_state.sort_order ASC.
//   - Unpinned views are absent.
//   - Hidden views are absent (treated identically to unpinned).
//   - "+ New view" button is always present and navigates to /views.
//   - Empty state: when nothing is pinned, show a hint with a link to /views.
//   - PinButton on each row toggles pinned=false (unpin removes from sidebar).
//
// NOTE: @dnd-kit's pointer pipeline is unfriendly to jsdom — full pointer
// gestures can't be driven from userEvent. We test the DnD handler logic
// indirectly through the bucket-sort helper + by clicking the PinButton
// (which fires the same setViewUserState call that an unpin-drag would).
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
      reorderSavedViews: vi.fn(),
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
    reorderSavedViews: mocks.reorderSavedViews,
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { ViewsSidebar } from './ViewsSidebar'
import { bucketViewsForSidebar, sortViewsForSidebar } from './sidebar-sort'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { SavedViewWithState } from '@/lib/saved-views'

function makeView(overrides: Partial<SavedViewWithState> = {}): SavedViewWithState {
  const id = overrides.id ?? '11111111-1111-4111-8111-111111111111'
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
    user_state: { pinned: false, hidden: false, sort_order: 0 },
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
          <Route path="/views" element={<LocationProbe />} />
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
  mocks.reorderSavedViews.mockReset()
  try {
    window.localStorage.clear()
  } catch {
    /* jsdom may throw — ignore */
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// sidebar-sort helpers (legacy — bucket helper still classifies for callers
// that may need full bucket info; the sidebar itself only consumes `primary`).
// =============================================================================

describe('sortViewsForSidebar (landr-45pb)', () => {
  it('puts pinned views first, then by user_state.sort_order, then by name', () => {
    const v1 = makeView({
      id: '11111111-1111-4111-8111-000000000001',
      name: 'Charlie',
      user_state: { pinned: false, hidden: false, sort_order: 2 },
    })
    const v2 = makeView({
      id: '11111111-1111-4111-8111-000000000002',
      name: 'Alpha',
      user_state: { pinned: true, hidden: false, sort_order: 5 },
    })
    const v3 = makeView({
      id: '11111111-1111-4111-8111-000000000003',
      name: 'Bravo',
      user_state: { pinned: true, hidden: false, sort_order: 5 },
    })
    const v4 = makeView({
      id: '11111111-1111-4111-8111-000000000004',
      name: 'Delta',
      user_state: { pinned: false, hidden: false, sort_order: 1 },
    })

    const sorted = sortViewsForSidebar([v1, v2, v3, v4])
    expect(sorted.map((v) => v.name)).toEqual([
      'Alpha',
      'Bravo',
      'Delta',
      'Charlie',
    ])
  })
})

describe('bucketViewsForSidebar (landr-45pb)', () => {
  it('still classifies into primary/more/hidden for callers that need it', () => {
    const pinnedA = makeView({
      id: '11111111-1111-4111-8111-000000000001',
      name: 'P-Apple',
      user_state: { pinned: true, hidden: false, sort_order: 1 },
    })
    const pinnedB = makeView({
      id: '11111111-1111-4111-8111-000000000002',
      name: 'P-Banana',
      user_state: { pinned: true, hidden: false, sort_order: 0 },
    })
    const moreA = makeView({
      id: '11111111-1111-4111-8111-000000000003',
      name: 'M-Alpha',
      user_state: { pinned: false, hidden: false, sort_order: 0 },
    })
    const hiddenA = makeView({
      id: '11111111-1111-4111-8111-000000000005',
      name: 'H-Tucked',
      user_state: { pinned: false, hidden: true, sort_order: 0 },
    })

    const { primary, more, hidden } = bucketViewsForSidebar([
      pinnedA,
      pinnedB,
      moreA,
      hiddenA,
    ])

    expect(primary.map((v) => v.name)).toEqual(['P-Banana', 'P-Apple'])
    expect(more.map((v) => v.name)).toEqual(['M-Alpha'])
    expect(hidden.map((v) => v.name)).toEqual(['H-Tucked'])
  })
})

// =============================================================================
// ViewsSidebar — pin-or-nothing rendering (landr-79f5)
// =============================================================================

describe('ViewsSidebar (landr-79f5) — pin-or-nothing rendering', () => {
  it('renders pinned views in user_state.sort_order ASC', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'P-Charlie',
        user_state: { pinned: true, hidden: false, sort_order: 2 },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'P-Alpha',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
    ])

    renderSidebar()

    const alpha = await screen.findByRole('link', { name: /p-alpha/i })
    const charlie = await screen.findByRole('link', { name: /p-charlie/i })
    expect(
      alpha.compareDocumentPosition(charlie) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does NOT render unpinned views in the sidebar', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'PinnedOne',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'UnpinnedSecret',
        user_state: { pinned: false, hidden: false, sort_order: 0 },
      }),
    ])

    renderSidebar()

    expect(
      await screen.findByRole('link', { name: /pinnedone/i }),
    ).toBeInTheDocument()
    // Unpinned view must NOT appear anywhere — no More bucket, no expander.
    expect(
      screen.queryByRole('link', { name: /unpinnedsecret/i }),
    ).toBeNull()
    // No "More" or "Hidden" bucket buttons either.
    expect(screen.queryByRole('button', { name: /^more/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^hidden/i })).toBeNull()
  })

  it('does NOT render hidden views in the sidebar', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'PinnedOne',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'TuckedAway',
        user_state: { pinned: false, hidden: true, sort_order: 0 },
      }),
      makeView({
        // Even if hidden=true AND pinned=true, the row is still pinned
        // — `hidden` is a no-op for the sidebar (we don't bucket on it).
        // bucketViewsForSidebar classifies hidden=true into the hidden
        // bucket which the sidebar now ignores, so this row is absent.
        id: '11111111-1111-4111-8111-000000000003',
        name: 'PinnedButHidden',
        user_state: { pinned: true, hidden: true, sort_order: 0 },
      }),
    ])

    renderSidebar()

    await screen.findByRole('link', { name: /pinnedone/i })
    expect(screen.queryByRole('link', { name: /tuckedaway/i })).toBeNull()
    expect(
      screen.queryByRole('link', { name: /pinnedbuthidden/i }),
    ).toBeNull()
  })

  it('renders an empty-state hint when no views are pinned', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'UnpinnedOnly',
        user_state: { pinned: false, hidden: false, sort_order: 0 },
      }),
    ])

    renderSidebar()

    const empty = await screen.findByTestId('views-sidebar-empty')
    expect(empty.textContent).toMatch(/no views pinned/i)
    // The /views link inside the hint navigates to the index.
    const link = within(empty).getByRole('link')
    expect(link.getAttribute('href')).toBe('/views')
  })

  it('renders the "+ New view" button that links to /views', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([])

    renderSidebar()

    const newViewLink = await screen.findByTestId('views-sidebar-new-view')
    expect(newViewLink.getAttribute('href')).toBe('/views')
    expect(newViewLink.textContent).toMatch(/new view/i)
  })

  it('"+ New view" button is present even when pinned views exist', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'PinnedOne',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
    ])

    renderSidebar()

    await screen.findByRole('link', { name: /pinnedone/i })
    expect(screen.getByTestId('views-sidebar-new-view')).toBeInTheDocument()
  })

  it('clicking a row navigates to /views/:id', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000042',
        name: 'Click me',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
    ])

    renderSidebar()

    const link = await screen.findByRole('link', { name: /click me/i })
    expect(link.getAttribute('href')).toBe(
      '/views/11111111-1111-4111-8111-000000000042',
    )
  })
})

// =============================================================================
// PinButton wiring — Hide-equivalent is now just "Unpin"
// =============================================================================

describe('ViewsSidebar (landr-79f5) — PinButton wiring', () => {
  it('clicking the inline PinButton on a pinned row sets pinned=false (removes from sidebar)', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000bbb',
        name: 'Unpin me',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
    ])
    mocks.setViewUserState.mockResolvedValueOnce(undefined)

    renderSidebar()
    const user = userEvent.setup()

    const row = await screen.findByRole('link', { name: /unpin me/i })
    const li = row.closest('li') as HTMLElement
    await user.click(
      within(li).getByRole('button', { name: /unpin this view/i }),
    )

    await waitFor(() => {
      expect(mocks.setViewUserState).toHaveBeenCalledWith(
        'op-1',
        '11111111-1111-4111-8111-000000000bbb',
        { pinned: false },
      )
    })
  })
})
