/**
 * Tests for TagChip + TagChipRow (landr-iz58).
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { TagChip, TagChipRow } from './TagChip'

const TAG = { id: 't1', name: 'VIP', color: '#3b82f6' }

describe('TagChip', () => {
  it('renders the tag name', () => {
    render(<TagChip tag={TAG} />)
    expect(screen.getByText('VIP')).toBeInTheDocument()
  })

  it('applies the tag color as background', () => {
    render(<TagChip tag={TAG} testId="t-chip" />)
    const el = screen.getByTestId('t-chip')
    expect(el.style.backgroundColor).toMatch(/rgb\(59,\s?130,\s?246\)/)
  })

  it('renders a remove button when onRemove is provided', () => {
    const onRemove = vi.fn()
    render(<TagChip tag={TAG} onRemove={onRemove} testId="t-chip" />)
    fireEvent.click(screen.getByTestId('t-chip-remove'))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('does not render a remove button when onRemove is omitted', () => {
    render(<TagChip tag={TAG} testId="t-chip" />)
    expect(screen.queryByTestId('t-chip-remove')).not.toBeInTheDocument()
  })
})

describe('TagChipRow', () => {
  it('shows em-dash when no tags', () => {
    render(<TagChipRow tags={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders up to maxVisible chips', () => {
    const tags = [
      { id: 'a', name: 'A', color: '#000000' },
      { id: 'b', name: 'B', color: '#000000' },
      { id: 'c', name: 'C', color: '#000000' },
    ]
    render(<TagChipRow tags={tags} maxVisible={2} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.queryByText('C')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('omits the +N more token when everything fits', () => {
    const tags = [{ id: 'a', name: 'A', color: '#000000' }]
    render(<TagChipRow tags={tags} maxVisible={2} />)
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
  })
})
