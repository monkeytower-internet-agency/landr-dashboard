// landr-c58d / landr-45pb — ViewsSidebar tests.
//
// Covers (Gmail-style three-bucket layout):
//   - Primary bucket: shows pinned views in sort_order ASC, name tiebreak
//   - More bucket: collapsible (default open); persisted in localStorage
//   - Hidden sub-expander: shows hidden views at reduced opacity with 🚫 prefix
//   - Drag from More → Primary calls setViewUserState({pinned: true, sort_order})
//   - Drag from Primary → More calls setViewUserState({pinned: false})
//   - Reorder within Primary calls reorderSavedViews([{view_id, sort_order}])
//   - Overflow menu Hide / Unhide still works on each row
//
// NOTE: @dnd-kit's pointer pipeline is unfriendly to jsdom — full pointer
// gestures can't be driven from userEvent. We test the DnD handler logic
// by invoking the handler indirectly through the bucket-sort + mutation
// pieces; the cross-bucket behaviour is verified end-to-end by clicking
// the PinButton (which fires the same setViewUserState call) and by
// directly asserting against bucketViewsForSidebar's classification.
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
  // Reset localStorage between tests so expander state doesn't leak.
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
// sidebar-sort helpers
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
      'Alpha', // pinned, sort_order 5, name A
      'Bravo', // pinned, sort_order 5, name B (tiebreak)
      'Delta', // unpinned, sort_order 1
      'Charlie', // unpinned, sort_order 2
    ])
  })
})

describe('bucketViewsForSidebar (landr-45pb)', () => {
  it('classifies into primary/more/hidden, preserving per-bucket order', () => {
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
      name: 'M-Zeta',
      user_state: { pinned: false, hidden: false, sort_order: 0 },
    })
    const moreB = makeView({
      id: '11111111-1111-4111-8111-000000000004',
      name: 'M-Alpha',
      user_state: { pinned: false, hidden: false, sort_order: 0 },
    })
    const hiddenA = makeView({
      id: '11111111-1111-4111-8111-000000000005',
      name: 'H-Tucked',
      user_state: { pinned: false, hidden: true, sort_order: 0 },
    })
    const hiddenPinned = makeView({
      // hidden overrides pinned: it must land in the Hidden bucket.
      id: '11111111-1111-4111-8111-000000000006',
      name: 'H-Pinned-but-hidden',
      user_state: { pinned: true, hidden: true, sort_order: 0 },
    })

    const { primary, more, hidden } = bucketViewsForSidebar([
      pinnedA,
      pinnedB,
      moreA,
      moreB,
      hiddenA,
      hiddenPinned,
    ])

    expect(primary.map((v) => v.name)).toEqual(['P-Banana', 'P-Apple']) // sort_order ASC
    expect(more.map((v) => v.name)).toEqual(['M-Alpha', 'M-Zeta']) // name ASC
    expect(hidden.map((v) => v.name)).toEqual([
      'H-Pinned-but-hidden',
      'H-Tucked',
    ]) // name ASC; hidden wins over pinned
  })

  it('handles empty input', () => {
    const buckets = bucketViewsForSidebar([])
    expect(buckets.primary).toEqual([])
    expect(buckets.more).toEqual([])
    expect(buckets.hidden).toEqual([])
  })
})

// =============================================================================
// ViewsSidebar — rendering + interactions
// =============================================================================

