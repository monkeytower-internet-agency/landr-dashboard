// landr-knz3 — render + interaction checks for the reusable filter chip.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CountedFilterChip } from './counted-filter-chip'

describe('CountedFilterChip', () => {
  it('renders the label and count', () => {
    render(
      <CountedFilterChip
        label="Customer"
        count={3}
        selected={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('button')).toHaveTextContent('Customer (3)')
  })

  it('calls onToggle when clicked while enabled', async () => {
    const onToggle = vi.fn()
    render(
      <CountedFilterChip
        label="Customer"
        count={3}
        selected={false}
        onToggle={onToggle}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('disables itself when count is 0 and surfaces the tooltip via title', () => {
    render(
      <CountedFilterChip
        label="Agent"
        count={0}
        selected={false}
        onToggle={() => {}}
        disabledTooltip="No contacts of type agent"
      />,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'No contacts of type agent')
  })

  it('does not call onToggle when a disabled chip is clicked', async () => {
    const onToggle = vi.fn()
    render(
      <CountedFilterChip
        label="Agent"
        count={0}
        selected={false}
        onToggle={onToggle}
      />,
    )
    // Disabled buttons swallow pointer events — opt out of the check so
    // the dispatched click is delivered and we can confirm the handler is
    // still not invoked (React skips onClick for `disabled` buttons).
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('reflects selected state via aria-pressed', () => {
    const { rerender } = render(
      <CountedFilterChip
        label="Customer"
        count={3}
        selected={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')

    rerender(
      <CountedFilterChip
        label="Customer"
        count={3}
        selected={true}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('falls back to a default tooltip when none is provided', () => {
    render(
      <CountedFilterChip
        label="Customer"
        count={0}
        selected={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'No items of this type',
    )
  })

  it('uses a custom ariaLabel when provided', () => {
    render(
      <CountedFilterChip
        label="Customer"
        count={3}
        selected={false}
        onToggle={() => {}}
        ariaLabel="Customer contacts (3 matches)"
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Customer contacts (3 matches)',
    )
  })

  // landr-12ux — enabled chips with an `explanation` get the explanation
  // wired up as a native `title` (a11y / keyboard fallback for the
  // shadcn Tooltip's hover affordance).
  it('puts the explanation in the title attribute when enabled', () => {
    render(
      <CountedFilterChip
        label="Operator review"
        count={5}
        selected={false}
        onToggle={() => {}}
        explanation="The operator's first review of a new booking."
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      "The operator's first review of a new booking.",
    )
  })

  it('keeps the disabledTooltip when the chip is disabled, even with an explanation', () => {
    render(
      <CountedFilterChip
        label="Operator review"
        count={0}
        selected={false}
        onToggle={() => {}}
        disabledTooltip="No bookings in operator review"
        explanation="The operator's first review of a new booking."
      />,
    )
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'No bookings in operator review',
    )
  })
})
