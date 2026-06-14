// landr-z4lj — tests for the BookingParticipants panel.
//
// Renders the component with a fresh QueryClient and mocks
// fetchBookingParticipants. Asserts the column shape, the
// do-not-contact badge (landr-h46a), and the click-name → onContactClick
// stacked-sheet hook used by the parent route to open ContactDetailSheet.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

import type { BookingParticipantRow } from '@/lib/booking-participants'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchBookingParticipants: vi.fn<
      (bookingId: string) => Promise<BookingParticipantRow[]>
    >(),
  },
}))

vi.mock('@/lib/booking-participants', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/booking-participants')
  >('@/lib/booking-participants')
  return {
    ...actual,
    fetchBookingParticipants: mocks.fetchBookingParticipants,
  }
})

import { BookingParticipants } from './BookingParticipants'

const BOOKING_ID = 'bk-1'

function makeParticipant(
  overrides: Partial<BookingParticipantRow> = {},
): BookingParticipantRow {
  return {
    id: 'p1',
    booking_id: BOOKING_ID,
    notes: null,
    contact: {
      id: 'c1',
      first_name: 'Alice',
      last_name: 'Adams',
      email: 'alice@example.com',
      phone: '+34600000001',
      do_not_contact: false,
    },
    service_role: { id: 'sr1', code: 'pilot', label: 'Pilot' },
    // landr-wv0m: guiding participant — is_guiding=true, no companion_kind.
    is_guiding: true,
    companion_kind: null,
    ...overrides,
  }
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookingParticipants', () => {
  it('renders empty-state card when zero participants', async () => {
    mocks.fetchBookingParticipants.mockResolvedValue([])
    renderWithClient(<BookingParticipants bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(screen.getByText(/No participants on this booking yet/i)).toBeInTheDocument(),
    )
    expect(screen.getByTestId('booking-participants-empty')).toBeInTheDocument()
    expect(mocks.fetchBookingParticipants).toHaveBeenCalledWith(BOOKING_ID)
  })

  it('renders a row with name, role, email, phone', async () => {
    mocks.fetchBookingParticipants.mockResolvedValue([makeParticipant()])
    renderWithClient(<BookingParticipants bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(screen.getByText('Alice Adams')).toBeInTheDocument(),
    )
    expect(screen.getByText('Pilot')).toBeInTheDocument()
    // mailto: + tel: anchors keep the row scannable but actionable.
    const emailLink = screen.getByRole('link', { name: 'alice@example.com' })
    expect(emailLink).toHaveAttribute('href', 'mailto:alice@example.com')
    const phoneLink = screen.getByRole('link', { name: '+34600000001' })
    expect(phoneLink).toHaveAttribute('href', 'tel:+34600000001')
  })

  it('shows the "no marketing" badge when do_not_contact is true (landr-h46a)', async () => {
    mocks.fetchBookingParticipants.mockResolvedValue([
      makeParticipant({
        id: 'p2',
        contact: {
          id: 'c2',
          first_name: 'Brett',
          last_name: 'Boyd',
          email: 'brett@example.com',
          phone: null,
          do_not_contact: true,
        },
      }),
    ])
    renderWithClient(<BookingParticipants bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('Brett Boyd')).toBeInTheDocument())
    expect(screen.getByTestId('booking-participant-do-not-contact-p2')).toHaveTextContent(
      /no marketing/i,
    )
  })

  it('omits the do-not-contact badge when the flag is false', async () => {
    mocks.fetchBookingParticipants.mockResolvedValue([makeParticipant()])
    renderWithClient(<BookingParticipants bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('Alice Adams')).toBeInTheDocument())
    expect(screen.queryByText(/no marketing/i)).not.toBeInTheDocument()
  })

  it('clicking a participant name forwards onContactClick with the contact_id', async () => {
    const onContactClick = vi.fn()
    mocks.fetchBookingParticipants.mockResolvedValue([makeParticipant()])
    renderWithClient(
      <BookingParticipants
        bookingId={BOOKING_ID}
        onContactClick={onContactClick}
      />,
    )

    await waitFor(() => expect(screen.getByText('Alice Adams')).toBeInTheDocument())
    // CustomerNameLink renders a button with the customer-name-link testid;
    // assert the click reaches the parent route's stacked-sheet hook with
    // the right contact id (Customer 360 pattern — landr-7o2a).
    await userEvent.click(screen.getByText('Alice Adams'))
    expect(onContactClick).toHaveBeenCalledWith('c1')
  })

  it('renders the name as plain text (not a link) when no onContactClick is supplied', async () => {
    mocks.fetchBookingParticipants.mockResolvedValue([makeParticipant()])
    renderWithClient(<BookingParticipants bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('Alice Adams')).toBeInTheDocument())
    expect(
      screen.queryByTestId('customer-name-link'),
    ).not.toBeInTheDocument()
  })

  it('renders em-dash placeholders when the contact has no email or phone', async () => {
    mocks.fetchBookingParticipants.mockResolvedValue([
      makeParticipant({
        id: 'p3',
        contact: {
          id: 'c3',
          first_name: 'Chris',
          last_name: 'Crowe',
          email: null,
          phone: null,
          do_not_contact: false,
        },
      }),
    ])
    renderWithClient(<BookingParticipants bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('Chris Crowe')).toBeInTheDocument())
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows error state when the fetcher rejects', async () => {
    mocks.fetchBookingParticipants.mockRejectedValue(new Error('boom'))
    renderWithClient(<BookingParticipants bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(
        screen.getByText(/Could not load participants/i),
      ).toBeInTheDocument(),
    )
  })
})
