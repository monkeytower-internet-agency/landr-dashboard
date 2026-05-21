// landr-sj2z — three-state matrix coverage for ContactsTable:
//   isLoading=true               → skeleton visible, no EmptyState
//   isLoading=false, rows>0      → real rows visible
//   isLoading=false, rows.length=0 → EmptyState visible
//
// The route-level test in src/routes/Contacts.test.tsx already covers
// erase / audit / sort flows through the supabase mock; this file
// focuses on the loading-state branch the table itself owns.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ContactsTable } from './ContactsTable'
import type { ContactRow } from '@/lib/contacts'

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
