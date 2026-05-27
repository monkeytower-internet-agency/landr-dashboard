// landr-oxlk — right-click → Open / Approve / Reject on a Pending
// Approvals row. The component is presentational; both decision actions
// defer to the parent's existing AlertDialog handler so we just assert
// the right callback fires with the right decision.
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApprovalRowContextMenu } from './ApprovalRowContextMenu'
import type { BookingRow } from '@/lib/bookings'

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'bk-1',
    created_at: '2026-05-12T10:30:00.000Z',
    current_semantic_state: 'awaiting_general_approval',
    current_stage: { code: 'awaiting_general_approval' },
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

describe('ApprovalRowContextMenu (landr-oxlk)', () => {
  it('fires onOpenDetail when "Open booking" is selected', async () => {
    const onOpenDetail = vi.fn()
    const row = makeRow()
    render(
      <ApprovalRowContextMenu
        row={row}
        onOpenDetail={onOpenDetail}
        onDecide={() => {}}
      >
        <div data-testid="row-target">row body</div>
      </ApprovalRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await userEvent.click(
      await screen.findByTestId('approvals-row-context-open'),
    )
    expect(onOpenDetail).toHaveBeenCalledWith(row)
  })

  it('forwards approve / reject decisions to onDecide', async () => {
    const onDecide = vi.fn()
    const row = makeRow()
    render(
      <ApprovalRowContextMenu
        row={row}
        onOpenDetail={() => {}}
        onDecide={onDecide}
      >
        <div data-testid="row-target">row body</div>
      </ApprovalRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await userEvent.click(
      await screen.findByTestId('approvals-row-context-approve'),
    )
    expect(onDecide).toHaveBeenLastCalledWith(row, 'approve')

    // Re-open and pick Reject.
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await userEvent.click(
      await screen.findByTestId('approvals-row-context-reject'),
    )
    expect(onDecide).toHaveBeenLastCalledWith(row, 'reject')
  })
})
