import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HotelsTable } from './HotelsTable'
import type { Hotel } from '@/lib/hotels'

function makeHotel(overrides: Partial<Hotel> = {}): Hotel {
  return {
    id: 'hotel-1',
    name: 'Hotel Sol',
    email: 'reception@hotel-sol.example',
    address: 'Calle del Mar 12',
    phone: '+34 600 000 000',
    maps_link: 'https://maps.google.com/sol',
    website: null,
    contact_email: null,
    checkin_time: null,
    checkout_time: null,
    timezone: null,
    missing_email: false,
    created_at: '2026-06-11T10:00:00.000Z',
    updated_at: '2026-06-11T10:00:00.000Z',
    ...overrides,
  }
}

describe('HotelsTable', () => {
  it('shows the red Missing email badge when missing_email is true', () => {
    render(
      <HotelsTable
        rows={[makeHotel({ email: null, missing_email: true })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText(/missing email/i)).toBeInTheDocument()
    // The email text is NOT shown when missing.
    expect(
      screen.queryByText('reception@hotel-sol.example'),
    ).not.toBeInTheDocument()
  })

  it('shows the email + address when present (no missing-email badge)', () => {
    render(
      <HotelsTable
        rows={[makeHotel()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByText(/missing email/i)).not.toBeInTheDocument()
    expect(
      screen.getByText('reception@hotel-sol.example'),
    ).toBeInTheDocument()
    expect(screen.getByText('Calle del Mar 12')).toBeInTheDocument()
    expect(screen.getByText('+34 600 000 000')).toBeInTheDocument()
  })

  it('wires Edit and Delete actions per row', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <HotelsTable rows={[makeHotel()]} onEdit={onEdit} onDelete={onDelete} />,
    )
    // Both desktop + mobile clusters render; pick the first match of each.
    screen.getAllByRole('button', { name: /Edit — Hotel Sol/i })[0].click()
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'hotel-1' }))
    screen.getAllByRole('button', { name: /Delete — Hotel Sol/i })[0].click()
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hotel-1' }),
    )
  })

  it('renders the empty message when there are no rows', () => {
    render(<HotelsTable rows={[]} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/no hotels yet/i)).toBeInTheDocument()
  })
})
