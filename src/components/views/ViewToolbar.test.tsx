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
//
// landr-9nj9 — ViewToolbar column-by picker tests. Same Board-only gating
// and field shortlist as swimlanes; writes to `boardConfig.columnBy`;
// selecting "Default" deletes the key so BoardLayout's fallback (first
// enum field — today current_stage) takes over.

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

describe('ViewToolbar column-by picker (landr-9nj9)', () => {
  it('does not render the Column-by control for non-board layouts', () => {
    render(
      <ViewToolbar
        entityType="booking"
        config={{ layout: 'table', filters: [], sort: [] }}
        onChange={vi.fn()}
        layout="table"
      />,
    )
    expect(
      screen.queryByTestId('view-toolbar-column-by'),
    ).not.toBeInTheDocument()
  })

  it('renders Column-by for board layouts with a "Default" option plus enum/id fields', () => {
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          layout: 'board',
          filters: [],
          sort: [],
          boardConfig: {},
        }}
        onChange={vi.fn()}
        layout="board"
      />,
    )
    const select = screen.getByTestId(
      'view-toolbar-column-by-key',
    ) as HTMLSelectElement
    // Default selection when no explicit columnBy is saved.
    expect(select.value).toBe('__none__')
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('__none__')
    expect(options).toContain('current_stage')
    expect(options).toContain('current_semantic_state')
    expect(options).toContain('product_id')
    expect(options).toContain('pickup_location_id')
    // Free-text / number / date fields stay out of the shortlist — they
    // don't yield discrete columns. Same rule as Swimlanes.
    expect(options).not.toContain('customer_first_name')
    expect(options).not.toContain('booking_total')
    expect(options).not.toContain('date_range_start')
  })

  it('writes the picked field to boardConfig.columnBy, preserving swimlaneBy', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          layout: 'board',
          filters: [],
          sort: [],
          boardConfig: { swimlaneBy: 'current_semantic_state' },
        }}
        onChange={onChange}
        layout="board"
      />,
    )
    await user.selectOptions(
      screen.getByTestId('view-toolbar-column-by-key'),
      'current_stage',
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

  it('selecting "Default" deletes boardConfig.columnBy so the layout fallback kicks in', async () => {
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
      'view-toolbar-column-by-key',
    ) as HTMLSelectElement
    expect(select.value).toBe('current_stage')
    await user.selectOptions(select, '__none__')
    const arg = onChange.mock.calls[0][0] as {
      boardConfig: Record<string, unknown>
    }
    expect(arg.boardConfig.columnBy).toBeUndefined()
    // Swimlanes setting must survive the column-by reset.
    expect(arg.boardConfig.swimlaneBy).toBe('current_semantic_state')
  })

  it('round-trips a saved columnBy as the selected option', () => {
    render(
      <ViewToolbar
        entityType="booking"
        config={{
          layout: 'board',
          boardConfig: { columnBy: 'current_semantic_state' },
        }}
        onChange={vi.fn()}
        layout="board"
      />,
    )
    const select = screen.getByTestId(
      'view-toolbar-column-by-key',
    ) as HTMLSelectElement
    expect(select.value).toBe('current_semantic_state')
  })
})
