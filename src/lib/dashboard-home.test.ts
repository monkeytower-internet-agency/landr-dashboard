// landr-p600 — Dashboard-home pure-function tests.

import { describe, it, expect } from 'vitest'
import type { BookingRow } from '@/lib/bookings'
import type { ContactRow } from '@/lib/contacts'
import {
  localDateOnly,
  recentActivity,
  todaysBookings,
  weekBoundsForLocal,
  weekRevenueDaily,
  weekSummary,
} from '@/lib/dashboard-home'

function makeBooking(over: Partial<BookingRow>): BookingRow {
  return {
    id: 'b-x',
    created_at: '2026-05-20T10:00:00.000Z',
    current_semantic_state: 'confirmed',
    current_stage: null,
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-x',
      first_name: 'Alex',
      last_name: 'River',
      email: 'alex@example.com',
      phone: null,
    },
    items: [],
    ...over,
  } as BookingRow
}

function makeContact(over: Partial<ContactRow>): ContactRow {
  return {
    id: 'cc-x',
    operator_id: 'op-1',
    first_name: 'Sam',
    last_name: 'Lee',
    email: 'sam@example.com',
    phone: null,
    preferred_locale: null,
    preferred_timezone: null,
    created_at: '2026-05-20T09:00:00.000Z',
    updated_at: '2026-05-20T09:00:00.000Z',
    deleted_at: null,
    gdpr_erased_at: null,
    gdpr_erased_by_user_id: null,
    gdpr_erasure_note: null,
    ...over,
  } as ContactRow
}

describe('localDateOnly', () => {
  it('zero-pads month and day', () => {
    const d = new Date(2026, 0, 3, 12, 0, 0) // 3 Jan 2026 local
    expect(localDateOnly(d)).toBe('2026-01-03')
  })
})

describe('weekBoundsForLocal', () => {
  it('Monday anchors the week start', () => {
    // 20 May 2026 is a Wednesday.
    const wed = new Date(2026, 4, 20, 12, 0, 0)
    const { start, end } = weekBoundsForLocal(wed)
    expect(start).toBe('2026-05-18')
    expect(end).toBe('2026-05-24')
  })
  it('Sunday belongs to the week that just ended', () => {
    const sun = new Date(2026, 4, 24, 12, 0, 0) // Sunday
    const { start, end } = weekBoundsForLocal(sun)
    expect(start).toBe('2026-05-18')
    expect(end).toBe('2026-05-24')
  })
})

describe('todaysBookings', () => {
  const now = new Date(2026, 4, 20, 12, 0, 0) // 2026-05-20 local

  it('keeps bookings whose earliest item starts today', () => {
    const rows: BookingRow[] = [
      makeBooking({
        id: 'today',
        items: [
          {
            id: 'i-1',
            date_range_start: '2026-05-20',
            date_range_end: '2026-05-20',
            selected_days: null,
            products: {
              id: 'p',
              name: 'Tandem',
              product_kind: 'service' as never,
              service_time_shape: 'single_date',
            },
          },
        ],
      }),
      makeBooking({
        id: 'tomorrow',
        items: [
          {
            id: 'i-2',
            date_range_start: '2026-05-21',
            date_range_end: '2026-05-21',
            selected_days: null,
            products: {
              id: 'p',
              name: 'Tandem',
              product_kind: 'service' as never,
              service_time_shape: 'single_date',
            },
          },
        ],
      }),
    ]
    const out = todaysBookings(rows, now)
    expect(out.map((r) => r.id)).toEqual(['today'])
  })

  it('excludes cancelled bookings', () => {
    const rows: BookingRow[] = [
      makeBooking({
        id: 'cancelled-today',
        current_semantic_state: 'cancelled',
        items: [
          {
            id: 'i',
            date_range_start: '2026-05-20',
            date_range_end: '2026-05-20',
            selected_days: null,
            products: null,
          },
        ],
      }),
    ]
    expect(todaysBookings(rows, now)).toEqual([])
  })

  it('excludes bookings without scheduled items', () => {
    const rows: BookingRow[] = [makeBooking({ id: 'no-items', items: [] })]
    expect(todaysBookings(rows, now)).toEqual([])
  })
})

