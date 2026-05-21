// landr-oxlk — right-click → quick-action menu on Bookings rows.
//
// We exercise:
//   - open detail callback fires when the operator picks "Open booking"
//   - copy-link writes window.origin + the caller-supplied path
//   - destructive actions (no-show / cancel) only show when eligible
//
// Tags submenu rendering is covered via the broader integration in
// BookingsTable.test.tsx (where the operator + tag fetch are mocked).
import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { BookingRowContextMenu } from './BookingRowContextMenu'
import type { BookingRow } from '@/lib/bookings'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'bk-1',
    created_at: '2026-05-12T10:30:00.000Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'pending' },
    customer: null,
    items: [],
    tags: [],
    approval_trace: null,
    gross_total: 0,
    currency: 'EUR',
    operator_id: 'op-1',
    ...overrides,
  } as unknown as BookingRow
}

describe('BookingRowContextMenu (landr-oxlk)', () => {
  it('fires onOpenDetail when "Open booking" is selected', async () => {
    const onOpenDetail = vi.fn()
    const row = makeRow()
    render(
      <BookingRowContextMenu
        row={row}
        operatorId="op-1"
        onOpenDetail={onOpenDetail}
        copyLinkPath={(r) => `/bookings?open=${r.id}`}
      >
        <div data-testid="row-target">row body</div>
      </BookingRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await screen.findByTestId('bookings-row-context-open')
    await userEvent.click(screen.getByTestId('bookings-row-context-open'))
    expect(onOpenDetail).toHaveBeenCalledWith(row)
  })

  it('copies the deep link (origin + path) when "Copy link" is selected', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const row = makeRow({ id: 'bk-42' })
    render(
      <BookingRowContextMenu
        row={row}
        operatorId="op-1"
        onOpenDetail={() => {}}
        copyLinkPath={(r) => `/bookings?open=${r.id}`}
      >
        <div data-testid="row-target">row body</div>
      </BookingRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await userEvent.click(
      await screen.findByTestId('bookings-row-context-copy-link'),
    )
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toContain('/bookings?open=bk-42')
  })

  it('hides "Cancel booking" once the row is already cancelled', async () => {
    const row = makeRow({ current_semantic_state: 'cancelled' })
    render(
      <BookingRowContextMenu
        row={row}
        operatorId="op-1"
        onOpenDetail={() => {}}
        copyLinkPath={(r) => `/bookings?open=${r.id}`}
      >
        <div data-testid="row-target">row body</div>
      </BookingRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await screen.findByTestId('bookings-row-context-open')
    expect(
      screen.queryByTestId('bookings-row-context-cancel'),
    ).not.toBeInTheDocument()
  })

  it('shows "Mark as no-show" when an item has already started today', async () => {
    const row = makeRow({
      items: [
        {
          id: 'it-1',
          date_range_start: '2020-01-01',
          date_range_end: '2020-01-01',
          selected_days: [],
        },
      ] as unknown as BookingRow['items'],
    })
    render(
      <BookingRowContextMenu
        row={row}
        operatorId="op-1"
        onOpenDetail={() => {}}
        copyLinkPath={(r) => `/bookings?open=${r.id}`}
      >
        <div data-testid="row-target">row body</div>
      </BookingRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await screen.findByTestId('bookings-row-context-no-show')
  })
})
