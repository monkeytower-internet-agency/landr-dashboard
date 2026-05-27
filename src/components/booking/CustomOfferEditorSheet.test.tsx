// landr-sbhz.2 — Custom Offer composer UI smoke + interaction coverage.
//
// Verifies the editor loads an existing offer, the live preview reflects
// free-spot exclusion + the >threshold group discount, and Save sends a
// payload that flags free spots (priced 0) and carries the discount/tax
// config so the server can recompute commission-free totals.

import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

const { fetchMock, putMock, clearMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  putMock: vi.fn(),
  clearMock: vi.fn(),
}))
vi.mock('@/lib/customOffer', () => ({
  fetchCustomOffer: fetchMock,
  putCustomOffer: putMock,
  clearCustomOffer: clearMock,
}))

// invalidateBookingCaches touches react-query only; stub to a no-op.
vi.mock('@/lib/bookings', () => ({
  invalidateBookingCaches: vi.fn(),
}))

import { CustomOfferEditorSheet } from './CustomOfferEditorSheet'
import type { CustomOffer } from '@/lib/customOffer'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function emptyOffer(): CustomOffer {
  return {
    booking_id: 'b-1',
    custom_offer_applied: false,
    group_threshold: 6,
    group_discount_pct: null,
    group_discount_applied: false,
    free_spot_count: 0,
    paying_count: 0,
    net_total: '0.00',
    tax_total: '0.00',
    gross_total: '0.00',
    balance_due: '0.00',
    lines: [],
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('CustomOfferEditorSheet', () => {
  it('previews free-spot exclusion + >6 group discount and saves the right payload', async () => {
    fetchMock.mockResolvedValue(emptyOffer())
    putMock.mockResolvedValue({ ...emptyOffer(), custom_offer_applied: true })

    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )

    // Wait for the seeded single empty line.
    await waitFor(() =>
      expect(screen.getAllByTestId('custom-offer-line').length).toBe(1),
    )

    // Build 7 paying participants @ 100 + 1 free spot. Start by setting
    // the first line, then add the rest.
    function setPrice(index: number, value: string) {
      const prices = screen.getAllByTestId('custom-offer-line-price')
      fireEvent.change(prices[index], { target: { value } })
    }

    // first line -> 100
    setPrice(0, '100')
    // add 6 more paying lines
    for (let i = 1; i < 7; i++) {
      fireEvent.click(screen.getByTestId('custom-offer-add-line'))
      setPrice(i, '100')
    }
    // add a free spot
    fireEvent.click(screen.getByTestId('custom-offer-add-line'))
    const frees = screen.getAllByTestId('custom-offer-line-free')
    fireEvent.click(frees[7])

    // set discount 10% (threshold default 6, tax default 7)
    fireEvent.change(screen.getByTestId('custom-offer-discount'), {
      target: { value: '10' },
    })

    // Preview: 7 paying > 6 -> 10% discount. net = 700 * 0.9 = 630.
    // free spots add nothing. gross = 630 * 1.07 = 674.10.
    await waitFor(() => {
      expect(screen.getByTestId('custom-offer-net')).toHaveTextContent('630.00')
    })
    expect(screen.getByTestId('custom-offer-free-count')).toHaveTextContent('1')
    expect(screen.getByTestId('custom-offer-gross')).toHaveTextContent('674.10')

    // Save -> payload flags the free line at price 0, sends discount/tax
    // as fractions.
    fireEvent.click(screen.getByTestId('custom-offer-save'))
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1))

    const [, , body] = putMock.mock.calls[0]
    expect(body.group_threshold).toBe(6)
    expect(body.group_discount_pct).toBe('0.1000')
    expect(body.tax_rate).toBe('0.0700')
    expect(body.lines).toHaveLength(8)
    const free = body.lines.filter((l: { is_free: boolean }) => l.is_free)
    expect(free).toHaveLength(1)
    expect(free[0].unit_price).toBe('0.00')
    const paying = body.lines.filter((l: { is_free: boolean }) => !l.is_free)
    expect(paying.every((l: { unit_price: string }) => l.unit_price === '100.00')).toBe(true)
  })

  it('no discount when paying count does not exceed the threshold', async () => {
    fetchMock.mockResolvedValue(emptyOffer())
    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )
    await waitFor(() =>
      expect(screen.getAllByTestId('custom-offer-line').length).toBe(1),
    )
    // single line @ 100, discount 10%, threshold 6 -> 1 <= 6 -> no discount
    fireEvent.change(screen.getAllByTestId('custom-offer-line-price')[0], {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByTestId('custom-offer-discount'), {
      target: { value: '10' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('custom-offer-net')).toHaveTextContent('100.00')
    })
  })

  it('shows a Clear action only when an offer is already applied', async () => {
    fetchMock.mockResolvedValue({
      ...emptyOffer(),
      custom_offer_applied: true,
      lines: [
        {
          id: 'l1',
          booking_participant_id: null,
          label: 'Pilot',
          unit_price: '100.00',
          is_free: false,
          sort_order: 0,
          notes: null,
        },
      ],
    })
    clearMock.mockResolvedValue(emptyOffer())
    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('custom-offer-clear')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId('custom-offer-clear'))
    await waitFor(() => expect(clearMock).toHaveBeenCalledTimes(1))
  })
})
