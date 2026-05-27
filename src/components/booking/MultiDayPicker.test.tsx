import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { MultiDayPicker } from './MultiDayPicker'
import { nextSelection } from './multiDayPickerLogic'

function Harness({
  initial = [] as string[],
  initialMonth = '2026-06-01',
  minDay,
}: {
  initial?: string[]
  initialMonth?: string
  minDay?: string
}) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <div>
      <MultiDayPicker
        value={value}
        onChange={setValue}
        initialMonth={initialMonth}
        minDay={minDay}
      />
      <div data-testid="value">{value.join(',')}</div>
    </div>
  )
}

function dayButton(iso: string): HTMLButtonElement {
  const el = document.querySelector(`button[data-day="${iso}"]`)
  if (!el) throw new Error(`No day button for ${iso}`)
  return el as HTMLButtonElement
}

describe('nextSelection', () => {
  it('first click on empty selection sets anchor and selects the day', () => {
    const r = nextSelection([], null, '2026-06-10', false)
    expect(r).toEqual({ days: ['2026-06-10'], anchor: '2026-06-10' })
  })

  it('second click fills range from anchor to clicked day', () => {
    const r = nextSelection(['2026-06-10'], '2026-06-10', '2026-06-13', false)
    expect(r.days).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
      '2026-06-13',
    ])
    expect(r.anchor).toBe('2026-06-10')
  })

  it('click outside current range extends bounding range, anchor stays', () => {
    const r = nextSelection(
      ['2026-06-10', '2026-06-11', '2026-06-12'],
      '2026-06-10',
      '2026-06-15',
      false,
    )
    expect(r.days).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
      '2026-06-13',
      '2026-06-14',
      '2026-06-15',
    ])
    expect(r.anchor).toBe('2026-06-10')
  })

  it('shift+click toggles a single day and preserves the anchor', () => {
    const r = nextSelection(
      ['2026-06-10', '2026-06-11', '2026-06-12'],
      '2026-06-10',
      '2026-06-11',
      true,
    )
    expect(r.days).toEqual(['2026-06-10', '2026-06-12'])
    expect(r.anchor).toBe('2026-06-10')
  })

  it('shift+click on unselected day adds it', () => {
    const r = nextSelection(['2026-06-10'], '2026-06-10', '2026-06-20', true)
    expect(r.days).toEqual(['2026-06-10', '2026-06-20'])
    expect(r.anchor).toBe('2026-06-10')
  })

  it('click on the anchor itself is a no-op', () => {
    const r = nextSelection(['2026-06-10'], '2026-06-10', '2026-06-10', false)
    expect(r.days).toEqual(['2026-06-10'])
    expect(r.anchor).toBe('2026-06-10')
  })
})

describe('MultiDayPicker (component)', () => {
  it('renders a month grid with month header', () => {
    render(<Harness initialMonth="2026-06-01" />)
    expect(screen.getByText(/June 2026/i)).toBeInTheDocument()
    // Sanity: every day of June 2026 has a button.
    for (let d = 1; d <= 30; d += 1) {
      const iso = `2026-06-${d.toString().padStart(2, '0')}`
      expect(dayButton(iso)).toBeTruthy()
    }
  })

  it('plain click then second click fills the range', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(dayButton('2026-06-05'))
    await user.click(dayButton('2026-06-08'))

    expect(screen.getByTestId('value').textContent).toBe(
      '2026-06-05,2026-06-06,2026-06-07,2026-06-08',
    )
  })

  it('shift+click toggles individual days', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={['2026-06-05', '2026-06-06', '2026-06-07']}
      />,
    )
    await user.keyboard('{Shift>}')
    await user.click(dayButton('2026-06-06'))
    await user.keyboard('{/Shift}')

    expect(screen.getByTestId('value').textContent).toBe(
      '2026-06-05,2026-06-07',
    )
  })

  it('click outside the existing range extends it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['2026-06-05']} />)
    // Simulate prior anchor by clicking the existing day first.
    await user.click(dayButton('2026-06-05'))
    await user.click(dayButton('2026-06-09'))

    expect(screen.getByTestId('value').textContent).toBe(
      '2026-06-05,2026-06-06,2026-06-07,2026-06-08,2026-06-09',
    )
  })

  it('honours minDay by disabling earlier buttons', () => {
    render(<Harness initialMonth="2026-06-01" minDay="2026-06-15" />)
    expect(dayButton('2026-06-10')).toBeDisabled()
    expect(dayButton('2026-06-20')).not.toBeDisabled()
  })
})
