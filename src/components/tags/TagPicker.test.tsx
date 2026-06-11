/**
 * Tests for TagPicker (landr-iz58).
 *
 * Mocks lib/tags so the picker can be exercised without a real network call.
 * Validates:
 *   - Renders the operator's tag list inside the popover.
 *   - Toggling a tag fires onChange with the next set.
 *   - Filtering by query narrows the list and exposes a Create affordance
 *     when no exact match is found.
 *   - Removing a selected chip fires onChange with the deselected id removed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'

vi.mock('@/lib/tags', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/tags')>()
  return {
    ...actual,
    fetchTags: vi.fn(),
    createTag: vi.fn(),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}))

import { TagPicker } from './TagPicker'
import { createTag, fetchTags, type Tag } from '@/lib/tags'

const OP_ID = 'op-1'

const TAGS: Tag[] = [
  {
    id: 't1',
    operator_id: OP_ID,
    name: 'VIP',
    color: '#3b82f6',
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
  },
  {
    id: 't2',
    operator_id: OP_ID,
    name: 'Returning',
    color: '#22c55e',
    created_at: '2026-05-21T00:00:00Z',
    updated_at: '2026-05-21T00:00:00Z',
  },
]

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.mocked(fetchTags).mockResolvedValue(TAGS)
  vi.mocked(createTag).mockReset()
  vi.mocked(toast.error).mockReset()
})

describe('TagPicker', () => {
  it('renders selected tags as chips and opens the popover with the tag list', async () => {
    const onChange = vi.fn()
    renderWithClient(
      <TagPicker
        operatorId={OP_ID}
        selectedIds={['t1']}
        onChange={onChange}
      />,
    )
    // Selected chip is on the surface.
    await screen.findByTestId('tag-picker-selected-t1')
    // Open the popover.
    fireEvent.click(screen.getByTestId('tag-picker-trigger'))
    // Both tags are listed.
    await waitFor(() => {
      expect(screen.getByTestId('tag-picker-option-t1')).toBeInTheDocument()
      expect(screen.getByTestId('tag-picker-option-t2')).toBeInTheDocument()
    })
  })

  it('toggles a tag on click', async () => {
    const onChange = vi.fn()
    renderWithClient(
      <TagPicker
        operatorId={OP_ID}
        selectedIds={[]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('tag-picker-trigger'))
    await screen.findByTestId('tag-picker-option-t1')
    fireEvent.click(screen.getByTestId('tag-picker-option-t1'))
    expect(onChange).toHaveBeenCalledWith(['t1'])
  })

  it('removing a selected chip drops its id', async () => {
    const onChange = vi.fn()
    renderWithClient(
      <TagPicker
        operatorId={OP_ID}
        selectedIds={['t1', 't2']}
        onChange={onChange}
      />,
    )
    await screen.findByTestId('tag-picker-selected-t1')
    fireEvent.click(screen.getByTestId('tag-picker-selected-t1-remove'))
    expect(onChange).toHaveBeenCalledWith(['t2'])
  })

  it('filters the list by query and exposes a Create affordance for unmatched names', async () => {
    const onChange = vi.fn()
    vi.mocked(createTag).mockResolvedValue({
      id: 't3',
      operator_id: OP_ID,
      name: 'Hen party',
      color: '#ef4444',
      created_at: 'x',
      updated_at: 'x',
    })
    renderWithClient(
      <TagPicker
        operatorId={OP_ID}
        selectedIds={[]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('tag-picker-trigger'))
    await screen.findByTestId('tag-picker-option-t1')
    fireEvent.change(screen.getByTestId('tag-picker-search'), {
      target: { value: 'Hen party' },
    })
    // No matching existing tag — Create affordance shows.
    const createBtn = await screen.findByTestId('tag-picker-create')
    fireEvent.click(createBtn)
    await waitFor(() => {
      expect(createTag).toHaveBeenCalledWith(OP_ID, {
        name: 'Hen party',
        color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/),
      })
    })
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['t3'])
    })
  })

  it('Enter inside the search creates when there is no exact match', async () => {
    const onChange = vi.fn()
    vi.mocked(createTag).mockResolvedValue({
      id: 't9',
      operator_id: OP_ID,
      name: 'Birthday',
      color: '#3b82f6',
      created_at: 'x',
      updated_at: 'x',
    })
    renderWithClient(
      <TagPicker
        operatorId={OP_ID}
        selectedIds={[]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('tag-picker-trigger'))
    await screen.findByTestId('tag-picker-option-t1')
    const search = screen.getByTestId('tag-picker-search')
    fireEvent.change(search, { target: { value: 'Birthday' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    await waitFor(() => {
      expect(createTag).toHaveBeenCalled()
    })
  })

  it('shows a toast error when tag creation fails', async () => {
    const onChange = vi.fn()
    vi.mocked(createTag).mockRejectedValue(new Error('Permission denied'))
    renderWithClient(
      <TagPicker
        operatorId={OP_ID}
        selectedIds={[]}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('tag-picker-trigger'))
    await screen.findByTestId('tag-picker-option-t1')
    fireEvent.change(screen.getByTestId('tag-picker-search'), {
      target: { value: 'Fail tag' },
    })
    const createBtn = await screen.findByTestId('tag-picker-create')
    fireEvent.click(createBtn)
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Could not create tag.',
        expect.objectContaining({ description: 'Permission denied' }),
      )
    })
    // onChange must NOT be called when creation fails.
    expect(onChange).not.toHaveBeenCalled()
  })
})
