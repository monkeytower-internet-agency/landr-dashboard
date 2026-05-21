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
