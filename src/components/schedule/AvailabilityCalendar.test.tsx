import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AvailabilityCalendar } from './AvailabilityCalendar'
import type { AvailabilityRow } from '@/lib/availability'

// FullCalendar's default initialView=dayGridMonth shows the current month;
// seed availability rows on every day of the current month so at least one
// pill is visible regardless of when the test runs.
function isoForToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function row(overrides: Partial<AvailabilityRow> = {}): AvailabilityRow {
  return {
    id: 'avail-1',
    operator_id: 'op-1',
    product_id: 'prod-1',
    date: isoForToday(),
    start_time: null,
    end_time: null,
    capacity: 6,
    capacity_reserved: 2,
    status: 'open',
    source: 'template',
    source_template_id: null,
    notes: null,
    created_at: '2026-05-19T12:00:00.000Z',
    updated_at: '2026-05-19T12:00:00.000Z',
    ...overrides,
  }
}

describe('AvailabilityCalendar pill click (landr-5rsf)', () => {
  it('pill click fires onPillClick exactly once and does NOT also trigger onDayClick (stopPropagation)', () => {
    const onDayClick = vi.fn()
    const onPillClick = vi.fn()

    render(
      <AvailabilityCalendar
        rows={[row()]}
        onDayClick={onDayClick}
        onPillClick={onPillClick}
      />,
    )

    // FullCalendar renders pills via dayCellContent for every visible day cell.
    // Find the open-state pill that matches our seeded row.
    const pills = screen
      .getAllByTestId('day-chip')
      .filter((el) => el.getAttribute('data-state') === 'open')
    expect(pills.length).toBeGreaterThan(0)
    const pill = pills[0]
    expect(pill.tagName).toBe('BUTTON')
    expect(pill).toHaveTextContent('2/6')

    fireEvent.click(pill)

    expect(onPillClick).toHaveBeenCalledTimes(1)
    // Critical: cell-level handler must NOT also fire (the bug being fixed).
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it('cell click (outside the pill) still triggers onDayClick', () => {
    const onDayClick = vi.fn()
    const onPillClick = vi.fn()

    render(
      <AvailabilityCalendar
        rows={[row()]}
        onDayClick={onDayClick}
        onPillClick={onPillClick}
      />,
    )

    // FullCalendar attaches a DOM-level click listener on each day cell;
    // clicking a non-pill element inside the cell should still open the editor.
    const dayNumber = screen.getAllByText(/^\d+$/)[0]
    fireEvent.click(dayNumber)

    expect(onDayClick).toHaveBeenCalled()
    expect(onPillClick).not.toHaveBeenCalled()
  })
})
