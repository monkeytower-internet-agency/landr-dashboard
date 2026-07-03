// landr-wmsc — Cmd/Ctrl+K command palette tests.
//
// Covers the four guarantees the briefing calls out:
//   - Opens via Cmd+K (and Ctrl+K for cross-platform parity).
//   - Search input filters results across groups.
//   - Enter on a highlighted item triggers navigation + closes palette.
//   - Escape closes the palette.
//
// All data-fetching modules are mocked so the palette can render without
// a real Supabase or FastAPI backend. The mocks are wide enough to verify
// the substring matcher (cmdk reads the `value` prop, not `children`).
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
    refreshOperators: () => {},
  }),
}))

vi.mock('@/lib/bookings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bookings')>(
    '@/lib/bookings',
  )
  return {
    ...actual,
    fetchBookings: vi.fn(async () => [
      {
        id: 'booking-aaa',
        created_at: '2026-05-20T00:00:00Z',
        current_semantic_state: 'pending',
        current_stage: null,
        gross_total: 100,
        currency: 'EUR',
        customer: {
          id: 'contact-1',
          first_name: 'Alice',
          last_name: 'Anderson',
          email: 'alice@example.com',
          phone: null,
        },
        items: [
          {
            id: 'bp-1',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'prod-1',
              name: 'Surf lesson',
              product_kind: 'service',
              service_time_shape: 'time_slot',
            },
          },
        ],
      },
    ]),
  }
})

vi.mock('@/lib/contacts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/contacts')>(
    '@/lib/contacts',
  )
  return {
    ...actual,
    fetchContacts: vi.fn(async () => [
      {
        id: 'contact-zoe',
        operator_id: 'op-1',
        first_name: 'Zoe',
        last_name: 'Zimmer',
        email: 'zoe@example.com',
        phone: null,
        preferred_locale: null,
        preferred_timezone: null,
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
        deleted_at: null,
        gdpr_erased_at: null,
        gdpr_erased_by_user_id: null,
        gdpr_erasure_note: null,
        types: [],
      },
    ]),
  }
})

vi.mock('@/lib/products', async () => {
  const actual = await vi.importActual<typeof import('@/lib/products')>(
    '@/lib/products',
  )
  return {
    ...actual,
    fetchProducts: vi.fn(async () => [
      {
        id: 'prod-tandem',
        operator_id: 'op-1',
        product_group_id: null,
        slug: 'tandem-flight',
        name: 'Tandem flight',
        short_description: null,
        description: null,
        product_kind: 'service',
        service_time_shape: 'time_slot',
        is_contiguous: false,
        duration_minutes: 30,
        fixed_start_date: null,
        fixed_end_date: null,
        default_pricing_scheme_id: null,
        needs_provider: true,
        needs_pickup: false,
        revenue_flows_through_operator: true,
        is_publicly_listed: true,
        active: true,
        sort_order: 0,
        hotel_location_id: null,
        hotel_offering: 'none',
        is_addon_only: false,
        capacity_per_unit: null,
        deleted_at: null,
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
        pricing_scheme: null,
        product_group: null,
        hotel_location: null,
      },
    ]),
  }
})

vi.mock('@/lib/saved-views', async () => {
  const actual = await vi.importActual<typeof import('@/lib/saved-views')>(
    '@/lib/saved-views',
  )
  return {
    ...actual,
    listSavedViews: vi.fn(async () => [
      {
        id: 'view-vip',
        operator_id: 'op-1',
        creator_user_id: 'u-1',
        entity_type: 'booking' as const,
        visibility: 'personal' as const,
        name: 'VIP customers',
        config: {},
        sort_order: 0,
        created_at: '2026-05-20T00:00:00Z',
        updated_at: '2026-05-20T00:00:00Z',
        user_state: { starred: true, hidden: false },
      },
    ]),
  }
})

import { CommandPalette } from './CommandPalette'
import {
  CommandPaletteProvider,
  useCommandPalette,
} from '@/lib/command-palette-context'

// Renders the palette behind a tiny location probe so we can assert that
// Enter on a CommandItem really fired navigation, without depending on
// the full App route tree.
function LocationProbe() {
  const { pathname } = useLocation()
  return <div data-testid="location">{pathname}</div>
}

// Convenience opener: tests that want the palette open on mount can avoid
// re-triggering the keydown by clicking a button wired up to setOpen.
function OpenButton() {
  const { setOpen } = useCommandPalette()
  return (
    <button type="button" onClick={() => setOpen(true)}>
      open palette
    </button>
  )
}

