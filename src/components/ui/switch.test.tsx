// Contract checks for the shared on/off Switch — locks the role/aria/click
// behaviour the call sites (Settings → Notifications, TicketDetailSheet) rely on.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './switch'

describe('Switch', () => {
  it('exposes a switch role reflecting the checked state', () => {
    const { rerender } = render(<Switch checked={false} />)
    const sw = screen.getByRole('switch')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveAttribute('data-state', 'unchecked')

    rerender(<Switch checked={true} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked')
  })

  it('fires onClick when toggled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Switch checked={false} onClick={onClick} data-testid="sw" />)
    await user.click(screen.getByTestId('sw'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Switch checked={false} disabled onClick={onClick} data-testid="sw" />)
    await user.click(screen.getByTestId('sw'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies the ON track colour only when checked, allowing a className override', () => {
    const { rerender } = render(
      <Switch checked={false} className="border-amber-500" data-testid="sw" />,
    )
    // Override class is always applied; the base ON colour only when checked.
    expect(screen.getByTestId('sw').className).toContain('border-amber-500')
    expect(screen.getByTestId('sw').className).not.toContain('bg-primary')

    rerender(<Switch checked={true} className="bg-amber-500" data-testid="sw" />)
    expect(screen.getByTestId('sw').className).toContain('bg-amber-500')
  })
})
