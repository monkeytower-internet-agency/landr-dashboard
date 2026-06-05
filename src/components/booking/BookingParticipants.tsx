// landr-z4lj — Participants tab inside BookingDetailSheet.
//
// Read-only roster of the booking's service-recipients (booking_participants).
// The customer/booker is rendered separately in the Details tab card; this
// panel surfaces every participant — pilot, passenger, companion — with
// the columns operators triage by: name, role, email, phone.
//
// Clicking a participant name calls onContactClick(contact_id) so the
// parent route can stack a ContactDetailSheet over the BookingDetailSheet
// (same pattern Customer 360 / landr-7o2a established for the booker
// link in the sheet header).
//
// Data: fetched via Supabase REST directly (booking_participants is
// operator-scoped via RLS) — no FastAPI write involved. Empty state is a
// compact card; loading + error states are inline-text per the
// BookingPayments precedent.

import { useQuery } from '@tanstack/react-query'

import { Card, CardContent } from '@/components/ui/card'
import { CustomerNameLink } from '@/components/CustomerNameLink'
import {
  fetchBookingParticipants,
  participantDisplayName,
  participantRoleLabel,
  type BookingParticipantRow,
} from '@/lib/booking-participants'
import { t } from '@/lib/strings'

type Props = {
  bookingId: string
  onContactClick?: (contactId: string) => void
}

const PARTICIPANTS_QUERY_KEY = 'booking-participants'

function participantsQueryKey(bookingId: string) {
  return [PARTICIPANTS_QUERY_KEY, bookingId] as const
}

export function BookingParticipants({ bookingId, onContactClick }: Props) {
  const query = useQuery({
    queryKey: participantsQueryKey(bookingId),
    queryFn: () => fetchBookingParticipants(bookingId),
  })

  if (query.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {t.bookings.participants.loading}
      </p>
    )
  }

  if (query.error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t.bookings.participants.error}
      </p>
    )
  }

  const rows = query.data ?? []
  if (rows.length === 0) {
    return (
      <Card data-testid="booking-participants-empty">
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm">
            {t.bookings.participants.empty}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* landr-3qkr.6 — overflow-x-auto so the participants table (name ·
            role · email · phone) scrolls inside the card on a 360px phone
            instead of being clipped by the page-level overflow-x-guard. */}
        <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          data-testid="booking-participants-table"
        >
          <thead>
            <tr className="border-b">
              <th
                scope="col"
                className="text-muted-foreground px-3 py-2 text-left text-xs font-medium uppercase tracking-wide"
              >
                {t.bookings.participants.columnName}
              </th>
              <th
                scope="col"
                className="text-muted-foreground px-3 py-2 text-left text-xs font-medium uppercase tracking-wide"
              >
                {t.bookings.participants.columnRole}
              </th>
              <th
                scope="col"
                className="text-muted-foreground px-3 py-2 text-left text-xs font-medium uppercase tracking-wide"
              >
                {t.bookings.participants.columnEmail}
              </th>
              <th
                scope="col"
                className="text-muted-foreground px-3 py-2 text-left text-xs font-medium uppercase tracking-wide"
              >
                {t.bookings.participants.columnPhone}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ParticipantRow
                key={row.id}
                row={row}
                onContactClick={onContactClick}
              />
            ))}
          </tbody>
        </table>
        </div>
      </CardContent>
    </Card>
  )
}

type RowProps = {
  row: BookingParticipantRow
  onContactClick?: (contactId: string) => void
}

function ParticipantRow({ row, onContactClick }: RowProps) {
  const display = participantDisplayName(row)
  const role = participantRoleLabel(row)
  const email = row.contact?.email ?? null
  const phone = row.contact?.phone ?? null
  const doNotContact = row.contact?.do_not_contact === true
  const contactId = row.contact?.id ?? null

  return (
    <tr
      className="border-b last:border-b-0"
      data-testid={`booking-participant-${row.id}`}
    >
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {contactId && onContactClick ? (
            <CustomerNameLink
              contactId={contactId}
              display={display}
              onClick={onContactClick}
              className="font-medium"
            />
          ) : (
            <span className="font-medium">{display}</span>
          )}
          {/* landr-h46a — flag participants who opted out of non-transactional
              mail. Transactional kinds (confirmations etc.) still send; the
              EmailSenderService consumer-side guard handles that — the badge
              is purely an operator-facing nudge before they reach for a
              reminder/marketing template. */}
          {doNotContact ? (
            <span
              className="border-muted-foreground/30 text-muted-foreground inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              title={t.bookings.participants.doNotContactHint}
              data-testid={`booking-participant-do-not-contact-${row.id}`}
            >
              {t.bookings.participants.doNotContactBadge}
            </span>
          ) : null}
        </div>
      </td>
      <td className="text-muted-foreground px-3 py-2 align-top">{role}</td>
      <td className="px-3 py-2 align-top">
        {email ? (
          <a
            href={`mailto:${email}`}
            className="underline-offset-4 hover:underline"
          >
            {email}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="underline-offset-4 hover:underline"
          >
            {phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  )
}
