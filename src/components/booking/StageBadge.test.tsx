import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageBadge } from './StageBadge'

describe('StageBadge', () => {
  it('renders the localised label for a known state', () => {
    render(<StageBadge state="confirmed" stageCode="confirmed" />)
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
  })

  // landr-12ux — known stage codes now surface a plain-English
  // explanation via the shadcn Tooltip (and as the native `title` for
  // a11y / keyboard users). Unknown codes still fall back to the raw
  // `Stage: <code>` debug string from t.bookings.detail.stageTooltip.
  it('uses the canonical stage-code explanation as the title for known codes', () => {
    render(
      <StageBadge
        state="pending"
        stageCode="awaiting_hotel_approval"
      />,
    )
    const el = screen.getByText(/awaiting hotel/i)
    expect(el).toHaveAttribute(
      'title',
      expect.stringContaining('hotel'),
    )
    // The explanation should be a sentence, not the bare code.
    expect(el.getAttribute('title')).not.toMatch(/^Stage:/)
  })

  it('falls back to the semantic-state explanation when the stage code is unknown', () => {
    // Unknown operator-defined stage code → StageBadge labels by
    // semantic state (no humanisation here; that's StageChip's job).
    // The title falls back to the semantic-state explanation so the
    // operator still gets a helpful hover.
    render(
      <StageBadge state="pending" stageCode="awaiting_legal_review" />,
    )
    const el = screen.getByText(/pending/i)
    expect(el).toHaveAttribute(
      'data-stage-code',
      'awaiting_legal_review',
    )
    expect(el.getAttribute('title')).toMatch(/not yet confirmed/i)
  })

  it('exposes the semantic state via data-state for color assertions', () => {
    render(<StageBadge state="cancelled" stageCode="cancelled" />)
    const el = screen.getByText(/cancelled/i)
    expect(el).toHaveAttribute('data-state', 'cancelled')
  })
})
