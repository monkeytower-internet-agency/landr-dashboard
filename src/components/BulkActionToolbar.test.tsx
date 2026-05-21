// landr-lbbj — unit tests for the BulkActionToolbar. The toolbar is a
// presentation component; route-level integration is exercised in the
// GeneralApprovals + Bookings route specs.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BulkActionToolbar } from './BulkActionToolbar'

describe('BulkActionToolbar', () => {
  it('renders nothing when no rows are selected', () => {
    const { container } = render(
      <BulkActionToolbar
        selectedIds={[]}
        onClear={() => {}}
        actions={['approve', 'reject']}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the selection count once at least one row is selected', () => {
    render(
      <BulkActionToolbar
        selectedIds={['a', 'b', 'c']}
        onClear={() => {}}
        actions={['exportCsv']}
      />,
    )
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('singularises the selection count when exactly 1 row is selected', () => {
    render(
      <BulkActionToolbar
        selectedIds={['only-one']}
        onClear={() => {}}
        actions={['exportCsv']}
      />,
    )
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('renders only the buttons listed in `actions`', () => {
    render(
      <BulkActionToolbar
        selectedIds={['x']}
        onClear={() => {}}
        actions={['exportCsv', 'sendReminder']}
      />,
    )
    expect(screen.queryByTestId('bulk-toolbar-approve')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bulk-toolbar-reject')).not.toBeInTheDocument()
    expect(screen.getByTestId('bulk-toolbar-export-csv')).toBeInTheDocument()
    expect(
      screen.getByTestId('bulk-toolbar-send-reminder'),
    ).toBeInTheDocument()
  })

  it('fires the approve handler with the selection on click', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <BulkActionToolbar
        selectedIds={['a', 'b']}
        onClear={() => {}}
        actions={['approve']}
        onApprove={onApprove}
      />,
    )

    await user.click(screen.getByTestId('bulk-toolbar-approve'))
    expect(onApprove).toHaveBeenCalledOnce()
    expect(onApprove).toHaveBeenCalledWith(['a', 'b'])
  })

  it('reject opens a confirm dialog and only fires after Confirm', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <BulkActionToolbar
        selectedIds={['a', 'b']}
        onClear={() => {}}
        actions={['reject']}
        onReject={onReject}
      />,
    )

    // First click opens dialog, does NOT call the handler.
    await user.click(screen.getByTestId('bulk-toolbar-reject'))
    expect(onReject).not.toHaveBeenCalled()
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByText(/this will mark 2 bookings as rejected/i),
    ).toBeInTheDocument()

    // Confirm fires the handler with the selection.
    await user.click(screen.getByTestId('bulk-toolbar-reject-confirm'))
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject).toHaveBeenCalledWith(['a', 'b'])
  })

  it('clear button fires onClear', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(
      <BulkActionToolbar
        selectedIds={['x']}
        onClear={onClear}
        actions={['approve']}
      />,
    )

    await user.click(screen.getByTestId('bulk-toolbar-clear'))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('disables all buttons while busy', () => {
    render(
      <BulkActionToolbar
        selectedIds={['x']}
        onClear={() => {}}
        actions={['approve', 'reject', 'exportCsv', 'sendReminder']}
        busy
      />,
    )
    expect(screen.getByTestId('bulk-toolbar-approve')).toBeDisabled()
    expect(screen.getByTestId('bulk-toolbar-reject')).toBeDisabled()
    expect(screen.getByTestId('bulk-toolbar-export-csv')).toBeDisabled()
    expect(screen.getByTestId('bulk-toolbar-send-reminder')).toBeDisabled()
    expect(screen.getByTestId('bulk-toolbar-clear')).toBeDisabled()
  })

  it('uses the configured testIdPrefix', () => {
    render(
      <BulkActionToolbar
        selectedIds={['x']}
        onClear={() => {}}
        actions={['exportCsv']}
        testIdPrefix="approvals-bulk-toolbar"
      />,
    )
    expect(
      screen.getByTestId('approvals-bulk-toolbar'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('approvals-bulk-toolbar-export-csv'),
    ).toBeInTheDocument()
  })
})
