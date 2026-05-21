// landr-1ztq — focused tests for the Group-by dropdown wiring on
// ViewToolbar. Sort + filter chips already have their own coverage in
// neighbouring suites; we only assert the new control here.
//
// landr-4cwh — ViewToolbar swimlane dropdown tests.
//
// Pinned scope: the Swimlanes control only appears for Board layouts, lists
// the entity's enum + id fields, and writes back to
// `boardConfig.swimlaneBy`. Existing sort/filter/columns chrome is exercised
// indirectly via ViewPage tests; we don't re-cover it here.

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

describe('ViewToolbar swimlanes (landr-4cwh)', () => {
  it('does not render the Swimlanes control for non-board layouts', () => {
    render(
      <ViewToolbar
        entityType="booking"
        config={{ layout: 'table', filters: [], sort: [] }}
        onChange={vi.fn()}
        layout="table"
      />,
    )
    expect(
      screen.queryByTestId('view-toolbar-swimlane'),
    ).not.toBeInTheDocument()
  })

  it('renders Swimlanes for board layouts with a "None (flat)" default', () => {
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          layout: 'board',
          filters: [],
          sort: [],
          boardConfig: { columnBy: 'current_stage', swimlaneBy: null },
        }}
        onChange={vi.fn()}
        layout="board"
      />,
    )
    const select = screen.getByTestId(
      'view-toolbar-swimlane-key',
    ) as HTMLSelectElement
    expect(select.value).toBe('__none__')
    // Must offer every enum / id field on `booking` (current_stage,
    // current_semantic_state, product_id, pickup_location_id) — but NOT
    // text/date/number fields like customer_first_name or booking_total.
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('current_stage')
    expect(options).toContain('current_semantic_state')
    expect(options).toContain('product_id')
    expect(options).toContain('pickup_location_id')
    expect(options).not.toContain('customer_first_name')
    expect(options).not.toContain('booking_total')
    expect(options).not.toContain('date_range_start')
  })

  it('writes the picked field to boardConfig.swimlaneBy, preserving columnBy', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          layout: 'board',
          filters: [],
          sort: [],
          boardConfig: { columnBy: 'current_stage', swimlaneBy: null },
        }}
        onChange={onChange}
        layout="board"
      />,
    )
    await user.selectOptions(
      screen.getByTestId('view-toolbar-swimlane-key'),
      'current_semantic_state',
    )
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        boardConfig: {
          columnBy: 'current_stage',
          swimlaneBy: 'current_semantic_state',
        },
      }),
    )
  })

  it('selecting "None" persists explicit null on boardConfig.swimlaneBy', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          layout: 'board',
          filters: [],
          sort: [],
          boardConfig: {
            columnBy: 'current_stage',
            swimlaneBy: 'current_semantic_state',
          },
        }}
        onChange={onChange}
        layout="board"
      />,
    )
    const select = screen.getByTestId(
      'view-toolbar-swimlane-key',
    ) as HTMLSelectElement
    expect(select.value).toBe('current_semantic_state')
    await user.selectOptions(select, '__none__')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        boardConfig: {
          columnBy: 'current_stage',
          swimlaneBy: null,
        },
      }),
    )
  })
})