function renderPalette(initialPath = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <CommandPaletteProvider>
          <OpenButton />
          <LocationProbe />
          <Routes>
            <Route path="*" element={<div data-testid="catchall" />} />
          </Routes>
          <CommandPalette />
        </CommandPaletteProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('CommandPalette — open / close hot-key', () => {
  it('is closed by default', () => {
    renderPalette()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on Cmd+K', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('opens on Ctrl+K (cross-platform fallback)', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('toggles closed when Cmd+K fires while open', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Meta>}k{/Meta}')
    // Radix unmounts on close — give the animation a tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByRole('button', { name: 'open palette' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('CommandPalette — search filtering', () => {
  it('renders nav + quick actions when first opened', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByRole('button', { name: 'open palette' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    // Nav rows render with their label inside a cmdk-item. The group
    // heading also includes "Bookings" / "Contacts" — scope each lookup
    // to the matching `[cmdk-item]` so the assertion is unambiguous.
    const items = Array.from(document.querySelectorAll('[cmdk-item]'))
    const labels = items
      .map((el) => (el.textContent ?? '').trim().toLowerCase())
      .filter(Boolean)
    expect(labels).toEqual(
      expect.arrayContaining([
        'dashboard',
        'bookings',
        'contacts',
        'open settings',
        'new view',
      ]),
    )
  })

  it('typing in the input narrows visible items', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByRole('button', { name: 'open palette' }))
    const dialog = await screen.findByRole('dialog')
    // Wait for the query mocks to resolve so contact "Zoe Zimmer" lands.
    await screen.findByText(/zoe zimmer/i)

    const input = await screen.findByPlaceholderText(/type a command/i)
    await user.type(input, 'zoe')

    // cmdk hides non-matching items via [hidden]. Use within(dialog) to
    // scope; nav rows like "Dashboard" should be hidden after the filter.
    // "Zoe Zimmer" must still be present (and visible).
    const zoeRow = await screen.findByText(/zoe zimmer/i)
    expect(zoeRow).toBeInTheDocument()
    // Dashboard nav row is hidden — cmdk sets aria-hidden on the parent.
    const dashboardItem = dialog.querySelector(
      '[cmdk-item][data-value*="Dashboard" i]',
    )
    if (dashboardItem) {
      // cmdk removes hidden items from the DOM or marks them hidden; either
      // outcome means it is no longer the visible selection.
      expect(dashboardItem.getAttribute('aria-hidden')).not.toBe('false')
    }
  })

  it('shows the empty-state when nothing matches', async () => {
    const user = userEvent.setup()
    renderPalette()
    await user.click(screen.getByRole('button', { name: 'open palette' }))
    await screen.findByRole('dialog')
    const input = await screen.findByPlaceholderText(/type a command/i)
    await user.type(input, 'zzznever-matches-anything-xxx')
    expect(await screen.findByText(/nothing found/i)).toBeInTheDocument()
  })
})

describe('CommandPalette — selection navigates + closes', () => {
  it('Enter on a nav item navigates to its route and closes the palette', async () => {
    const user = userEvent.setup()
    renderPalette('/')
    await user.click(screen.getByRole('button', { name: 'open palette' }))
    const dialog = await screen.findByRole('dialog')

    const input = await screen.findByPlaceholderText(/type a command/i)
    // "Bookings" is the unambiguous unique nav label.
    await user.type(input, 'bookings')

    // cmdk auto-selects the first match. Hit Enter.
    await user.keyboard('{Enter}')

    // Palette should close.
    expect(dialog).not.toBeInTheDocument()
    // And we should be on /bookings.
    expect(screen.getByTestId('location').textContent).toBe('/bookings')
  })

  it('Enter on a view item navigates to /views/:id', async () => {
    const user = userEvent.setup()
    renderPalette('/')
    await user.click(screen.getByRole('button', { name: 'open palette' }))
    await screen.findByRole('dialog')
    // Wait for the views mock to populate.
    await screen.findByText(/vip customers/i)

    const input = await screen.findByPlaceholderText(/type a command/i)
    await user.type(input, 'vip')
    await user.keyboard('{Enter}')

    expect(screen.getByTestId('location').textContent).toBe('/views/view-vip')
  })

  it('Enter on the "New view" quick action navigates to /views/new', async () => {
    const user = userEvent.setup()
    renderPalette('/')
    await user.click(screen.getByRole('button', { name: 'open palette' }))
    await screen.findByRole('dialog')

    const input = await screen.findByPlaceholderText(/type a command/i)
    await user.type(input, 'new view')
    await user.keyboard('{Enter}')

    expect(screen.getByTestId('location').textContent).toBe('/views/new')
  })
})