describe('weekSummary', () => {
  const now = new Date(2026, 4, 20, 12, 0, 0) // week 2026-05-18..2026-05-24
  it('sums revenue, counts bookings, counts new contacts', () => {
    const bookings: BookingRow[] = [
      makeBooking({
        id: 'b1',
        created_at: '2026-05-18T10:00:00.000Z',
        gross_total: 150,
      }),
      makeBooking({
        id: 'b2',
        created_at: '2026-05-22T10:00:00.000Z',
        gross_total: 250,
      }),
      // Cancelled — counts as a booking but not revenue.
      makeBooking({
        id: 'b3',
        created_at: '2026-05-20T10:00:00.000Z',
        current_semantic_state: 'cancelled',
        gross_total: 500,
      }),
      // Outside week.
      makeBooking({
        id: 'b4',
        created_at: '2026-05-10T10:00:00.000Z',
        gross_total: 999,
      }),
    ]
    const contacts: ContactRow[] = [
      makeContact({ id: 'c1', created_at: '2026-05-19T10:00:00.000Z' }),
      makeContact({ id: 'c2', created_at: '2026-05-22T10:00:00.000Z' }),
      makeContact({ id: 'c3', created_at: '2026-04-01T10:00:00.000Z' }),
    ]
    const summary = weekSummary(bookings, contacts, now)
    expect(summary).toEqual({
      revenue: 400,
      currency: 'EUR',
      bookings: 3,
      newContacts: 2,
    })
  })
})

describe('weekRevenueDaily', () => {
  const now = new Date(2026, 4, 20, 12, 0, 0)
  it('returns 7 zero-filled points and assigns revenue to the right day', () => {
    const bookings: BookingRow[] = [
      makeBooking({
        id: 'b1',
        created_at: '2026-05-20T10:00:00.000Z',
        gross_total: 100,
      }),
      makeBooking({
        id: 'b2',
        created_at: '2026-05-20T15:00:00.000Z',
        gross_total: 50,
      }),
    ]
    const points = weekRevenueDaily(bookings, now)
    expect(points).toHaveLength(7)
    expect(points[0].date).toBe('2026-05-18')
    expect(points[6].date).toBe('2026-05-24')
    const wed = points.find((p) => p.date === '2026-05-20')!
    expect(wed.revenue).toBe(150)
    // Other days zero.
    expect(points.filter((p) => p.date !== '2026-05-20').every((p) => p.revenue === 0))
      .toBe(true)
  })
})

describe('recentActivity', () => {
  it('merges sources, sorts desc, caps at limit, dedups via stable id', () => {
    const bookings: BookingRow[] = [
      makeBooking({
        id: 'b-new',
        created_at: '2026-05-20T12:00:00.000Z',
      }),
      makeBooking({
        id: 'b-old',
        created_at: '2026-05-10T12:00:00.000Z',
      }),
    ]
    const contacts: ContactRow[] = [
      makeContact({ id: 'c-new', created_at: '2026-05-20T13:00:00.000Z' }),
    ]
    const approvals: BookingRow[] = [
      makeBooking({
        id: 'b-new',
        created_at: '2026-05-20T12:00:00.000Z',
      }),
    ]
    const events = recentActivity({
      bookings,
      contacts,
      pendingApprovals: approvals,
      customerFallback: 'Unknown',
      limit: 10,
    })
    // c-new (13:00) > b-new booking_created (12:00) > b-new approval_pending (12:00) > b-old.
    expect(events[0].kind).toBe('contact_created')
    expect(events[0].id).toBe('contact:c-new')
    // The two events at the same timestamp keep distinct ids.
    const ids = events.map((e) => e.id)
    expect(ids).toContain('booking:b-new')
    expect(ids).toContain('approval:b-new')
    // Approval event carries the deep link.
    const approval = events.find((e) => e.kind === 'approval_pending')
    expect(approval?.href).toBe('/approvals/general')
  })

  it('respects the limit', () => {
    const bookings: BookingRow[] = Array.from({ length: 25 }, (_, i) =>
      makeBooking({
        id: `b-${i}`,
        created_at: `2026-05-${String(20 - (i % 20)).padStart(2, '0')}T10:00:00.000Z`,
      }),
    )
    const events = recentActivity({
      bookings,
      contacts: [],
      pendingApprovals: [],
      customerFallback: 'Unknown',
      limit: 10,
    })
    expect(events).toHaveLength(10)
  })

  it('falls back to email then to customerFallback for missing names', () => {
    const bookings: BookingRow[] = [
      makeBooking({
        id: 'b-email',
        customer: {
          id: 'c',
          first_name: null,
          last_name: null,
          email: 'only-email@x.com',
          phone: null,
        },
      }),
      makeBooking({
        id: 'b-none',
        customer: {
          id: 'c',
          first_name: null,
          last_name: null,
          email: null,
          phone: null,
        },
      }),
    ]
    const events = recentActivity({
      bookings,
      contacts: [],
      pendingApprovals: [],
      customerFallback: 'Unknown customer',
    })
    expect(events.find((e) => e.id === 'booking:b-email')?.label).toBe(
      'only-email@x.com',
    )
    expect(events.find((e) => e.id === 'booking:b-none')?.label).toBe(
      'Unknown customer',
    )
  })
})
