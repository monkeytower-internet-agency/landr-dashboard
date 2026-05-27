// landr-jx4s — formatServiceDateRange covers:
//   - the legacy date-only `booking_products.date_range_start` SQL shape
//     (Postgres `date`, no time component), AND
//   - future ISO timestamps with a meaningful time-of-day, which should
//     render the operator-local hour:minute on intra-day single bookings.
//
// These tests pin the behavior so a later widening of the column (or a
// caller that passes a join-derived ISO timestamp) can't silently break
// the bookings table.
//
// NOTE on output: the helper uses Intl.DateTimeFormat('en-IE', ...) which
// formats short weekday/day/month as "Fri, 22 May" (with a comma) and the
// h12 hour cycle as lowercase 'am'/'pm'. The assertions below mirror that
// real output rather than the loose 'Wed 22 May 2:30 PM' from the ticket.

import { describe, expect, it } from 'vitest'

import { formatServiceDateRange } from './bookings'

describe('formatServiceDateRange — date-only (current SQL shape)', () => {
  it('renders a single date when end is null', () => {
    // Anchored at UTC noon inside the helper, so the weekday matches the
    // wall-clock date regardless of host TZ.
    expect(formatServiceDateRange('2026-05-22', null)).toBe('Fri, 22 May')
  })

  it('renders a single date when start === end', () => {
    expect(formatServiceDateRange('2026-05-22', '2026-05-22')).toBe(
      'Fri, 22 May',
    )
  })

  it('renders a date range when start < end', () => {
    expect(formatServiceDateRange('2026-05-22', '2026-05-25')).toBe(
      'Fri, 22 May – Mon, 25 May',
    )
  })
})

describe('formatServiceDateRange — ISO timestamps with opts (landr-jx4s)', () => {
  it('appends 12h time when intra-day and opts.hour12=true', () => {
    expect(
      formatServiceDateRange('2026-05-22T14:30:00', '2026-05-22T14:30:00', {
        hour12: true,
      }),
    ).toBe('Fri, 22 May, 2:30 pm')
  })

  it('appends 24h time when intra-day and opts.hour12=false', () => {
    expect(
      formatServiceDateRange('2026-05-22T14:30:00', '2026-05-22T14:30:00', {
        hour12: false,
      }),
    ).toBe('Fri, 22 May, 14:30')
  })

  it('appends the start time when end is null but start carries time', () => {
    // null end is equivalent to single-day for the formatter.
    expect(
      formatServiceDateRange('2026-05-22T09:05:00Z', null, { hour12: false }),
    ).toBe('Fri, 22 May, 09:05')
  })

  it('treats midnight UTC start as all-day and omits the time', () => {
    // Booking products with a `timestamptz` cast of a plain date land at
    // 00:00:00Z; this is the all-day signal, not "the booking starts at
    // exactly midnight" — render date only.
    expect(
      formatServiceDateRange('2026-05-22T00:00:00Z', '2026-05-22T00:00:00Z', {
        hour12: true,
      }),
    ).toBe('Fri, 22 May')
  })

  it('renders multi-day timestamps as date range only (no times)', () => {
    expect(
      formatServiceDateRange('2026-05-22T14:30:00', '2026-05-25T16:00:00', {
        hour12: true,
      }),
    ).toBe('Fri, 22 May – Mon, 25 May')
  })

  it('omits the time when opts is not provided even if input has a time', () => {
    // Backward-compat: callers that haven't been updated keep the legacy
    // date-only output, even if a time component sneaks into the input.
    expect(
      formatServiceDateRange('2026-05-22T14:30:00', '2026-05-22T14:30:00'),
    ).toBe('Fri, 22 May')
  })
})
