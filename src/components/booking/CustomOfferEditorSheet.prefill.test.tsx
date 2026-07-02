// landr-uvfg T3 — CustomOfferEditorSheet: participant prefill + regular
// price display + per-line and all-line reset.
//
// Verifies:
//  (a) when the GET returns participant-seeded lines, the editor pre-fills
//      name labels and booking_participant_id (via prefilled data);
//  (b) each line's regular_unit_price shows as a muted "Regular: X" hint;
//  (c) the per-line RotateCcw button resets unitPrice to regularUnitPrice;
//  (d) the footer "Reset all to regular" button resets ALL non-free lines.

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

// A GET response with two participant-seeded lines (as T2 returns when no
// saved custom_offer_lines exist).
function participantSeededOffer(): CustomOffer {
  return {
    booking_id: 'b-pf',
    custom_offer_applied: false,
    group_threshold: 6,
    group_discount_pct: null,
    group_discount_applied: false,
    free_spot_count: 0,
    paying_count: 2,
    net_total: '186.92',
    tax_total: '13.08',
    gross_total: '200.00',
    balance_due: '200.00',
    lines: [
      {
        id: 'default-p1',
        booking_participant_id: 'p1-id',
        label: 'Alice Wonderland',
        unit_price: '100.00',
        regular_unit_price: '100.00',
        is_free: false,
        sort_order: 0,
        notes: null,
      },
      {
        id: 'default-p2',
        booking_participant_id: 'p2-id',
        label: 'Bob Builder',
        unit_price: '100.00',
        regular_unit_price: '100.00',
        is_free: false,
        sort_order: 1,
        notes: null,
      },
    ],
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('CustomOfferEditorSheet — prefill + regular price + reset', () => {
  it('(a) shows participant names pre-filled in label inputs', async () => {
    fetchMock.mockResolvedValue(participantSeededOffer())
    putMock.mockResolvedValue(participantSeededOffer())

    render(
      <CustomOfferEditorSheet bookingId="b-pf" operatorId="op-1" onClose={() => {}} />,
    )

    await waitFor(() =>
      expect(screen.getAllByTestId('custom-offer-line').length).toBe(2),
    )

    const labels = screen.getAllByTestId('custom-offer-line-label')
    const values = labels.map((el) => (el as HTMLInputElement).value)
    expect(values).toContain('Alice Wonderland')
    expect(values).toContain('Bob Builder')
  })

  it('(b) shows regular price hint on each participant line', async () => {
    fetchMock.mockResolvedValue(participantSeededOffer())
    putMock.mockResolvedValue(participantSeededOffer())

    render(
      <CustomOfferEditorSheet bookingId="b-pf" operatorId="op-1" onClose={() => {}} />,
    )

    await waitFor(() =>
      expect(screen.getAllByTestId('custom-offer-line-regular-price').length).toBe(2),
    )

    const hints = screen.getAllByTestId('custom-offer-line-regular-price')
    for (const hint of hints) {
      expect(hint.textContent).toContain('100.00')
    }
  })

  it('(c) per-line reset button restores regular unit price', async () => {
    fetchMock.mockResolvedValue(participantSeededOffer())
    putMock.mockResolvedValue(participantSeededOffer())

    render(
      <CustomOfferEditorSheet bookingId="b-pf" operatorId="op-1" onClose={() => {}} />,
    )

    await waitFor(() =>
      expect(screen.getAllByTestId('custom-offer-line').length).toBe(2),
    )

    // Change first line's price to 85
    const prices = screen.getAllByTestId('custom-offer-line-price')
    fireEvent.change(prices[0], { target: { value: '85' } })
    expect((prices[0] as HTMLInputElement).value).toBe('85')

    // Click per-line reset on first line
    const resets = screen.getAllByTestId('custom-offer-line-reset')
    fireEvent.click(resets[0])

    // Price should revert to 100.00
    await waitFor(() => {
      const updatedPrices = screen.getAllByTestId('custom-offer-line-price')
      expect((updatedPrices[0] as HTMLInputElement).value).toBe('100.00')
    })
  })

  it('(d) footer "Reset all to regular" resets all non-free lines', async () => {
    fetchMock.mockResolvedValue(participantSeededOffer())
    putMock.mockResolvedValue(participantSeededOffer())

    render(
      <CustomOfferEditorSheet bookingId="b-pf" operatorId="op-1" onClose={() => {}} />,
    )

    await waitFor(() =>
      expect(screen.getAllByTestId('custom-offer-line').length).toBe(2),
    )

    // Change both prices
    const prices = screen.getAllByTestId('custom-offer-line-price')
    fireEvent.change(prices[0], { target: { value: '75' } })
    fireEvent.change(prices[1], { target: { value: '80' } })

    // Click "Reset all to regular"
    const resetAll = screen.getByTestId('custom-offer-reset-all')
    fireEvent.click(resetAll)

    // Both should revert to 100.00
    await waitFor(() => {
      const updatedPrices = screen.getAllByTestId('custom-offer-line-price')
      expect((updatedPrices[0] as HTMLInputElement).value).toBe('100.00')
      expect((updatedPrices[1] as HTMLInputElement).value).toBe('100.00')
    })
  })
})
