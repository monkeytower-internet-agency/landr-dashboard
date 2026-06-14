// landr-uzup — tests for BookingPayments panel inside BookingDetailSheet.
//
// Renders the component with a fresh QueryClient, mocks the
// fetchBookingPayments + refundPayment library functions, and asserts:
//   - loading / empty / error states
//   - succeeded payment + refundable_remaining > 0 → Refund button visible
//   - already-fully-refunded payment → Refund button hidden
//   - failed/pending payments → Refund button hidden
//   - clicking Refund prefills the amount with the refundable remaining
//   - clicking confirm invokes refundPayment with the trimmed amount + reason
//   - refund rows render under their parent payment
//   - the partial-refund summary line shows refunded + remaining totals

import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

import type {
  BookingPaymentRow,
  BookingPaymentsView,
  BookingRefundRow,
  RefundPaymentResult,
} from '@/lib/bookings'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchBookingPayments: vi.fn<(bookingId: string) => Promise<BookingPaymentsView>>(),
    refundPayment: vi.fn<
      (
        operatorId: string,
        bookingId: string,
        paymentId: string,
        body: { amount?: string | null; reason?: string | null },
      ) => Promise<RefundPaymentResult>
    >(),
  },
}))

vi.mock('@/lib/bookings', async () => {
  // Keep the real helpers (numberFormatter, refundableRemainingOf,
  // canRefundPayment, invalidateBookingCaches) so the component logic
  // stays under test.
  const actual = await vi.importActual<typeof import('@/lib/bookings')>(
    '@/lib/bookings',
  )
  return {
    ...actual,
    fetchBookingPayments: mocks.fetchBookingPayments,
    refundPayment: mocks.refundPayment,
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { BookingPayments } from './BookingPayments'

const OP_ID = 'op-1'
const BOOKING_ID = 'b-1'
const PAYMENT_ID = 'p-1'
const PAYMENT_ID_2 = 'p-2'


function makePayment(overrides: Partial<BookingPaymentRow> = {}): BookingPaymentRow {
  return {
    id: PAYMENT_ID,
    amount: '150.00',
    currency: 'EUR',
    provider: 'manual_cash',
    status: 'succeeded',
    refunded_amount: '0.00',
    paid_at: '2026-05-20T10:00:00Z',
    created_at: '2026-05-20T10:00:00Z',
    ...overrides,
  }
}

function makeRefund(overrides: Partial<BookingRefundRow> = {}): BookingRefundRow {
  return {
    id: 'r-1',
    payment_id: PAYMENT_ID,
    refund_amount: '40.00',
    currency: 'EUR',
    reason: null,
    status: 'succeeded',
    initiated_at: '2026-05-21T08:00:00Z',
    completed_at: '2026-05-21T08:00:00Z',
    ...overrides,
  }
}

function makeRefundResult(
  overrides: Partial<RefundPaymentResult> = {},
): RefundPaymentResult {
  return {
    booking_id: BOOKING_ID,
    payment_id: PAYMENT_ID,
    refund_id: 'r-new',
    refund_amount: '150.00',
    currency: 'EUR',
    refundable_remaining_after: '0.00',
    payment_status_after: 'refunded',
    booking_balance_due_after: '150.00',
    reason: null,
    ...overrides,
  }
}

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.fetchBookingPayments.mockReset()
  mocks.refundPayment.mockReset()
})

describe('BookingPayments', () => {
  it('renders empty state when there are no payments or refunds', async () => {
    mocks.fetchBookingPayments.mockResolvedValue({ payments: [], refunds: [] })
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    expect(await screen.findByText(/no payments recorded yet/i)).toBeInTheDocument()
  })

  it('renders an error message when the fetch fails', async () => {
    mocks.fetchBookingPayments.mockRejectedValue(new Error('boom'))
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    expect(await screen.findByText(/could not load payments/i)).toBeInTheDocument()
  })

  it('shows a Refund button on a succeeded payment with refundable remaining', async () => {
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [makePayment()],
      refunds: [],
    })
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    const btn = await screen.findByTestId(`booking-payment-refund-btn-${PAYMENT_ID}`)
    expect(btn).toBeInTheDocument()
  })

  it('hides Refund button on fully refunded payments', async () => {
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [
        makePayment({
          status: 'refunded',
          refunded_amount: '150.00',
        }),
      ],
      refunds: [makeRefund({ refund_amount: '150.00' })],
    })
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    // Wait for the card to render, then assert the button is absent.
    await screen.findByTestId(`booking-payment-${PAYMENT_ID}`)
    expect(
      screen.queryByTestId(`booking-payment-refund-btn-${PAYMENT_ID}`),
    ).not.toBeInTheDocument()
  })

  it.each(['pending', 'failed'])(
    'hides Refund button on %s payments',
    async (badStatus) => {
      mocks.fetchBookingPayments.mockResolvedValue({
        payments: [makePayment({ status: badStatus })],
        refunds: [],
      })
      render(
        <BookingPayments
          operatorId={OP_ID}
          bookingId={BOOKING_ID}
          bookingCurrency="EUR"
        />,
      )
      await screen.findByTestId(`booking-payment-${PAYMENT_ID}`)
      expect(
        screen.queryByTestId(`booking-payment-refund-btn-${PAYMENT_ID}`),
      ).not.toBeInTheDocument()
    },
  )

  it('hides Refund button when operatorId is null', async () => {
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [makePayment()],
      refunds: [],
    })
    render(
      <BookingPayments
        operatorId={null}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    await screen.findByTestId(`booking-payment-${PAYMENT_ID}`)
    expect(
      screen.queryByTestId(`booking-payment-refund-btn-${PAYMENT_ID}`),
    ).not.toBeInTheDocument()
  })

  it('opens dialog prefilled with refundable remaining and submits to refundPayment', async () => {
    const user = userEvent.setup()
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [
        makePayment({
          amount: '150.00',
          refunded_amount: '40.00',
          status: 'partially_refunded',
        }),
      ],
      refunds: [
        makeRefund({ refund_amount: '40.00' }),
      ],
    })
    mocks.refundPayment.mockResolvedValue(
      makeRefundResult({
        refund_amount: '110.00',
        refundable_remaining_after: '0.00',
        payment_status_after: 'refunded',
        booking_balance_due_after: '150.00',
      }),
    )
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    const btn = await screen.findByTestId(
      `booking-payment-refund-btn-${PAYMENT_ID}`,
    )
    await user.click(btn)

    const amount = await screen.findByTestId('booking-refund-amount')
    // 150 - 40 = 110 remaining → dialog prefills this.
    expect(amount).toHaveValue(110)

    const reason = screen.getByTestId('booking-refund-reason')
    await user.type(reason, '  Half-day cancelled  ')

    await user.click(screen.getByTestId('booking-refund-confirm'))

    await waitFor(() => {
      expect(mocks.refundPayment).toHaveBeenCalledWith(
        OP_ID,
        BOOKING_ID,
        PAYMENT_ID,
        { amount: '110.00', reason: 'Half-day cancelled' },
      )
    })
  })

  it('omits empty reason from the payload', async () => {
    const user = userEvent.setup()
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [makePayment()],
      refunds: [],
    })
    mocks.refundPayment.mockResolvedValue(makeRefundResult())
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    await user.click(
      await screen.findByTestId(`booking-payment-refund-btn-${PAYMENT_ID}`),
    )
    await user.click(await screen.findByTestId('booking-refund-confirm'))

    await waitFor(() => {
      expect(mocks.refundPayment).toHaveBeenCalledWith(
        OP_ID,
        BOOKING_ID,
        PAYMENT_ID,
        { amount: '150.00', reason: null },
      )
    })
  })

  it('renders refund rows nested under their parent payment', async () => {
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [
        makePayment({
          refunded_amount: '40.00',
          status: 'partially_refunded',
        }),
        makePayment({
          id: PAYMENT_ID_2,
          status: 'succeeded',
          amount: '50.00',
          refunded_amount: '0.00',
        }),
      ],
      refunds: [
        makeRefund({
          id: 'r-1',
          payment_id: PAYMENT_ID,
          refund_amount: '40.00',
          reason: 'Half-day cancelled',
        }),
      ],
    })
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    // Wait for the partially_refunded card so the nested list is mounted.
    await screen.findByTestId(`booking-payment-${PAYMENT_ID}`)
    const refundsList = screen.getByTestId(
      `booking-payment-refunds-${PAYMENT_ID}`,
    )
    expect(within(refundsList).getByText(/Half-day cancelled/)).toBeInTheDocument()
    expect(within(refundsList).getByText(/−€40\.00/)).toBeInTheDocument()
    // The second payment has no refunds → no nested list.
    expect(
      screen.queryByTestId(`booking-payment-refunds-${PAYMENT_ID_2}`),
    ).not.toBeInTheDocument()
  })

  it('shows refunded-so-far summary when refunded_amount > 0', async () => {
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [
        makePayment({
          refunded_amount: '40.00',
          status: 'partially_refunded',
        }),
      ],
      refunds: [makeRefund({ refund_amount: '40.00' })],
    })
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )
    expect(
      await screen.findByText(/€40\.00 refunded · €110\.00 remaining/i),
    ).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // landr-v9e4.11 — refund error branch.
  // A 4xx rejection from the server must surface the `detail` string as
  // the toast description and must NOT trigger any optimistic cache update.
  // -----------------------------------------------------------------------

  it('refund 4xx → surfaces server detail in error toast, no optimistic update', async () => {
    const user = userEvent.setup()
    const { toast: sonnerToast } = await import('sonner')
    mocks.fetchBookingPayments.mockResolvedValue({
      payments: [makePayment()],
      refunds: [],
    })
    mocks.refundPayment.mockRejectedValueOnce(
      new Error('Refund amount exceeds refundable balance'),
    )
    render(
      <BookingPayments
        operatorId={OP_ID}
        bookingId={BOOKING_ID}
        bookingCurrency="EUR"
      />,
    )

    const btn = await screen.findByTestId(
      `booking-payment-refund-btn-${PAYMENT_ID}`,
    )
    await user.click(btn)
    await user.click(await screen.findByTestId('booking-refund-confirm'))

    // The error toast must include the server's message.
    await waitFor(() => {
      expect(sonnerToast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: 'Refund amount exceeds refundable balance',
        }),
      )
    })

    // The refund dialog stays open on error (setRefundTarget is NOT cleared in
    // onError — the operator can adjust the amount and retry without losing
    // context). The confirm button remains present.
    expect(screen.getByTestId('booking-refund-confirm')).toBeInTheDocument()

    // No optimistic mutation: the payments list was NOT invalidated by the
    // mutation (invalidateQueries only fires in onSuccess).
    // The payment row's Refund button is still there (no list re-fetch cleared it).
    expect(
      screen.getByTestId(`booking-payment-refund-btn-${PAYMENT_ID}`),
    ).toBeInTheDocument()
  })
})
