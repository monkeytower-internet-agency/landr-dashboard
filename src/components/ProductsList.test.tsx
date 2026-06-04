import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// landr-u34k — the list now reads useAuth() to scope the
// "show add-on products" toggle to the current user (localStorage key
// includes the user id). Mock the auth context so render() works
// outside an AuthProvider.
const __authUser: { current: { id: string } | null } = { current: null }
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: __authUser.current,
    loading: false,
    signOut: async () => {},
  }),
}))

import { ProductsList } from './ProductsList'
import type { ProductRow } from '@/lib/products'

// landr-ssrx — grouping: hotel_room rows render after non-hotel rows,
// bucketed under a "Hotel: <name>" header per parent hotel-location.

function makeRow(overrides: Partial<ProductRow>): ProductRow {
  const base: ProductRow = {
    id: 'r-0',
    operator_id: 'op-1',
    product_group_id: null,
    slug: 'r-0',
    name: 'Row 0',
    name_localized: null,
    short_description: null,
    short_description_localized: null,
    description: null,
    product_kind: 'service',
    service_time_shape: 'days_range',
    is_contiguous: false,
    duration_minutes: null,
    fixed_start_date: null,
    fixed_end_date: null,
    default_pricing_scheme_id: null,
    needs_provider: false,
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
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
    pricing_scheme: null,
    product_group: null,
    hotel_location: null,
  }
  return { ...base, ...overrides }
}

describe('ProductsList — hotel grouping (landr-ssrx)', () => {
  it('renders non-hotel rows first, then bucketed hotel_room rows under their hotel header', () => {
    const rows: ProductRow[] = [
      makeRow({ id: 's-1', name: 'Guided Dive', slug: 'guided-dive' }),
      makeRow({
        id: 'r-1',
        name: 'Single Room',
        slug: 'sol-single',
        product_kind: 'hotel_room',
        hotel_location_id: 'hotel-1',
        hotel_location: { id: 'hotel-1', name: 'Hotel Sol' },
        revenue_flows_through_operator: false,
      }),
      makeRow({
        id: 'r-2',
        name: 'Double Room',
        slug: 'sol-double',
        product_kind: 'hotel_room',
        hotel_location_id: 'hotel-1',
        hotel_location: { id: 'hotel-1', name: 'Hotel Sol' },
        revenue_flows_through_operator: false,
      }),
      makeRow({
        id: 'r-3',
        name: 'Suite',
        slug: 'luna-suite',
        product_kind: 'hotel_room',
        hotel_location_id: 'hotel-2',
        hotel_location: { id: 'hotel-2', name: 'Hotel Luna' },
        revenue_flows_through_operator: false,
      }),
    ]

    render(
      <ProductsList
        rows={rows}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )

    const list = screen.getByRole('listbox')
    // role=presentation on the header <li> means getAllByRole('listitem')
    // skips them — query by tag so we can verify ordering across both.
    const items = list.querySelectorAll('li')
    // Order: Guided Dive (service), [hotel headers + their rooms].
    const labels = Array.from(items).map((li) => li.textContent ?? '')
    // First item is the non-hotel service product.
    expect(labels[0]).toMatch(/guided dive/i)
    // Hotels are sorted alphabetically — Luna before Sol.
    const lunaHeaderIdx = labels.findIndex((l) => /hotel: hotel luna/i.test(l))
    const solHeaderIdx = labels.findIndex((l) => /hotel: hotel sol/i.test(l))
    expect(lunaHeaderIdx).toBeGreaterThanOrEqual(0)
    expect(solHeaderIdx).toBeGreaterThan(lunaHeaderIdx)
    // Each hotel's room rows follow its header.
    const suiteIdx = labels.findIndex((l) => /suite/i.test(l) && !/hotel:/i.test(l))
    expect(suiteIdx).toBe(lunaHeaderIdx + 1)
    const singleIdx = labels.findIndex(
      (l) => /single room/i.test(l) && !/hotel:/i.test(l),
    )
    const doubleIdx = labels.findIndex(
      (l) => /double room/i.test(l) && !/hotel:/i.test(l),
    )
    expect(singleIdx).toBeGreaterThan(solHeaderIdx)
    expect(doubleIdx).toBeGreaterThan(solHeaderIdx)
  })

  it('hotel name is searchable via the filter input', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const rows: ProductRow[] = [
      makeRow({ id: 's-1', name: 'Guided Dive' }),
      makeRow({
        id: 'r-1',
        name: 'Single Room',
        product_kind: 'hotel_room',
        hotel_location_id: 'hotel-1',
        hotel_location: { id: 'hotel-1', name: 'Hotel Sol' },
      }),
    ]
    render(
      <ProductsList
        rows={rows}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )
    const input = screen.getByLabelText(/search products/i)
    await user.type(input, 'sol')
    // Single Room (a hotel_room) survives because its hotel name matches.
    expect(screen.getByText(/single room/i)).toBeInTheDocument()
    expect(screen.queryByText(/guided dive/i)).not.toBeInTheDocument()
  })
})

