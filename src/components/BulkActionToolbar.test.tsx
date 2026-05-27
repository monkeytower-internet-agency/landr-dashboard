// landr-lbbj — unit tests for the BulkActionToolbar. The toolbar is a
// presentation component; route-level integration is exercised in the
// GeneralApprovals + Bookings route specs.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// landr-uqr2 — the tag action embeds a TagPicker, which fetches the
// operator's tag list via fetchTags(). Mock it so the popover content
// can render without a real API call.
vi.mock('@/lib/tags', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/tags')>()
  return {
    ...actual,
    fetchTags: vi.fn().mockResolvedValue([
      {
        id: 't1',
        operator_id: 'op-1',
        name: 'VIP',
        color: '#3b82f6',
        created_at: '2026-05-21T00:00:00Z',
        updated_at: '2026-05-21T00:00:00Z',
      },
      {
        id: 't2',
        operator_id: 'op-1',
        name: 'Returning',
        color: '#22c55e',
        created_at: '2026-05-21T00:00:00Z',
        updated_at: '2026-05-21T00:00:00Z',
      },
    ]),
  }
})

import { BulkActionToolbar } from './BulkActionToolbar'

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

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

  // ---- landr-uqr2 — Apply tag action ---------------------------------

  it('does not render the tag button when operatorId is missing', () => {
    render(
      <BulkActionToolbar
        selectedIds={['a']}
        onClear={() => {}}
        actions={['tag']}
        // operatorId intentionally omitted
      />,
    )
    expect(screen.queryByTestId('bulk-toolbar-tag')).not.toBeInTheDocument()
  })

  it('renders the tag button when actions includes "tag" and operatorId is set', async () => {
    renderWithClient(
      <BulkActionToolbar
        selectedIds={['a']}
        onClear={() => {}}
        actions={['tag']}
        operatorId="op-1"
      />,
    )
    expect(screen.getByTestId('bulk-toolbar-tag')).toBeInTheDocument()
  })

  it('opens a TagPicker popover and fires onApplyTags with the chosen tag ids', async () => {
    const onApplyTags = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithClient(
      <BulkActionToolbar
        selectedIds={['a', 'b']}
        onClear={() => {}}
        actions={['tag']}
        operatorId="op-1"
        onApplyTags={onApplyTags}
      />,
    )

    // Open the popover from the toolbar.
    await user.click(screen.getByTestId('bulk-toolbar-tag'))
    expect(
      await screen.findByTestId('bulk-toolbar-tag-popover'),
    ).toBeInTheDocument()

    // The Apply button is disabled until at least one tag is picked.
    const confirm = screen.getByTestId('bulk-toolbar-tag-confirm')
    expect(confirm).toBeDisabled()

    // Open the picker popover INSIDE the toolbar popover and tick a tag.
    await user.click(screen.getByTestId('bulk-toolbar-tag-picker-trigger'))
    await screen.findByTestId('bulk-toolbar-tag-picker-option-t1')
    await user.click(screen.getByTestId('bulk-toolbar-tag-picker-option-t1'))

    // Confirm is now enabled; clicking fires the handler with the
    // (rowIds, tagIds) tuple and closes the popover.
    expect(confirm).not.toBeDisabled()
    await user.click(confirm)
    await waitFor(() => expect(onApplyTags).toHaveBeenCalledOnce())
    expect(onApplyTags).toHaveBeenCalledWith(['a', 'b'], ['t1'])
  })
})
