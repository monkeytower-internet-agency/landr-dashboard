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

  it('renders a single leading month marker for single-month ranges (landr-04ec)', () => {
    const { container } = render(
      <DayChips days={['2026-05-18', '2026-05-19']} locale="en-US" />,
    )
    // Exactly ONE month marker even when all chips share a month — the
    // chip "Mon 8" alone is ambiguous so we always anchor it with a label.
    const markers = container.querySelectorAll('[data-month]')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveAttribute('data-month', '2026-05')
    expect(screen.getByText('MAY')).toBeInTheDocument()
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

  it('splits non-consecutive days into runs with visible separators (landr-irz1)', () => {
    // The canonical example: [24, 27, 28, 30, 31] → 3 runs.
    const { container } = render(
      <DayChips
        days={[
          '2026-05-24',
          '2026-05-27',
          '2026-05-28',
          '2026-05-30',
          '2026-05-31',
        ]}
        locale="en-US"
      />,
    )
    const runs = container.querySelectorAll('[data-run-start]')
    expect(runs).toHaveLength(3)
    expect(runs[0]).toHaveAttribute('data-run-start', '2026-05-24')
    expect(runs[1]).toHaveAttribute('data-run-start', '2026-05-27')
    expect(runs[2]).toHaveAttribute('data-run-start', '2026-05-30')
    // Between three runs there are two separators.
    const seps = container.querySelectorAll('[data-run-separator]')
    expect(seps).toHaveLength(2)
    // Each chip still renders.
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
  })

  it('renders a contiguous range as a single run with no separators (landr-irz1)', () => {
    const { container } = render(
      <DayChips
        days={['2026-05-24', '2026-05-25', '2026-05-26']}
        locale="en-US"
      />,
    )
    expect(container.querySelectorAll('[data-run-start]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-run-separator]')).toHaveLength(0)
  })

  it('renders a single day as one run with no separators (landr-irz1)', () => {
    const { container } = render(
      <DayChips days={['2026-05-24']} locale="en-US" />,
    )
    expect(container.querySelectorAll('[data-run-start]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-run-separator]')).toHaveLength(0)
  })

  it('detects within-month runs alongside cross-month boundaries (landr-irz1)', () => {
    // May: 24, then 27+28 (two runs). June: 1+2 (one run, in its own month group).
    const { container } = render(
      <DayChips
        days={[
          '2026-05-24',
          '2026-05-27',
          '2026-05-28',
          '2026-06-01',
          '2026-06-02',
        ]}
        locale="en-US"
      />,
    )
    const mayMarker = container.querySelector('[data-month="2026-05"]')
    const junMarker = container.querySelector('[data-month="2026-06"]')
    expect(mayMarker).not.toBeNull()
    expect(junMarker).not.toBeNull()

    const mayRuns =
      mayMarker?.parentElement?.querySelectorAll('[data-run-start]') ?? []
    const junRuns =
      junMarker?.parentElement?.querySelectorAll('[data-run-start]') ?? []
    expect(mayRuns).toHaveLength(2)
    expect(junRuns).toHaveLength(1)

    // The gap between May 28 and June 1 is handled by the existing
    // month-grouping layout, NOT by a within-row separator.
    const maySeps =
      mayMarker?.parentElement?.querySelectorAll('[data-run-separator]') ?? []
    const junSeps =
      junMarker?.parentElement?.querySelectorAll('[data-run-separator]') ?? []
    expect(maySeps).toHaveLength(1)
    expect(junSeps).toHaveLength(0)
  })
})
