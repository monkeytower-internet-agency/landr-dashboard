// landr-pqk — render-level checks for the sort dropdown + type chip bar.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContactsFilters } from './ContactsFilters'
import type { ContactType } from '@/lib/contacts-filters'
import type { ContactsSort } from '@/lib/contacts-sort'

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
  it('renders all four type chips alongside the sort dropdown', () => {
    render(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi()}
      />,
    )
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('Attendee')).toBeInTheDocument()
    expect(screen.getByText('Employee')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByTestId('contacts-filters-sort-select')).toHaveValue(
      'created_at_desc',
    )
  })

  it('toggles the active state on a chip with aria-pressed', async () => {
    const filtersApi = makeFiltersApi(['employee'])
    render(
      <ContactsFilters sortApi={makeSortApi()} filtersApi={filtersApi} />,
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
      <ContactsFilters sortApi={sortApi} filtersApi={makeFiltersApi()} />,
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
      />,
    )
    expect(
      screen.queryByTestId('contacts-filters-clear-all'),
    ).not.toBeInTheDocument()

    rerender(
      <ContactsFilters
        sortApi={makeSortApi()}
        filtersApi={makeFiltersApi(['customer'])}
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
  })
})
