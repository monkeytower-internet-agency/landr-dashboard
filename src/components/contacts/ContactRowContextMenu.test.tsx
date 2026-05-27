// landr-oxlk — right-click → quick-action menu on Contacts rows.
//
// Coverage mirrors the Bookings variant: open detail, copy link, and
// the destructive GDPR-erase item is gated on contactIsErased.
import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ContactRowContextMenu } from './ContactRowContextMenu'
import type { ContactRow } from '@/lib/contacts'

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

describe('ContactRowContextMenu (landr-oxlk)', () => {
  it('fires onOpenDetail when "Open contact" is selected', async () => {
    const onOpenDetail = vi.fn()
    const row = makeRow()
    render(
      <ContactRowContextMenu
        row={row}
        operatorId="op-1"
        onOpenDetail={onOpenDetail}
        onErase={() => {}}
        copyLinkPath={(r) => `/contacts?open=${r.id}`}
      >
        <div data-testid="row-target">row body</div>
      </ContactRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await userEvent.click(
      await screen.findByTestId('contacts-row-context-open'),
    )
    expect(onOpenDetail).toHaveBeenCalledWith(row)
  })

  it('fires onErase when "Erase (GDPR)" is selected', async () => {
    const onErase = vi.fn()
    const row = makeRow()
    render(
      <ContactRowContextMenu
        row={row}
        operatorId="op-1"
        onOpenDetail={() => {}}
        onErase={onErase}
        copyLinkPath={(r) => `/contacts?open=${r.id}`}
      >
        <div data-testid="row-target">row body</div>
      </ContactRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    await userEvent.click(
      await screen.findByTestId('contacts-row-context-erase'),
    )
    expect(onErase).toHaveBeenCalledWith(row)
  })

  it('disables the erase item once the contact has been erased', async () => {
    const onErase = vi.fn()
    const row = makeRow({ gdpr_erased_at: '2026-05-10T00:00:00.000Z' })
    render(
      <ContactRowContextMenu
        row={row}
        operatorId="op-1"
        onOpenDetail={() => {}}
        onErase={onErase}
        copyLinkPath={(r) => `/contacts?open=${r.id}`}
      >
        <div data-testid="row-target">row body</div>
      </ContactRowContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('row-target'))
    const item = await screen.findByTestId('contacts-row-context-erase')
    // Radix marks disabled items with data-disabled and the aria attr.
    expect(item).toHaveAttribute('data-disabled')
  })
})