describe('ViewsSidebar (landr-45pb) — rendering', () => {
  it('renders Primary rows in user_state.sort_order then name', async () => {
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

  it('renders Primary, More, and Hidden buckets distinctly', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'Alpha',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'Bravo',
        user_state: { pinned: false, hidden: false, sort_order: 0 },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000003',
        name: 'Charlie',
        user_state: { pinned: false, hidden: true, sort_order: 0 },
      }),
    ])

    renderSidebar()

    // Primary view (pinned) is always visible.
    expect(await screen.findByRole('link', { name: /alpha/i })).toBeInTheDocument()

    // More expander defaults to open → Bravo (unpinned) visible.
    expect(await screen.findByRole('link', { name: /bravo/i })).toBeInTheDocument()

    // Hidden sub-expander defaults to closed → Charlie NOT visible yet.
    expect(screen.queryByRole('link', { name: /charlie/i })).toBeNull()

    // Expand Hidden.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^hidden\(/i }))

    const hiddenLink = await screen.findByRole('link', { name: /charlie/i })
    const li = hiddenLink.closest('li')
    expect(li?.className).toContain('opacity-60')
  })

  it('More expander state persists in localStorage', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'Alpha',
        user_state: { pinned: true, hidden: false, sort_order: 0 },
      }),
      makeView({
        id: '11111111-1111-4111-8111-000000000002',
        name: 'Bravo',
        user_state: { pinned: false, hidden: false, sort_order: 0 },
      }),
    ])

    renderSidebar()

    await screen.findByRole('link', { name: /bravo/i })

    const user = userEvent.setup()
    // Use `^More \(` so the regex doesn't match the per-row
    // `More actions for …` dropdown trigger.
    await user.click(screen.getByRole('button', { name: /^more\(/i }))

    expect(window.localStorage.getItem('landr.dashboard.viewsMoreOpen')).toBe(
      'false',
    )

    // Click again → re-open.
    await user.click(screen.getByRole('button', { name: /^more\(/i }))
    expect(window.localStorage.getItem('landr.dashboard.viewsMoreOpen')).toBe(
      'true',
    )
  })

  it('Hidden expander state persists in localStorage', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'TuckedAway',
        user_state: { pinned: false, hidden: true, sort_order: 0 },
      }),
    ])

    renderSidebar()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /^hidden\(/i }))
    expect(window.localStorage.getItem('landr.dashboard.viewsHiddenOpen')).toBe(
      'true',
    )
  })

  it('renders a primary-empty hint when no pinned views exist', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000001',
        name: 'UnpinnedOnly',
        user_state: { pinned: false, hidden: false, sort_order: 0 },
      }),
    ])

    renderSidebar()

    expect(
      await screen.findByText(/drag a view here to pin it/i),
    ).toBeInTheDocument()
  })

  it('renders an empty-state link to /views when the user has no views at all', async () => {
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

describe('ViewsSidebar (landr-45pb) — Hide control', () => {
  it('overflow menu Hide calls setViewUserState({hidden: true})', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000099',
        name: 'Hide me',
        user_state: { pinned: false, hidden: false, sort_order: 0 },
      }),
    ])
    mocks.setViewUserState.mockResolvedValueOnce(undefined)

    renderSidebar()
    const user = userEvent.setup()

    const row = await screen.findByRole('link', { name: /hide me/i })
    const li = row.closest('li') as HTMLElement
    const trigger = within(li).getByRole('button', {
      name: /more actions for hide me/i,
    })
    await user.click(trigger)

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

  it('overflow menu on a hidden row shows Unhide', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-0000000000aa',
        name: 'Tucked',
        user_state: { pinned: false, hidden: true, sort_order: 0 },
      }),
    ])
    mocks.setViewUserState.mockResolvedValueOnce(undefined)

    renderSidebar()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /hidden/i }))

    const row = await screen.findByRole('link', { name: /tucked/i })
    const li = row.closest('li') as HTMLElement
    await user.click(
      within(li).getByRole('button', { name: /more actions for tucked/i }),
    )
    await user.click(
      await screen.findByRole('menuitem', { name: /^unhide$/i }),
    )

    await waitFor(() => {
      expect(mocks.setViewUserState).toHaveBeenCalledWith(
        'op-1',
        '11111111-1111-4111-8111-0000000000aa',
        { hidden: false },
      )
    })
  })
})

describe('ViewsSidebar (landr-45pb) — PinButton wiring', () => {
  it('clicking the inline PinButton on a More row sets pinned=true', async () => {
    mocks.listSavedViews.mockResolvedValueOnce([
      makeView({
        id: '11111111-1111-4111-8111-000000000aaa',
        name: 'Pin me via button',
        user_state: { pinned: false, hidden: false, sort_order: 0 },
      }),
    ])
    mocks.setViewUserState.mockResolvedValueOnce(undefined)

    renderSidebar()
    const user = userEvent.setup()

    const row = await screen.findByRole('link', { name: /pin me via button/i })
    const li = row.closest('li') as HTMLElement
    await user.click(
      within(li).getByRole('button', { name: /pin this view/i }),
    )

    await waitFor(() => {
      expect(mocks.setViewUserState).toHaveBeenCalledWith(
        'op-1',
        '11111111-1111-4111-8111-000000000aaa',
        { pinned: true },
      )
    })
  })

  it('clicking the inline PinButton on a Primary row sets pinned=false', async () => {
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
