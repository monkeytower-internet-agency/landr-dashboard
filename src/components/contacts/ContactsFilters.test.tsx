// landr-pqk — render-level checks for the sort dropdown + type chip bar.
// landr-knz3 — extended with count badge + disable-when-zero coverage.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContactsFilters } from './ContactsFilters'
import type { ContactType } from '@/lib/contacts-filters'
import type { ContactsSort } from '@/lib/contacts-sort'
import type { ContactTypeCounts } from '@/lib/contacts'

const SOME_COUNTS: ContactTypeCounts = {
  customer: 3,
  attendee: 5,
  employee: 1,
  agent: 2,
}

function makeFiltersApi(types: ContactType[] = [], includeErased = false) {
  return {
    filters: { types, includeErased },
    setFilters: vi.fn(),
    toggleType: vi.fn(),
    setIncludeErased: vi.fn(),
    clearAll: vi.fn(),
  }
}

function makeSortApi(sort: ContactsSort = 'created_at_desc') {
  return {
    sort,
    setSort: vi.fn(),
  }
}

describe('ContactsFilters', () => {
  it('renders all four type chips with count badges alongside the sort dropdown', () => {
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi()}
        typeCounts={SOME_COUNTS}
      />,
    )
    expect(screen.getByText('Customer (3)')).toBeInTheDocument()
    expect(screen.getByText('Attendee (5)')).toBeInTheDocument()
    expect(screen.getByText('Employee (1)')).toBeInTheDocument()
    expect(screen.getByText('Agent (2)')).toBeInTheDocument()
    expect(screen.getByTestId('contacts-filters-sort-select')).toHaveValue(
      'created_at_desc',
    )
  })

  it('toggles the active state on a chip with aria-pressed', async () => {
    const filtersApi = makeFiltersApi(['employee'])
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={filtersApi}
        typeCounts={SOME_COUNTS}
      />,
    )
    expect(screen.getByTestId('contacts-filters-type-employee')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('contacts-filters-type-customer')).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    const user = userEvent.setup()
    await user.click(screen.getByTestId('contacts-filters-type-customer'))
    expect(filtersApi.toggleType).toHaveBeenCalledWith('customer')
  })

  it('calls setSort when the dropdown changes', async () => {
    const sortApi = makeSortApi('created_at_desc')
    render(
      <ContactsFilters
        sortApi={sortApi}
        filtersApi={makeFiltersApi()}
        typeCounts={SOME_COUNTS}
      />,
    )
    const user = userEvent.setup()
    await user.selectOptions(
      screen.getByTestId('contacts-filters-sort-select'),
      'name_asc',
    )
    expect(sortApi.setSort).toHaveBeenCalledWith('name_asc')
  })

  it('shows a Clear filters button only when chips are active', () => {
    const { rerender } = render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi([])}
        typeCounts={SOME_COUNTS}
      />,
    )
    expect(
      screen.queryByTestId('contacts-filters-clear-all'),
    ).not.toBeInTheDocument()

    rerender(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi(['customer'])}
        typeCounts={SOME_COUNTS}
      />,
    )
    expect(
      screen.getByTestId('contacts-filters-clear-all'),
    ).toBeInTheDocument()
  })

  // landr-dp45 — "Show erased contacts" toggle.
  it('renders the Show erased contacts toggle, unchecked by default', () => {
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi([], false)}
      />,
    )
    const toggle = screen.getByTestId('contacts-filters-show-erased')
    expect(toggle).toBeInTheDocument()
    expect(toggle).not.toBeChecked()
    expect(screen.getByText(/show erased contacts/i)).toBeInTheDocument()
  })

  it('reflects an enabled includeErased state', () => {
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi([], true)}
      />,
    )
    expect(screen.getByTestId('contacts-filters-show-erased')).toBeChecked()
  })

  it('calls setIncludeErased(true) when the toggle is checked', async () => {
    const filtersApi = makeFiltersApi([], false)
    render(
      <ContactsFilters sortApi={makeSortApi()} filtersApi={filtersApi} />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByTestId('contacts-filters-show-erased'))
    expect(filtersApi.setIncludeErased).toHaveBeenCalledWith(true)
  })

  it('calls setIncludeErased(false) when the toggle is unchecked', async () => {
    const filtersApi = makeFiltersApi([], true)
    render(
      <ContactsFilters sortApi={makeSortApi()} filtersApi={filtersApi} />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByTestId('contacts-filters-show-erased'))
    expect(filtersApi.setIncludeErased).toHaveBeenCalledWith(false)

  // landr-knz3 — zero-count chips are disabled, advertise it accessibly,
  // expose a tooltip via title, and don't fire toggleType when clicked.
  it('renders a zero-count chip as disabled with a tooltip', () => {
    const counts: ContactTypeCounts = {
      customer: 0,
      attendee: 4,
      employee: 0,
      agent: 1,
    }
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi()}
        typeCounts={counts}
      />,
    )
    const zeroChip = screen.getByTestId('contacts-filters-type-customer')
    expect(zeroChip).toBeDisabled()
    expect(zeroChip).toHaveAttribute('title', expect.stringMatching(/customer/i))
    expect(zeroChip).toHaveTextContent('Customer (0)')

    const liveChip = screen.getByTestId('contacts-filters-type-attendee')
    expect(liveChip).not.toBeDisabled()
    expect(liveChip).toHaveTextContent('Attendee (4)')
  })

  it('does not call toggleType when a zero-count chip is clicked', async () => {
    const counts: ContactTypeCounts = {
      customer: 0,
      attendee: 4,
      employee: 0,
      agent: 1,
    }
    const filtersApi = makeFiltersApi()
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={filtersApi}
        typeCounts={counts}
      />,
    )
    // Disabled buttons swallow pointer events — opt out so the dispatched
    // click is delivered and we can confirm React still skips onClick.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByTestId('contacts-filters-type-customer'))
    expect(filtersApi.toggleType).not.toHaveBeenCalled()
  })

  // landr-knz3 — when no counts are provided (initial render before the
  // query resolves) every chip is treated as zero-count, so the UI stays
  // visibly inert until the data arrives rather than flashing 'live'
  // chips that would briefly mislead the operator.
  it('treats missing typeCounts as all-zero (chips disabled)', () => {
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi()}
      />,
    )
    expect(screen.getByTestId('contacts-filters-type-customer')).toBeDisabled()
    expect(screen.getByTestId('contacts-filters-type-customer')).toHaveTextContent(
      'Customer (0)',
    )
  })
})
