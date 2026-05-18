import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageBadge } from './StageBadge'

describe('StageBadge', () => {
  it('renders the localised label for a known state', () => {
    render(<StageBadge state="confirmed" stageCode="confirmed" />)
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
  })

  it('puts the raw stage code in a tooltip so multi-stage groups stay legible', () => {
    render(
      <StageBadge
        state="awaiting_hotel_approval"
        stageCode="awaiting_hotel_approval"
      />,
    )
    const el = screen.getByText(/awaiting hotel/i)
    expect(el).toHaveAttribute('title', expect.stringContaining('awaiting_hotel_approval'))
  })

  it('exposes the semantic state via data-state for color assertions', () => {
    render(<StageBadge state="cancelled" stageCode="cancelled" />)
    const el = screen.getByText(/cancelled/i)
    expect(el).toHaveAttribute('data-state', 'cancelled')
  })
})
