// landr-n2j2 — coverage for the InlineEditCell view/edit toggle.
// The hook tests in src/lib/inline-edit-booking.test.tsx cover the write
// machinery; this file is just the keyboard / click contract.

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { InlineEditCell } from './InlineEditCell'

describe('InlineEditCell — select', () => {
  it('renders the display and flips to the dropdown on click', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="select"
        value="noop"
        options={[
          { value: 'noop', label: 'Pending' },
          { value: 'approve', label: 'Confirm' },
          { value: 'reject', label: 'Cancel' },
        ]}
        ariaLabel="Edit status"
        display={<span>Pending badge</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    expect(screen.getByText('Pending badge')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.click(screen.getByTestId('cell-display'))
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('commits on change and calls onCommit with the new value', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="select"
        value="noop"
        options={[
          { value: 'noop', label: 'Pending' },
          { value: 'approve', label: 'Confirm' },
        ]}
        ariaLabel="Edit status"
        display={<span>Pending badge</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    fireEvent.click(screen.getByTestId('cell-display'))
    const select = screen.getByLabelText('Edit status') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'approve' } })
    expect(onCommit).toHaveBeenCalledWith('approve')
  })

  it('does not call onCommit when the user picks the same value (no-op)', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="select"
        value="approve"
        options={[
          { value: 'noop', label: 'Pending' },
          { value: 'approve', label: 'Confirm' },
        ]}
        ariaLabel="Edit status"
        display={<span>Confirmed</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    fireEvent.click(screen.getByTestId('cell-display'))
    const select = screen.getByLabelText('Edit status') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'approve' } })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('stops propagation on cell click so the row click handler does not fire', () => {
    const onRowClick = vi.fn()
    const onCommit = vi.fn()
    render(
      <div onClick={onRowClick} data-testid="row">
        <InlineEditCell
          kind="select"
          value="noop"
          options={[{ value: 'noop', label: 'Pending' }]}
          ariaLabel="Edit status"
          display={<span>Pending badge</span>}
          testId="cell"
          onCommit={onCommit}
        />
      </div>,
    )
    fireEvent.click(screen.getByTestId('cell-display'))
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

describe('InlineEditCell — date', () => {
  it('renders the display and flips to a date input on click', () => {
    render(
      <InlineEditCell
        kind="date"
        value="2026-06-01"
        ariaLabel="Edit start date"
        display={<span>Mon 1 Jun</span>}
        testId="cell"
        onCommit={vi.fn()}
      />,
    )
    expect(screen.getByText('Mon 1 Jun')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cell-display'))
    const input = screen.getByLabelText('Edit start date') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(input.value).toBe('2026-06-01')
  })

  it('commits on Enter with the new value', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="date"
        value="2026-06-01"
        ariaLabel="Edit start date"
        display={<span>Mon 1 Jun</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    fireEvent.click(screen.getByTestId('cell-display'))
    const input = screen.getByLabelText('Edit start date') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-06-08' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('2026-06-08')
  })

  it('reverts on Escape without firing onCommit', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="date"
        value="2026-06-01"
        ariaLabel="Edit start date"
        display={<span>Mon 1 Jun</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    fireEvent.click(screen.getByTestId('cell-display'))
    const input = screen.getByTestId('cell-edit').querySelector('input')!
    fireEvent.change(input, { target: { value: '2026-06-08' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    // Editor is gone, display is back.
    expect(screen.queryByTestId('cell-edit')).toBeNull()
    expect(screen.getByText('Mon 1 Jun')).toBeInTheDocument()
  })

  it('commits on blur when the value changed', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="date"
        value="2026-06-01"
        ariaLabel="Edit start date"
        display={<span>Mon 1 Jun</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    fireEvent.click(screen.getByTestId('cell-display'))
    const input = screen.getByLabelText('Edit start date') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-06-08' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('2026-06-08')
  })

  it('does not call onCommit on blur when nothing changed', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="date"
        value="2026-06-01"
        ariaLabel="Edit start date"
        display={<span>Mon 1 Jun</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    fireEvent.click(screen.getByTestId('cell-display'))
    const input = screen.getByLabelText('Edit start date') as HTMLInputElement
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('InlineEditCell — readOnly', () => {
  it('renders the display without click/keyboard affordances when readOnly', () => {
    const onCommit = vi.fn()
    render(
      <InlineEditCell
        kind="select"
        readOnly
        value="noop"
        options={[{ value: 'noop', label: 'Pending' }]}
        ariaLabel="Edit status"
        display={<span>Pending badge</span>}
        testId="cell"
        onCommit={onCommit}
      />,
    )
    const display = screen.getByTestId('cell-display')
    expect(display).not.toHaveAttribute('role', 'button')
    fireEvent.click(display)
    expect(screen.queryByLabelText('Edit status')).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
