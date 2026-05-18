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
})
