// landr-7w3s — TableLayout unit tests.
//
// What we assert:
//   - Renders the headers + cells for the columns specified in config.
//   - Clicking a sortable header writes a sort entry into config via
//     onConfigChange (asc → desc → cleared).
//   - Clicking a row fires onRowClick with the underlying BookingItem.
//   - Toggling a checkbox in the column picker writes a new columns
//     array into config via onConfigChange.
//   - Default-visible columns are used when config.columns is missing.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TableLayout } from './TableLayout'
import type { BookingItem } from '@/lib/views-bookings-data'

function makeItem(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'b-1',
    customer_first_name: 'Marie',
    customer_last_name: 'Curie',
    customer_email: 'marie@example.com',
    product_id: 'p-1',
    product_name: 'Tandem flight',
    date_range_start: '2026-07-08',
    date_range_end: '2026-07-08',
    selected_days: [],
    booking_total: '199.00',
    currency: 'EUR',
    current_stage: { code: 'awaiting_general_approval' },
    current_semantic_state: 'pending',
    pickup_location_id: null,
    pickup_location_name: null,
    created_at: '2026-05-21T10:00:00Z',
    ...overrides,
  }
}

const TABLE_CONFIG = {
  layout: 'table',
  filters: [],
  sort: [],
  columns: [
    { source: 'system', key: 'customer_first_name' },
    { source: 'system', key: 'customer_email' },
    { source: 'system', key: 'product_id' },
    { source: 'system', key: 'date_range_start' },
    { source: 'system', key: 'booking_total' },
    { source: 'system', key: 'current_stage' },
  ],
}

describe('TableLayout (landr-7w3s)', () => {
  it('renders one row per item with cells from the configured columns', () => {
    render(
      <TableLayout
        entityType="booking"
        config={TABLE_CONFIG}
        items={[
          makeItem(),
          makeItem({
            id: 'b-2',
            customer_first_name: 'Olaf',
            customer_email: 'olaf@example.com',
          }),
        ]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.getByTestId('view-table-row-b-1')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-row-b-2')).toBeInTheDocument()
    expect(screen.getByText('Marie')).toBeInTheDocument()
    expect(screen.getByText('Olaf')).toBeInTheDocument()
    expect(screen.getByText('marie@example.com')).toBeInTheDocument()
    expect(screen.getByText('olaf@example.com')).toBeInTheDocument()
    // Multiple rows share the same product — use getAllByText.
    expect(screen.getAllByText('Tandem flight').length).toBeGreaterThanOrEqual(2)
  })

  it('uses the default-visible column set when config.columns is missing', () => {
    render(
      <TableLayout
        entityType="booking"
        config={{ layout: 'table', filters: [], sort: [] }}
        items={[makeItem()]}
        onConfigChange={() => {}}
      />,
    )
    // Default visible: first name, email, product, start date, total, stage.
    expect(screen.getByTestId('view-table-header-customer_first_name')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-header-customer_email')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-header-product_id')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-header-date_range_start')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-header-booking_total')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-header-current_stage')).toBeInTheDocument()
    // Not-default fields are absent.
    expect(screen.queryByTestId('view-table-header-currency')).not.toBeInTheDocument()
  })

  it('renders empty state when no items and the colSpan keeps the row visible', () => {
    render(
      <TableLayout
        entityType="booking"
        config={TABLE_CONFIG}
        items={[]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
  })

  it('clicking a sortable header asc → desc → clears, persisting via onConfigChange', async () => {
    const onConfigChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TableLayout
        entityType="booking"
        config={TABLE_CONFIG}
        items={[makeItem()]}
        onConfigChange={onConfigChange}
      />,
    )

    await user.click(screen.getByTestId('view-table-sort-customer_first_name'))
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: [{ source: 'system', key: 'customer_first_name', dir: 'asc' }],
      }),
    )

    // Simulate the parent passing the new config back in for the next click.
    onConfigChange.mockClear()
    render(
      <TableLayout
        entityType="booking"
        config={{
          ...TABLE_CONFIG,
          sort: [{ source: 'system', key: 'customer_first_name', dir: 'asc' }],
        }}
        items={[makeItem()]}
        onConfigChange={onConfigChange}
      />,
    )
    const headerBtns = screen.getAllByTestId('view-table-sort-customer_first_name')
    await user.click(headerBtns[headerBtns.length - 1])
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sort: [{ source: 'system', key: 'customer_first_name', dir: 'desc' }],
      }),
    )
  })

  it('row click fires onRowClick with the underlying BookingItem', async () => {
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    const item = makeItem()
    render(
      <TableLayout
        entityType="booking"
        config={TABLE_CONFIG}
        items={[item]}
        onConfigChange={() => {}}
        onRowClick={onRowClick}
      />,
    )
    await user.click(screen.getByTestId('view-table-row-b-1'))
    expect(onRowClick).toHaveBeenCalledWith(item)
  })
})

describe('TableLayout column picker (landr-7w3s)', () => {
  it('toggling a column writes a new columns array via onConfigChange', async () => {
    const onConfigChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TableLayout
        entityType="booking"
        config={TABLE_CONFIG}
        items={[makeItem()]}
        onConfigChange={onConfigChange}
      />,
    )

    await user.click(screen.getByTestId('view-table-column-picker'))
    // Currency is NOT in TABLE_CONFIG; toggling it should add it.
    const currencyToggle = await screen.findByTestId('view-table-column-toggle-currency')
    await user.click(currencyToggle)

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    const callArg = onConfigChange.mock.calls[0][0] as {
      columns: Array<{ source: string; key: string }>
    }
    expect(callArg.columns).toEqual(
      expect.arrayContaining([
        { source: 'system', key: 'customer_first_name' },
        { source: 'system', key: 'currency' },
      ]),
    )
    expect(callArg.columns).toHaveLength(TABLE_CONFIG.columns.length + 1)
  })

  it('toggling a currently-visible column removes it', async () => {
    const onConfigChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TableLayout
        entityType="booking"
        config={TABLE_CONFIG}
        items={[makeItem()]}
        onConfigChange={onConfigChange}
      />,
    )
    await user.click(screen.getByTestId('view-table-column-picker'))
    const emailToggle = await screen.findByTestId('view-table-column-toggle-customer_email')
    await user.click(emailToggle)
    const callArg = onConfigChange.mock.calls[0][0] as {
      columns: Array<{ source: string; key: string }>
    }
    expect(callArg.columns.some((c) => c.key === 'customer_email')).toBe(false)
    expect(callArg.columns).toHaveLength(TABLE_CONFIG.columns.length - 1)
  })
})
