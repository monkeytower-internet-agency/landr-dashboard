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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

const { fetchMock, putMock, clearMock, sendOfferMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  putMock: vi.fn(),
  clearMock: vi.fn(),
  sendOfferMock: vi.fn(),
}))
vi.mock('@/lib/customOffer', () => ({
  fetchCustomOffer: fetchMock,
  putCustomOffer: putMock,
  clearCustomOffer: clearMock,
  sendOffer: sendOfferMock,
}))

// invalidateBookingCaches touches react-query only; stub to a no-op.
vi.mock('@/lib/bookings', () => ({
  invalidateBookingCaches: vi.fn(),
}))

// landr-c53m.1 — this operator's Custom Offer defaults (formerly the
// Para42-hardcoded 6 / 7% initial state). Mocked to those same values so
// the existing assertions below (discount threshold 6, tax 7%) still
// describe this operator's OWN configured contract, not a hardcoded default.
const { fetchOperatorMock } = vi.hoisted(() => ({
  fetchOperatorMock: vi.fn(),
}))
vi.mock('@/lib/operatorSettings', () => ({
  fetchOperator: fetchOperatorMock,
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

beforeEach(() => {
  // landr-c53m.1 — this operator's configured Custom Offer defaults.
  // Individual tests below rely on tax defaulting to 7% (para42-style
  // contract terms), same as before this operator-config plumbing existed.
  fetchOperatorMock.mockResolvedValue({
    id: 'op-1',
    default_tax_rate: 0.07,
    group_discount_threshold: 6,
  })
})

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

  // landr-c53m.1 — the composer must seed from THIS operator's config, not
  // a hardcoded Para42 (6 / 7%) literal.
  it('seeds threshold + tax from the operator config, not a hardcoded Para42 default', async () => {
    fetchOperatorMock.mockResolvedValue({
      id: 'op-2',
      default_tax_rate: 0.19,
      group_discount_threshold: 3,
    })
    fetchMock.mockResolvedValue({ ...emptyOffer(), group_threshold: null })
    putMock.mockResolvedValue({ ...emptyOffer(), custom_offer_applied: true })

    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-2" onClose={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('custom-offer-threshold')).toHaveValue(3)
    })
    expect(screen.getByTestId('custom-offer-tax')).toHaveValue(19)

    fireEvent.click(screen.getByTestId('custom-offer-save'))
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1))
    const [, , body] = putMock.mock.calls[0]
    expect(body.group_threshold).toBe(3)
    expect(body.tax_rate).toBe('0.1900')
  })

  // landr-c53m.1 fix-forward — CRITICAL wrong-money fix: a failed operator
  // fetch must never let staff silently save a real 0%-tax, threshold-0
  // offer. Save stays disabled + a banner/retry is shown until the fetch
  // succeeds (via Retry) or the user explicitly enters BOTH values.
  it('operator fetch error disables save + shows banner; retry re-enables it once resolved', async () => {
    fetchOperatorMock.mockRejectedValueOnce(new Error('network down'))
    fetchOperatorMock.mockResolvedValue({
      id: 'op-1',
      default_tax_rate: 0.07,
      group_discount_threshold: 6,
    })
    fetchMock.mockResolvedValue(emptyOffer())

    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )

    // Banner appears, save is disabled — the seeded tax/threshold values
    // are 0 (the neutral operator-fetch-failure fallback) but must not be
    // saveable without the user's explicit sign-off.
    await waitFor(() =>
      expect(screen.getByTestId('custom-offer-operator-error')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('custom-offer-save')).toBeDisabled()

    // Retry succeeds -> banner disappears, seeded operator values appear,
    // and save re-enables.
    fireEvent.click(screen.getByTestId('custom-offer-operator-retry'))
    await waitFor(() =>
      expect(
        screen.queryByTestId('custom-offer-operator-error'),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(screen.getByTestId('custom-offer-save')).toBeEnabled())
    expect(screen.getByTestId('custom-offer-threshold')).toHaveValue(6)
    expect(screen.getByTestId('custom-offer-tax')).toHaveValue(7)
  })

  it('operator fetch error + explicit user-entered tax + threshold allows save with those values', async () => {
    fetchOperatorMock.mockRejectedValue(new Error('network down'))
    fetchMock.mockResolvedValue(emptyOffer())
    putMock.mockResolvedValue({ ...emptyOffer(), custom_offer_applied: true })

    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )

    await waitFor(() =>
      expect(screen.getByTestId('custom-offer-operator-error')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('custom-offer-save')).toBeDisabled()

    // Save remains disabled until BOTH values are explicitly entered.
    fireEvent.change(screen.getByTestId('custom-offer-tax'), { target: { value: '19' } })
    expect(screen.getByTestId('custom-offer-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('custom-offer-threshold'), { target: { value: '3' } })
    await waitFor(() => expect(screen.getByTestId('custom-offer-save')).toBeEnabled())

    fireEvent.click(screen.getByTestId('custom-offer-save'))
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1))
    const [, , body] = putMock.mock.calls[0]
    expect(body.tax_rate).toBe('0.1900')
    expect(body.group_threshold).toBe(3)
  })

  // landr-c53m.1 fix-forward — the happy path (fetch OK) is unchanged: the
  // operator's real config seeds the form (para42-style 7%/6, matching the
  // earlier hardcoded literal), and explicit user edits still win over it.
  it('fetch OK: seeds operator config unchanged, and explicit user edits still win', async () => {
    fetchMock.mockResolvedValue(emptyOffer())
    putMock.mockResolvedValue({ ...emptyOffer(), custom_offer_applied: true })

    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('custom-offer-threshold')).toHaveValue(6)
    })
    expect(screen.getByTestId('custom-offer-tax')).toHaveValue(7)
    expect(screen.getByTestId('custom-offer-save')).toBeEnabled()
    expect(
      screen.queryByTestId('custom-offer-operator-error'),
    ).not.toBeInTheDocument()

    // Explicit user edit overrides the seeded operator default.
    fireEvent.change(screen.getByTestId('custom-offer-tax'), { target: { value: '21' } })
    fireEvent.change(screen.getByTestId('custom-offer-threshold'), { target: { value: '4' } })

    fireEvent.click(screen.getByTestId('custom-offer-save'))
    await waitFor(() => expect(putMock).toHaveBeenCalledTimes(1))
    const [, , body] = putMock.mock.calls[0]
    expect(body.tax_rate).toBe('0.2100')
    expect(body.group_threshold).toBe(4)
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

  // ── landr-uvfg.4 send-offer tests ──────────────────────────────────────────

  it('send-offer button is absent when offer is NOT applied', async () => {
    fetchMock.mockResolvedValue(emptyOffer())
    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )
    await waitFor(() =>
      expect(screen.getAllByTestId('custom-offer-line').length).toBeGreaterThan(0),
    )
    expect(screen.queryByTestId('custom-offer-send')).not.toBeInTheDocument()
  })

  it('send-offer button is visible when custom_offer_applied is true', async () => {
    fetchMock.mockResolvedValue({
      ...emptyOffer(),
      custom_offer_applied: true,
      lines: [
        {
          id: 'l1',
          booking_participant_id: null,
          label: 'Pilot',
          unit_price: '100.00',
          regular_unit_price: null,
          is_free: false,
          sort_order: 0,
          notes: null,
        },
      ],
    })
    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('custom-offer-send')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('custom-offer-send')).toBeEnabled()
  })

  it('clicking send-offer calls sendOffer and shows a success toast', async () => {
    const closeFn = vi.fn()
    fetchMock.mockResolvedValue({
      ...emptyOffer(),
      custom_offer_applied: true,
      lines: [
        {
          id: 'l1',
          booking_participant_id: null,
          label: 'Pilot',
          unit_price: '100.00',
          regular_unit_price: null,
          is_free: false,
          sort_order: 0,
          notes: null,
        },
      ],
    })
    sendOfferMock.mockResolvedValue({
      ok: true,
      sent_to: 'customer@example.com',
      token_preview: 'abc...',
    })
    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={closeFn} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('custom-offer-send')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId('custom-offer-send'))
    await waitFor(() => expect(sendOfferMock).toHaveBeenCalledOnce())
    expect(sendOfferMock).toHaveBeenCalledWith('op-1', 'b-1')
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('customer@example.com'),
    )
    expect(closeFn).toHaveBeenCalled()
  })

  it('clicking send-offer shows an error toast on failure', async () => {
    fetchMock.mockResolvedValue({
      ...emptyOffer(),
      custom_offer_applied: true,
      lines: [
        {
          id: 'l1',
          booking_participant_id: null,
          label: 'Pilot',
          unit_price: '100.00',
          regular_unit_price: null,
          is_free: false,
          sort_order: 0,
          notes: null,
        },
      ],
    })
    sendOfferMock.mockRejectedValue(new Error('Network failure'))
    render(
      <CustomOfferEditorSheet bookingId="b-1" operatorId="op-1" onClose={() => {}} />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('custom-offer-send')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId('custom-offer-send'))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Network failure'),
    )
  })
})
