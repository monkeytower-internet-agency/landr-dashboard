// landr-pugm — render-level checks for the sort dropdown + kind chip bar.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductsFilters } from './ProductsFilters'
import type { ProductKindCounts } from '@/lib/products'
import type { ProductKind } from '@/lib/products'
import type { ProductsSort } from '@/lib/products-sort'

const SOME_COUNTS: ProductKindCounts = {
  service: 3,
  subscription: 2,
  hotel_room: 4,
  physical_good: 1,
  digital_good: 0,
  gift_card: 5,
}

function makeFiltersApi(kinds: ProductKind[] = []) {
  return {
    filters: { kinds },
    setFilters: vi.fn(),
    toggleKind: vi.fn(),
    clearAll: vi.fn(),
  }
}

function makeSortApi(sort: ProductsSort = 'created_at_desc') {
  return {
    sort,
    setSort: vi.fn(),
  }
}

describe('ProductsFilters', () => {
  it('renders all six kind chips with count badges alongside the sort dropdown', () => {
    render(
      <ProductsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi()}
        kindCounts={SOME_COUNTS}
      />,
    )
    expect(screen.getByText('Service (3)')).toBeInTheDocument()
    expect(screen.getByText('Subscription (2)')).toBeInTheDocument()
    expect(screen.getByText('Hotel room (4)')).toBeInTheDocument()
    expect(screen.getByText('Physical good (1)')).toBeInTheDocument()
    expect(screen.getByText('Digital good (0)')).toBeInTheDocument()
    expect(screen.getByText('Gift card (5)')).toBeInTheDocument()
    expect(screen.getByTestId('products-filters-sort-select')).toHaveValue(
      'created_at_desc',
    )
  })

  it('toggles the active state on a chip with aria-pressed', async () => {
    const filtersApi = makeFiltersApi(['service'])
    render(
      <ProductsFilters
        sortApi={makeSortApi()}
        filtersApi={filtersApi}
        kindCounts={SOME_COUNTS}
      />,
    )
    expect(screen.getByTestId('products-filters-kind-service')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getByTestId('products-filters-kind-hotel_room'),
    ).toHaveAttribute('aria-pressed', 'false')

    const user = userEvent.setup()
    await user.click(screen.getByTestId('products-filters-kind-hotel_room'))
    expect(filtersApi.toggleKind).toHaveBeenCalledWith('hotel_room')
  })

  it('calls setSort when the dropdown changes', async () => {
    const sortApi = makeSortApi('created_at_desc')
    render(
      <ProductsFilters
        sortApi={sortApi}
        filtersApi={makeFiltersApi()}
        kindCounts={SOME_COUNTS}
      />,
    )
    const user = userEvent.setup()
    await user.selectOptions(
      screen.getByTestId('products-filters-sort-select'),
      'name_asc',
    )
    expect(sortApi.setSort).toHaveBeenCalledWith('name_asc')
  })

  it('shows a Clear filters button only when chips are active', () => {
    const { rerender } = render(
      <ProductsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi([])}
        kindCounts={SOME_COUNTS}
      />,
    )
    expect(
      screen.queryByTestId('products-filters-clear-all'),
    ).not.toBeInTheDocument()

    rerender(
      <ProductsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi(['service'])}
        kindCounts={SOME_COUNTS}
      />,
    )
    expect(
      screen.getByTestId('products-filters-clear-all'),
    ).toBeInTheDocument()
  })

  // landr-knz3 — zero-count chips are disabled, advertise it accessibly,
  // expose a tooltip via title, and don't fire toggleKind when clicked.
  it('renders a zero-count chip as disabled with a tooltip', () => {
    render(
      <ProductsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi()}
        kindCounts={SOME_COUNTS}
      />,
    )
    const zeroChip = screen.getByTestId('products-filters-kind-digital_good')
    expect(zeroChip).toBeDisabled()
    expect(zeroChip).toHaveAttribute(
      'title',
      expect.stringMatching(/digital good/i),
    )
    expect(zeroChip).toHaveTextContent('Digital good (0)')

    const liveChip = screen.getByTestId('products-filters-kind-service')
    expect(liveChip).not.toBeDisabled()
    expect(liveChip).toHaveTextContent('Service (3)')
  })

  it('does not call toggleKind when a zero-count chip is clicked', async () => {
    const filtersApi = makeFiltersApi()
    render(
      <ProductsFilters
        sortApi={makeSortApi()}
        filtersApi={filtersApi}
        kindCounts={SOME_COUNTS}
      />,
    )
    // Disabled buttons swallow pointer events — opt out so the dispatched
    // click is delivered and we can confirm React still skips onClick.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByTestId('products-filters-kind-digital_good'))
    expect(filtersApi.toggleKind).not.toHaveBeenCalled()
  })

  // landr-knz3 — when no counts are provided (initial render before the
  // query resolves) every chip is treated as zero-count, so the UI stays
  // visibly inert until the data arrives rather than flashing 'live'
  // chips that would briefly mislead the operator.
  it('treats missing kindCounts as all-zero (chips disabled)', () => {
    render(
      <ProductsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi()}
      />,
    )
    expect(screen.getByTestId('products-filters-kind-service')).toBeDisabled()
    expect(
      screen.getByTestId('products-filters-kind-service'),
    ).toHaveTextContent('Service (0)')
  })
})
