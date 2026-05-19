import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayChips } from './DayChips'

describe('DayChips', () => {
  it('renders one chip per ISO date with day-of-month', () => {
    render(<DayChips days={['2026-05-18', '2026-05-19']} />)
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('19')).toBeInTheDocument()
  })

  it('sorts chips chronologically and de-duplicates', () => {
    render(<DayChips days={['2026-05-19', '2026-05-18', '2026-05-19']} />)
    const chips = screen.getAllByRole('listitem')
    expect(chips).toHaveLength(2)
    expect(chips[0]).toHaveAttribute('data-day', '2026-05-18')
    expect(chips[1]).toHaveAttribute('data-day', '2026-05-19')
  })

  it('renders chips as buttons when editable and calls onToggle', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <DayChips
        days={['2026-05-18']}
        editable
        onToggle={onToggle}
      />,
    )
    const chip = screen.getByRole('button', { name: /remove 2026-05-18/i })
    await user.click(chip)
    expect(onToggle).toHaveBeenCalledWith('2026-05-18')
  })

  it('falls back to "no days" copy when the list is empty', () => {
    render(<DayChips days={[]} />)
    expect(screen.getByText(/no days/i)).toBeInTheDocument()
  })

  it('omits month markers when every day is in the same month', () => {
    render(<DayChips days={['2026-05-18', '2026-05-19']} />)
    // No month markers expected for single-month ranges.
    expect(screen.queryByText(/^MAY$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^JUN$/)).not.toBeInTheDocument()
  })

  it('renders month markers above each month group when the range crosses a boundary (landr-ppf)', () => {
    render(
      <DayChips
        days={['2026-05-30', '2026-05-31', '2026-06-01']}
        locale="en-US"
      />,
    )
    // Both months get an uppercase short-name marker.
    expect(screen.getByText('MAY')).toBeInTheDocument()
    expect(screen.getByText('JUN')).toBeInTheDocument()
    // Chips still render correctly.
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('groups days under the right month marker (landr-ppf)', () => {
    const { container } = render(
      <DayChips
        days={['2026-05-30', '2026-06-01', '2026-06-02']}
        locale="en-US"
      />,
    )
    const mayMarker = container.querySelector('[data-month="2026-05"]')
    const junMarker = container.querySelector('[data-month="2026-06"]')
    expect(mayMarker).not.toBeNull()
    expect(junMarker).not.toBeNull()
    // Each marker's sibling chip row contains the chips for that month.
    const mayChips = mayMarker?.parentElement?.querySelectorAll('[data-day]')
    const junChips = junMarker?.parentElement?.querySelectorAll('[data-day]')
    expect(mayChips?.length).toBe(1)
    expect(junChips?.length).toBe(2)
  })
})
