// landr-hgtv — LayoutSwitcher unit tests.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutSwitcher, isViewLayout } from './LayoutSwitcher'

describe('LayoutSwitcher (landr-hgtv)', () => {
  it('renders all three layout options and marks the active one', () => {
    render(<LayoutSwitcher value="board" onChange={() => {}} />)
    expect(screen.getByTestId('layout-switcher-table')).toBeInTheDocument()
    expect(screen.getByTestId('layout-switcher-board')).toBeInTheDocument()
    expect(screen.getByTestId('layout-switcher-calendar')).toBeInTheDocument()
    expect(screen.getByTestId('layout-switcher-board')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByTestId('layout-switcher-table')).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('fires onChange with the clicked layout', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<LayoutSwitcher value="table" onChange={onChange} />)
    await user.click(screen.getByTestId('layout-switcher-calendar'))
    expect(onChange).toHaveBeenCalledWith('calendar')
  })
})

describe('isViewLayout (landr-hgtv)', () => {
  it('accepts known layouts', () => {
    expect(isViewLayout('table')).toBe(true)
    expect(isViewLayout('board')).toBe(true)
    expect(isViewLayout('calendar')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isViewLayout('roadmap')).toBe(false)
    expect(isViewLayout(null)).toBe(false)
    expect(isViewLayout(undefined)).toBe(false)
    expect(isViewLayout('')).toBe(false)
  })
})
