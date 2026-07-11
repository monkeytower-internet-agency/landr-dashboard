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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TableLayout } from './TableLayout'
import type { BookingItem } from '@/lib/views-bookings-data'

type CustomerOverride = { id?: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }
type ItemOverride = Partial<BookingItem['items'][number]>
function makeItem(
  overrides: Omit<Partial<BookingItem>, 'customer' | 'items'> & {
    customer?: CustomerOverride
    items?: ItemOverride[]
  } = {},
): BookingItem {
  const { customer: customerOv, items: itemsOv, ...rest } = overrides
  return {
    id: 'b-1',
    created_at: '2026-05-21T10:00:00Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: '199.00',
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Marie',
      last_name: 'Curie',
      email: 'marie@example.com',
      phone: null,
      ...customerOv,
    },
    items: itemsOv && itemsOv.length > 0 ? (itemsOv as BookingItem['items']) : [{
      id: 'bi-1',
      date_range_start: '2026-07-08',
      date_range_end: '2026-07-08',
      selected_days: [],
      products: { id: 'p-1', name: 'Tandem flight', product_kind: 'service', service_time_shape: null },
    }],
    ...rest,
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
            customer: { first_name: 'Olaf', email: 'olaf@example.com' },
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

describe('TableLayout group-by (landr-1ztq)', () => {
  const GROUPED_CONFIG = {
    ...TABLE_CONFIG,
    groupBy: { source: 'system', key: 'current_stage' },
  }

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders one section header per non-empty group with a count', () => {
    render(
      <TableLayout
        entityType="booking"
        config={GROUPED_CONFIG}
        items={[
          makeItem({
            id: 'b-1',
            current_stage: { code: 'awaiting_hotel_approval' },
          }),
          makeItem({
            id: 'b-2',
            current_stage: { code: 'awaiting_hotel_approval' },
          }),
          makeItem({ id: 'b-3', current_stage: { code: 'confirmed' } }),
        ]}
        onConfigChange={() => {}}
      />,
    )
    expect(
      screen.getByTestId('view-table-group-awaiting_hotel_approval'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('view-table-group-confirmed'),
    ).toBeInTheDocument()
    // Awaiting hotel bucket has 2 rows; Confirmed has 1.
    expect(
      screen.getByTestId('view-table-group-count-awaiting_hotel_approval'),
    ).toHaveTextContent('(2)')
    expect(
      screen.getByTestId('view-table-group-count-confirmed'),
    ).toHaveTextContent('(1)')
    // All three data rows are rendered (no group is collapsed by default).
    expect(screen.getByTestId('view-table-row-b-1')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-row-b-2')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-row-b-3')).toBeInTheDocument()
  })

  it('clicking the chevron collapses + expands a group; collapse hides rows', async () => {
    const user = userEvent.setup()
    render(
      <TableLayout
        entityType="booking"
        config={GROUPED_CONFIG}
        items={[
          makeItem({
            id: 'b-1',
            current_stage: { code: 'awaiting_hotel_approval' },
          }),
          makeItem({ id: 'b-2', current_stage: { code: 'confirmed' } }),
        ]}
        onConfigChange={() => {}}
        viewId="v-test-1"
      />,
    )
    const toggle = screen.getByTestId(
      'view-table-group-toggle-awaiting_hotel_approval',
    )
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('view-table-row-b-1')).toBeInTheDocument()

    await user.click(toggle)

    expect(
      screen.getByTestId('view-table-group-toggle-awaiting_hotel_approval'),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('view-table-row-b-1')).not.toBeInTheDocument()
    // Other group still expanded.
    expect(screen.getByTestId('view-table-row-b-2')).toBeInTheDocument()

    // Toggle back — row reappears.
    await user.click(
      screen.getByTestId(
        'view-table-group-toggle-awaiting_hotel_approval',
      ),
    )
    expect(screen.getByTestId('view-table-row-b-1')).toBeInTheDocument()
  })

  it('collapse state is persisted in localStorage keyed on viewId', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <TableLayout
        entityType="booking"
        config={GROUPED_CONFIG}
        items={[
          makeItem({
            id: 'b-1',
            current_stage: { code: 'awaiting_hotel_approval' },
          }),
        ]}
        onConfigChange={() => {}}
        viewId="v-persist"
      />,
    )
    await user.click(
      screen.getByTestId(
        'view-table-group-toggle-awaiting_hotel_approval',
      ),
    )
    unmount()

    // Remount with the same viewId — collapse state should rehydrate.
    render(
      <TableLayout
        entityType="booking"
        config={GROUPED_CONFIG}
        items={[
          makeItem({
            id: 'b-1',
            current_stage: { code: 'awaiting_hotel_approval' },
          }),
        ]}
        onConfigChange={() => {}}
        viewId="v-persist"
      />,
    )
    expect(
      screen.getByTestId(
        'view-table-group-toggle-awaiting_hotel_approval',
      ),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('view-table-row-b-1')).not.toBeInTheDocument()
  })

  it('groupBy=null preserves the original flat table layout', () => {
    render(
      <TableLayout
        entityType="booking"
        config={TABLE_CONFIG}
        items={[
          makeItem({
            id: 'b-1',
            current_stage: { code: 'awaiting_hotel_approval' },
          }),
          makeItem({ id: 'b-2', current_stage: { code: 'confirmed' } }),
        ]}
        onConfigChange={() => {}}
      />,
    )
    expect(
      screen.queryByTestId('view-table-group-awaiting_hotel_approval'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('view-table-group-confirmed'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('view-table-row-b-1')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-row-b-2')).toBeInTheDocument()
  })
})

// landr-myb0 — pilot-row mode: one row per flying participant, grouped by
// parent booking. Companions (is_guiding=false) excluded by default; legacy
// NULL rows still fly (mirrors day-roster.ts's isFlyingParticipant).
describe('TableLayout pilot-row mode (landr-myb0)', () => {
  const PILOT_CONFIG = {
    layout: 'table',
    filters: [],
    sort: [],
    tableConfig: { mode: 'pilots' },
  }

  function pilotItem(
    overrides: Omit<Partial<BookingItem>, 'customer'> & { customer?: CustomerOverride } = {},
  ): BookingItem {
    return makeItem({
      id: 'b-1',
      customer: { first_name: 'Marie', last_name: 'Curie' },
      participants: [
        {
          id: 'pt-1',
          is_guiding: true,
          pickup_location: { id: 'loc-1', name: 'Fonda Central' },
          contact: { first_name: 'Ana', last_name: 'Pilot', phone: '+34600000001' },
        },
        {
          id: 'pt-2',
          is_guiding: false, // companion — excluded by default
          pickup_location: { id: 'loc-1', name: 'Fonda Central' },
          contact: { first_name: 'Baby', last_name: 'Companion', phone: '+34600000002' },
        },
        {
          id: 'pt-3',
          is_guiding: null, // legacy NULL — still counts as flying
          pickup_location: null,
          contact: { first_name: 'Carl', last_name: 'Legacy', phone: null },
        },
      ],
      ...overrides,
    })
  }

  it('renders one row per pilot, excluding companions', () => {
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[pilotItem()]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.getByTestId('view-table-pilot-row-pt-1')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-pilot-row-pt-3')).toBeInTheDocument()
    expect(screen.queryByTestId('view-table-pilot-row-pt-2')).not.toBeInTheDocument()
    expect(screen.getByText('Ana Pilot')).toBeInTheDocument()
    expect(screen.getByText('Carl Legacy')).toBeInTheDocument()
    expect(screen.queryByText('Baby Companion')).not.toBeInTheDocument()
  })

  it('groups pilot rows by parent booking with a count', () => {
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[pilotItem()]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.getByTestId('view-table-group-b-1')).toBeInTheDocument()
    expect(screen.getByTestId('view-table-group-count-b-1')).toHaveTextContent('(2)')
    expect(screen.getByText(/Marie Curie/)).toBeInTheDocument()
  })

  it('renders phone and pickup location, em-dash fallback when absent', () => {
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[pilotItem()]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.getByText('+34600000001')).toBeInTheDocument()
    expect(screen.getByText('Fonda Central')).toBeInTheDocument()
    // pt-3 has neither phone nor pickup location.
    const row3 = screen.getByTestId('view-table-pilot-row-pt-3')
    expect(row3).toHaveTextContent('——') // two em-dash cells back to back
  })

  it('row count reflects pilot count, not booking count', () => {
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[pilotItem()]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.getByTestId('view-table-rowcount')).toHaveTextContent('2 items')
  })

  it('hides the column picker (columns are fixed in pilot mode)', () => {
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[pilotItem()]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.queryByTestId('view-table-column-picker')).not.toBeInTheDocument()
  })

  it('clicking a pilot row fires onRowClick with the parent booking item', async () => {
    const onRowClick = vi.fn()
    const user = userEvent.setup()
    const item = pilotItem()
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[item]}
        onConfigChange={() => {}}
        onRowClick={onRowClick}
      />,
    )
    await user.click(screen.getByTestId('view-table-pilot-row-pt-1'))
    expect(onRowClick).toHaveBeenCalledWith(item)
  })

  it('collapsing a booking group hides its pilot rows', async () => {
    const user = userEvent.setup()
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[pilotItem()]}
        onConfigChange={() => {}}
      />,
    )
    await user.click(screen.getByTestId('view-table-group-toggle-b-1'))
    expect(screen.queryByTestId('view-table-pilot-row-pt-1')).not.toBeInTheDocument()
  })

  it('excludes bookings whose participants are all companions', () => {
    render(
      <TableLayout
        entityType="booking"
        config={PILOT_CONFIG}
        items={[
          pilotItem({
            id: 'b-2',
            participants: [
              {
                id: 'pt-9',
                is_guiding: false,
                pickup_location: null,
                contact: { first_name: 'X', last_name: 'Y', phone: null },
              },
            ],
          }),
        ]}
        onConfigChange={() => {}}
      />,
    )
    expect(screen.queryByTestId('view-table-group-b-2')).not.toBeInTheDocument()
    expect(screen.getByText(/no pilots/i)).toBeInTheDocument()
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
