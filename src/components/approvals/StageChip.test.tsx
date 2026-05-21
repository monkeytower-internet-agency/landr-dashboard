// landr-qmdo — coverage for the per-row Approvals stage chip.
//
// The chip is stage-code-driven (NOT semantic_state-driven like the
// bookings-table StageBadge): each of the three canonical Approvals
// stages gets its own hue + label, and unknown codes fall back to a
// muted humanised pill.

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageChip } from './StageChip'

describe('StageChip', () => {
  it('renders blue "Operator review" for awaiting_general_approval', () => {
    render(<StageChip code="awaiting_general_approval" />)
    const el = screen.getByText('Operator review')
    expect(el).toHaveAttribute('data-stage-code', 'awaiting_general_approval')
    expect(el.className).toMatch(/bg-blue-100/)
    expect(el.className).toMatch(/text-blue-900/)
  })

  it('renders purple "Secondary approver" for awaiting_secondary_approval', () => {
    render(<StageChip code="awaiting_secondary_approval" />)
    const el = screen.getByText('Secondary approver')
    expect(el).toHaveAttribute('data-stage-code', 'awaiting_secondary_approval')
    expect(el.className).toMatch(/bg-purple-100/)
    expect(el.className).toMatch(/text-purple-900/)
  })

  it('renders amber "Hotel review" for awaiting_hotel_approval', () => {
    render(<StageChip code="awaiting_hotel_approval" />)
    const el = screen.getByText('Hotel review')
    expect(el).toHaveAttribute('data-stage-code', 'awaiting_hotel_approval')
    expect(el.className).toMatch(/bg-amber-100/)
    expect(el.className).toMatch(/text-amber-900/)
  })

  it('renders a muted humanised fallback for unknown codes', () => {
    render(<StageChip code="awaiting_legal_review" />)
    // stageFallback humanises 'awaiting_legal_review' → 'Awaiting legal review'
    const el = screen.getByText('Awaiting legal review')
    expect(el).toHaveAttribute('data-stage-code', 'awaiting_legal_review')
    expect(el.className).toMatch(/bg-muted/)
    expect(el.className).toMatch(/text-muted-foreground/)
  })

  it('renders a muted em-dash when code is null', () => {
    render(<StageChip code={null} />)
    const el = screen.getByText('—')
    expect(el).not.toHaveAttribute('data-stage-code')
    expect(el.className).toMatch(/bg-muted/)
  })
})