// landr-u34k — hide is_addon_only=true products from the main list by
// default; the "Show add-on products" toggle reveals them again and the
// preference is persisted per user via localStorage.
describe('ProductsList — addon_only visibility (landr-u34k)', () => {
  beforeEach(() => {
    __authUser.current = { id: 'user-1' }
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
    __authUser.current = null
  })

  function makeRows(): ProductRow[] {
    return [
      makeRow({ id: 'p-main', name: 'Tandem Flight' }),
      makeRow({
        id: 'p-addon',
        name: 'Video Package',
        is_addon_only: true,
      }),
    ]
  }

  it('hides addon_only rows by default and shows them after the toggle is enabled', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <ProductsList
        rows={makeRows()}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )

    // Tandem Flight is visible; Video Package (addon_only) is hidden.
    expect(screen.getByText(/tandem flight/i)).toBeInTheDocument()
    expect(screen.queryByText(/video package/i)).not.toBeInTheDocument()

    // Flip the toggle — the addon_only row appears.
    const toggle = screen.getByLabelText(/show add-on products/i)
    await user.click(toggle)
    expect(screen.getByText(/video package/i)).toBeInTheDocument()
    expect(screen.getByText(/tandem flight/i)).toBeInTheDocument()
  })

  it('persists the toggle in localStorage scoped to the current user', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const { unmount } = render(
      <ProductsList
        rows={makeRows()}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )

    const toggle = screen.getByLabelText(/show add-on products/i)
    await user.click(toggle)
    expect(
      window.localStorage.getItem('landr.dashboard.productsShowAddons.user-1'),
    ).toBe('1')
    unmount()

    // Remount as the same user — the preference is restored and the
    // addon_only row is visible without re-clicking the toggle.
    render(
      <ProductsList
        rows={makeRows()}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )
    expect(screen.getByText(/video package/i)).toBeInTheDocument()
  })

  it('disables the toggle when there are no addon_only rows', () => {
    render(
      <ProductsList
        rows={[makeRow({ id: 'p-main', name: 'Tandem Flight' })]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )
    const toggle = screen.getByLabelText(/show add-on products/i) as HTMLInputElement
    expect(toggle).toBeDisabled()
  })
})

// landr-sydf — full chip is the click target (not just the name). Click
// anywhere on the chip — including the summary line beneath the name —
// and onSelect fires once. Opening the row-actions menu must NOT fire
// onSelect (stopPropagation on the action cell).
describe('ProductsList — chip click target (landr-sydf)', () => {
  it('fires onSelect when clicking the chip body (not just the name)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ProductsList
        rows={[makeRow({ id: 'p-1', name: 'Tandem Flight' })]}
        selectedId={null}
        onSelect={onSelect}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )
    const option = screen.getByRole('option', { name: /tandem flight/i })
    // Click the entire chip — assert onSelect fires.
    await user.click(option)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('p-1')
  })

  it('clicking the row-actions menu trigger does NOT fire onSelect', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ProductsList
        rows={[makeRow({ id: 'p-1', name: 'Tandem Flight' })]}
        selectedId={null}
        onSelect={onSelect}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )
    const trigger = screen.getByRole('button', { name: /row actions/i })
    await user.click(trigger)
    expect(onSelect).not.toHaveBeenCalled()
  })

  // landr-s1mr — friendly empty-state card with a CTA wired to onCreate
  // when the operator has zero products.
  describe('empty state (landr-s1mr)', () => {
    it('renders the shared EmptyState card when rows is empty', () => {
      render(
        <ProductsList
          rows={[]}
          selectedId={null}
          onSelect={() => {}}
          onCreate={() => {}}
          onDuplicate={() => {}}
          duplicatingId={null}
        />,
      )
      expect(screen.getByTestId('products-empty-state')).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /no products yet/i }),
      ).toBeInTheDocument()
      // The search input is suppressed — the friendly card replaces the
      // full list chrome until the operator creates something.
      expect(
        screen.queryByPlaceholderText(/search products/i),
      ).not.toBeInTheDocument()
    })

    // landr-sj2z — the empty state must NOT render while isLoading is true.
    // The skeleton list takes over so the operator sees pulsing chips
    // rather than the EmptyState flashing before the first fetch lands.
    it('does NOT render the EmptyState while isLoading is true (skeleton wins)', () => {
      render(
        <ProductsList
          rows={[]}
          selectedId={null}
          onSelect={() => {}}
          onCreate={() => {}}
          onDuplicate={() => {}}
          duplicatingId={null}
          isLoading
        />,
      )
      expect(screen.queryByTestId('products-empty-state')).not.toBeInTheDocument()
      expect(screen.getByTestId('products-skeleton-row-0')).toBeInTheDocument()
    })

    it('clicking the CTA in the empty state fires onCreate', async () => {
      const { default: userEvent } = await import(
        '@testing-library/user-event'
      )
      const user = userEvent.setup()
      const onCreate = vi.fn()
      render(
        <ProductsList
          rows={[]}
          selectedId={null}
          onSelect={() => {}}
          onCreate={onCreate}
          onDuplicate={() => {}}
          duplicatingId={null}
        />,
      )
      await user.click(screen.getByRole('button', { name: /new product/i }))
      expect(onCreate).toHaveBeenCalledTimes(1)
    })
  })
})

