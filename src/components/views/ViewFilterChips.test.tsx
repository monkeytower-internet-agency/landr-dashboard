// landr-hgtv — ViewFilterChips unit tests.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewFilterChips } from './ViewFilterChips'
import type { Filter } from '@/lib/views-filters'

describe('ViewFilterChips (landr-hgtv)', () => {
  it('renders one chip per filter in the config', () => {
    const filters: Filter[] = [
      { field: 'current_stage', op: 'in', values: ['confirmed', 'cancelled'] },
      { field: 'customer_email', op: 'contains', values: ['@example.com'] },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={() => {}}
      />,
    )
    expect(screen.getByTestId('view-filters-chip-0')).toBeInTheDocument()
    expect(screen.getByTestId('view-filters-chip-1')).toBeInTheDocument()
    // Chip label includes field label + op label + values.
    expect(
      screen.getByTestId('view-filters-chip-0-trigger').textContent ?? '',
    ).toMatch(/Stage is any of Confirmed, Cancelled/i)
  })

  it('opens the add popover when the + Filter trigger is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ViewFilterChips
        entityType="booking"
        filters={[]}
        onChange={() => {}}
      />,
    )
    await user.click(screen.getByTestId('view-filters-add-trigger'))
    expect(await screen.findByTestId('filter-editor')).toBeInTheDocument()
  })

  it('adds a new filter when the editor is applied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ViewFilterChips
        entityType="booking"
        filters={[]}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByTestId('view-filters-add-trigger'))
    await screen.findByTestId('filter-editor')

    // Default field = customer_first_name (text). Default op = 'eq'. Type a
    // value so the apply button enables.
    const input = screen.getByTestId('filter-editor-value')
    await user.type(input, 'Marie')
    await user.click(screen.getByTestId('filter-editor-apply'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Filter[]
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      field: 'customer_first_name',
      op: 'eq',
      values: ['Marie'],
    })
  })

  // landr-1zxt — relative-date chip labels surface the preset name.
  it('shows the preset label for a within() chip with relative tokens', () => {
    const filters: Filter[] = [
      {
        field: 'date_range_start',
        op: 'within',
        values: ['start_of_week', 'end_of_week'],
      },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByTestId('view-filters-chip-0-trigger').textContent ?? '',
    ).toMatch(/Start date is in This week/i)
  })

  it('shows the single token label for a non-within relative chip', () => {
    const filters: Filter[] = [
      { field: 'date_range_start', op: 'eq', values: ['today'] },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByTestId('view-filters-chip-0-trigger').textContent ?? '',
    ).toMatch(/Start date is Today/i)
  })

  it('opens the Relative tab on a date filter and commits a preset', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const filters: Filter[] = [
      { field: 'date_range_start', op: 'within', values: [] },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByTestId('view-filters-chip-0-trigger'))
    await screen.findByTestId('filter-editor')
    await user.click(screen.getByTestId('filter-editor-relative-tab'))
    await user.click(screen.getByTestId('filter-editor-preset-this-week'))
    await user.click(screen.getByTestId('filter-editor-apply'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Filter[]
    expect(next[0].values).toEqual(['start_of_week', 'end_of_week'])
  })

  // landr-qc72 — configurable Next/Last N days range picker.
  it('compresses ["today","today+14d"] to "Next 14 days" in the chip label', () => {
    const filters: Filter[] = [
      {
        field: 'date_range_start',
        op: 'within',
        values: ['today', 'today+14d'],
      },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByTestId('view-filters-chip-0-trigger').textContent ?? '',
    ).toMatch(/Start date is in Next 14 days/i)
  })

  it('compresses ["today-30d","today"] to "Last 30 days" in the chip label', () => {
    const filters: Filter[] = [
      {
        field: 'date_range_start',
        op: 'within',
        values: ['today-30d', 'today'],
      },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={() => {}}
      />,
    )
    expect(
      screen.getByTestId('view-filters-chip-0-trigger').textContent ?? '',
    ).toMatch(/Start date is in Last 30 days/i)
  })

  it('commits ["today","today+14d"] when Next N days is applied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const filters: Filter[] = [
      { field: 'date_range_start', op: 'within', values: [] },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByTestId('view-filters-chip-0-trigger'))
    await screen.findByTestId('filter-editor')
    await user.click(screen.getByTestId('filter-editor-relative-tab'))
    await user.click(screen.getByTestId('filter-editor-preset-next-n-days'))

    const input = await screen.findByTestId('filter-editor-custom-n-input')
    await user.clear(input)
    await user.type(input, '14')
    await user.click(screen.getByTestId('filter-editor-custom-n-apply'))
    // Commit the chip via the editor's outer Apply (mirrors the preset path).
    await user.click(screen.getByTestId('filter-editor-apply'))

    // Last call carries the final committed filter set.
    const last = onChange.mock.calls.at(-1)?.[0] as Filter[]
    expect(last[0].values).toEqual(['today', 'today+14d'])
  })

  it('commits ["today-7d","today"] when Last N days is applied', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const filters: Filter[] = [
      { field: 'date_range_start', op: 'within', values: [] },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByTestId('view-filters-chip-0-trigger'))
    await screen.findByTestId('filter-editor')
    await user.click(screen.getByTestId('filter-editor-relative-tab'))
    await user.click(screen.getByTestId('filter-editor-preset-last-n-days'))

    const input = await screen.findByTestId('filter-editor-custom-n-input')
    await user.clear(input)
    await user.type(input, '7')
    await user.click(screen.getByTestId('filter-editor-custom-n-apply'))
    await user.click(screen.getByTestId('filter-editor-apply'))

    const last = onChange.mock.calls.at(-1)?.[0] as Filter[]
    expect(last[0].values).toEqual(['today-7d', 'today'])
  })

  it('disables the custom-N Apply button and shows inline error for invalid N', async () => {
    const user = userEvent.setup()
    const filters: Filter[] = [
      { field: 'date_range_start', op: 'within', values: [] },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={() => {}}
      />,
    )
    await user.click(screen.getByTestId('view-filters-chip-0-trigger'))
    await screen.findByTestId('filter-editor')
    await user.click(screen.getByTestId('filter-editor-relative-tab'))
    await user.click(screen.getByTestId('filter-editor-preset-next-n-days'))

    const input = await screen.findByTestId('filter-editor-custom-n-input')
    const apply = screen.getByTestId('filter-editor-custom-n-apply')

    // 0 is out of range → error visible, Apply disabled.
    await user.clear(input)
    await user.type(input, '0')
    expect(screen.getByTestId('filter-editor-custom-n-error')).toBeInTheDocument()
    expect(apply).toBeDisabled()

    // 999 is out of range too.
    await user.clear(input)
    await user.type(input, '999')
    expect(screen.getByTestId('filter-editor-custom-n-error')).toBeInTheDocument()
    expect(apply).toBeDisabled()

    // 30 is valid → error gone, Apply enabled.
    await user.clear(input)
    await user.type(input, '30')
    expect(screen.queryByTestId('filter-editor-custom-n-error')).toBeNull()
    expect(apply).toBeEnabled()
  })

  it('removes a chip when its X button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const filters: Filter[] = [
      { field: 'current_stage', op: 'eq', values: ['confirmed'] },
    ]
    render(
      <ViewFilterChips
        entityType="booking"
        filters={filters}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByTestId('view-filters-chip-0-remove'))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
