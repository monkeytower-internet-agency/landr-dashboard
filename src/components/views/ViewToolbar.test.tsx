// landr-1ztq — focused tests for the Group-by dropdown wiring on
// ViewToolbar. Sort + filter chips already have their own coverage in
// neighbouring suites; we only assert the new control here.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ViewToolbar } from './ViewToolbar'

describe('ViewToolbar group-by dropdown (landr-1ztq)', () => {
  it('renders a "None" option plus every groupable booking field', () => {
    render(
      <ViewToolbar
        entityType="booking"
        config={{}}
        onChange={() => {}}
      />,
    )
    const select = screen.getByTestId(
      'view-toolbar-group-key',
    ) as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toContain('__none__')
    // Enum + date booking fields are groupable by default.
    expect(optionValues).toContain('current_stage')
    expect(optionValues).toContain('date_range_start')
    // Free-text fields are NOT in the dropdown by default.
    expect(optionValues).not.toContain('customer_email')
  })

  it('selecting a field writes groupBy into the config blob', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ViewToolbar
        entityType="booking"
        config={{ layout: 'table' }}
        onChange={onChange}
      />,
    )
    await user.selectOptions(
      screen.getByTestId('view-toolbar-group-key'),
      'current_stage',
    )
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        groupBy: { source: 'system', key: 'current_stage' },
      }),
    )
  })

  it('selecting "None" clears groupBy from the config blob', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          layout: 'table',
          groupBy: { source: 'system', key: 'current_stage' },
        }}
        onChange={onChange}
      />,
    )
    await user.selectOptions(
      screen.getByTestId('view-toolbar-group-key'),
      '__none__',
    )
    const arg = onChange.mock.calls[0][0] as Record<string, unknown>
    expect(arg.groupBy).toBeUndefined()
    // The rest of the config must survive.
    expect(arg.layout).toBe('table')
  })

  it('round-trips a saved groupBy as the selected option', () => {
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          groupBy: { source: 'system', key: 'current_stage' },
        }}
        onChange={() => {}}
      />,
    )
    const select = screen.getByTestId(
      'view-toolbar-group-key',
    ) as HTMLSelectElement
    expect(select.value).toBe('current_stage')
  })
})