// landr-7zc5.2 — Draft badge, publish toggle, and preview link.
describe('ProductsList — draft badge + publish toggle + preview link (landr-7zc5.2)', () => {
  it('renders a Draft badge on rows where is_publicly_listed=false', () => {
    const rows = [
      makeRow({ id: 'p-draft', name: 'Draft Product', is_publicly_listed: false }),
      makeRow({ id: 'p-pub', name: 'Published Product', is_publicly_listed: true }),
    ]
    render(
      <ProductsList
        rows={rows}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
      />,
    )
    expect(screen.getByTestId('draft-badge-p-draft')).toBeInTheDocument()
    expect(screen.queryByTestId('draft-badge-p-pub')).not.toBeInTheDocument()
  })

  it('calls onTogglePublish with the row when Publish is selected from the actions menu', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onTogglePublish = vi.fn()
    const row = makeRow({ id: 'p-draft', name: 'Draft Product', is_publicly_listed: false })
    render(
      <ProductsList
        rows={[row]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
        onTogglePublish={onTogglePublish}
        togglingPublishId={null}
      />,
    )
    // Open the actions dropdown.
    await user.click(screen.getByRole('button', { name: /row actions/i }))
    // Click the Publish item.
    await user.click(screen.getByRole('menuitem', { name: /publish/i }))
    expect(onTogglePublish).toHaveBeenCalledWith(row)
  })

  it('calls onTogglePublish with the row when Unpublish is selected from the actions menu', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onTogglePublish = vi.fn()
    const row = makeRow({ id: 'p-pub', name: 'Published Product', is_publicly_listed: true })
    render(
      <ProductsList
        rows={[row]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
        onTogglePublish={onTogglePublish}
        togglingPublishId={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: /row actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /unpublish/i }))
    expect(onTogglePublish).toHaveBeenCalledWith(row)
  })

  it('renders a Preview link only on draft rows when both tokens are provided', () => {
    const rows = [
      makeRow({ id: 'p-draft', name: 'Draft Product', is_publicly_listed: false }),
      makeRow({ id: 'p-pub', name: 'Published Product', is_publicly_listed: true }),
    ]
    render(
      <ProductsList
        rows={rows}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
        widgetToken="tok-live"
        widgetPreviewToken="tok-preview"
      />,
    )
    // Preview link present for draft row.
    expect(screen.getByTestId('preview-link-p-draft')).toBeInTheDocument()
    const link = screen.getByTestId('preview-link-p-draft') as HTMLAnchorElement
    expect(link.href).toContain('bw-dev.landr.de')
    expect(link.href).toContain('w=tok-live')
    expect(link.href).toContain('preview_token=tok-preview')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
    // Preview link absent for published row.
    expect(screen.queryByTestId('preview-link-p-pub')).not.toBeInTheDocument()
  })

  it('does not render a Preview link when widgetPreviewToken is absent', () => {
    const row = makeRow({ id: 'p-draft', name: 'Draft Product', is_publicly_listed: false })
    render(
      <ProductsList
        rows={[row]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        duplicatingId={null}
        widgetToken="tok-live"
        // no widgetPreviewToken
      />,
    )
    expect(screen.queryByTestId('preview-link-p-draft')).not.toBeInTheDocument()
  })
})
