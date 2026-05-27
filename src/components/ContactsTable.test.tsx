// landr-sj2z — three-state matrix coverage for ContactsTable:
//   isLoading=true               → skeleton visible, no EmptyState
//   isLoading=false, rows>0      → real rows visible
//   isLoading=false, rows.length=0 → EmptyState visible
//
// The route-level test in src/routes/Contacts.test.tsx already covers
// erase / audit / sort flows through the supabase mock; this file
// focuses on the loading-state branch the table itself owns.

import { render as rtlRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

// landr-uqr2 — ContactsTable now reads useOperator() so the bulk-apply
// handler can resolve the operator id for setContactTags calls. Stub
// it so the table can mount outside an OperatorProvider.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: 'op-test',
    loading: false,
    switchOperator: () => {},
  }),
}))

import { ContactsTable } from './ContactsTable'
import type { ContactRow } from '@/lib/contacts'

// landr-uqr2 — the BulkActionToolbar embedded in ContactsTable renders a
// TagPicker which uses @tanstack/react-query. landr-oxlk —
// ContactRowContextMenu mounts useQueryClient() (for the per-row tags
// mutation). Provide a fresh client per render so the table can mount
// without an ancestor provider; mirrors the wrapper BookingsTable.test.tsx
// already added for the same reason.
function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function makeRow(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: 'c-1',
    operator_id: 'op-1',
    first_name: 'Alice',
    last_name: 'Anderson',
    email: 'alice@example.com',
    phone: null,
    preferred_locale: null,
    preferred_timezone: null,
    created_at: '2026-05-12T10:30:00.000Z',
    updated_at: '2026-05-12T10:30:00.000Z',
    deleted_at: null,
    gdpr_erased_at: null,
    gdpr_erased_by_user_id: null,
    gdpr_erasure_note: null,
    types: ['customer'],
    ...overrides,
  } as unknown as ContactRow
}

describe('ContactsTable — loading / empty / loaded states (landr-sj2z)', () => {
  it('renders the skeleton placeholder while isLoading is true', () => {
    render(
      <ContactsTable
        rows={[]}
        onEdit={() => {}}
        onErase={() => {}}
        onAudit={() => {}}
        isLoading
      />,
    )
    expect(screen.getByTestId('contacts-skeleton-row-0')).toBeInTheDocument()
    expect(
      screen.queryByTestId('contacts-empty-state'),
    ).not.toBeInTheDocument()
  })

  it('renders real rows when isLoading is false and rows are present', () => {
    render(
      <ContactsTable
        rows={[makeRow({ id: 'c-1', first_name: 'Alice', last_name: 'Anderson' })]}
        onEdit={() => {}}
        onErase={() => {}}
        onAudit={() => {}}
      />,
    )
    expect(screen.getByText(/alice anderson/i)).toBeInTheDocument()
    expect(
      screen.queryByTestId('contacts-skeleton-row-0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('contacts-empty-state'),
    ).not.toBeInTheDocument()
  })

  it('renders the EmptyState card when rows.length is 0 and isLoading is false', () => {
    render(
      <ContactsTable
        rows={[]}
        onEdit={() => {}}
        onErase={() => {}}
        onAudit={() => {}}
      />,
    )
    expect(screen.getByTestId('contacts-empty-state')).toBeInTheDocument()
    expect(
      screen.queryByTestId('contacts-skeleton-row-0'),
    ).not.toBeInTheDocument()
  })
})

// landr-6993 — booking-window indicator next to the contact name.
describe('ContactsTable — next-booking icon (landr-6993)', () => {
  // The icon's window classification compares against the LOCAL-CLOCK
  // today inside contactBookingWindow(). To keep this test stable across
  // timezones / dates, we set next_booking_date to a far-future date for
  // the 'future' case and synthesise 'today' from the same Date the
  // component uses (Intl.DateTimeFormat-free).
  function localTodayIso(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  it('renders the green TODAY icon when next_booking_date is today', () => {
    render(
      <ContactsTable
        rows={[
          makeRow({
            id: 'c-today',
            first_name: 'Today',
            last_name: 'Booker',
            next_booking_date: localTodayIso(),
          }),
        ]}
        onEdit={() => {}}
        onErase={() => {}}
        onAudit={() => {}}
      />,
    )
    expect(
      screen.getByTestId('contacts-next-booking-today-c-today'),
    ).toBeInTheDocument()
  })

  it('renders the blue FUTURE icon when next_booking_date is later', () => {
    render(
      <ContactsTable
        rows={[
          makeRow({
            id: 'c-future',
            first_name: 'Future',
            last_name: 'Booker',
            // Far enough out that this test stays 'future' for years.
            next_booking_date: '2099-01-01',
          }),
        ]}
        onEdit={() => {}}
        onErase={() => {}}
        onAudit={() => {}}
      />,
    )
    expect(
      screen.getByTestId('contacts-next-booking-future-c-future'),
    ).toBeInTheDocument()
  })

  it('renders NO icon when next_booking_date is null/undefined', () => {
    render(
      <ContactsTable
        rows={[
          makeRow({
            id: 'c-none',
            first_name: 'No',
            last_name: 'Booking',
            next_booking_date: null,
          }),
        ]}
        onEdit={() => {}}
        onErase={() => {}}
        onAudit={() => {}}
      />,
    )
    expect(
      screen.queryByTestId('contacts-next-booking-today-c-none'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('contacts-next-booking-future-c-none'),
    ).not.toBeInTheDocument()
  })
})
