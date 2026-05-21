// landr-9qo1 — tests for BookingNotes panel inside BookingDetailSheet.
//
// Renders the component with a fresh QueryClient, mocks the
// listBookingNotes / createBookingNote / deleteBookingNote API client,
// and asserts:
//   - empty state when the list returns []
//   - row + author label when the list returns rows
//   - Save button is disabled until the textarea has non-whitespace
//   - clicking Save invokes createBookingNote with the trimmed content
//   - clicking the trash icon (after window.confirm) invokes
//     deleteBookingNote with the right ids

import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'

import type { BookingNote } from '@/lib/booking-notes'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    listBookingNotes: vi.fn<
      (operatorId: string, bookingId: string) => Promise<BookingNote[]>
    >(),
    createBookingNote: vi.fn<
      (
        operatorId: string,
        bookingId: string,
        payload: { content: string },
      ) => Promise<BookingNote>
    >(),
    deleteBookingNote: vi.fn<
      (operatorId: string, bookingId: string, noteId: string) => Promise<void>
    >(),
  },
}))

vi.mock('@/lib/booking-notes', async () => {
  // Re-export authorLabel from the real module so the component logic
  // (which calls authorLabel directly) stays under test.
  const actual = await vi.importActual<typeof import('@/lib/booking-notes')>(
    '@/lib/booking-notes',
  )
  return {
    ...actual,
    listBookingNotes: mocks.listBookingNotes,
    createBookingNote: mocks.createBookingNote,
    deleteBookingNote: mocks.deleteBookingNote,
  }
})

// Sonner's `toast.success` / `toast.error` would otherwise try to mount
// a portal; stub them so the tests stay focused on the component logic.
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { BookingNotes } from './BookingNotes'

const OP_ID = 'op-1'
const BOOKING_ID = 'b-1'

function makeNote(overrides: Partial<BookingNote> = {}): BookingNote {
  return {
    id: 'n-1',
    booking_id: BOOKING_ID,
    operator_id: OP_ID,
    author_user_id: 'u-1',
    author_display_name: 'Jane Operator',
    author_email: 'jane@op.es',
    content: 'Customer called re pickup',
    created_at: '2026-05-21T10:00:00Z',
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

describe('BookingNotes', () => {
  it('renders empty state when no notes exist', async () => {
    mocks.listBookingNotes.mockResolvedValue([])
    renderWithClient(<BookingNotes operatorId={OP_ID} bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument(),
    )
    expect(mocks.listBookingNotes).toHaveBeenCalledWith(OP_ID, BOOKING_ID)
  })

  it('renders a list row with author label + timestamp', async () => {
    mocks.listBookingNotes.mockResolvedValue([
      makeNote({ content: 'Note one', author_display_name: 'Jane Operator' }),
    ])
    renderWithClient(<BookingNotes operatorId={OP_ID} bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('Note one')).toBeInTheDocument())
    // Author label rendered (full name preferred over email).
    expect(screen.getByText(/Jane Operator/)).toBeInTheDocument()
  })

  it('renders "(deleted user)" when author is null', async () => {
    mocks.listBookingNotes.mockResolvedValue([
      makeNote({
        content: 'Orphan note',
        author_user_id: null,
        author_display_name: null,
        author_email: null,
      }),
    ])
    renderWithClient(<BookingNotes operatorId={OP_ID} bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('Orphan note')).toBeInTheDocument())
    expect(screen.getByText(/\(deleted user\)/)).toBeInTheDocument()
  })

  it('disables Save until the textarea has non-whitespace content', async () => {
    mocks.listBookingNotes.mockResolvedValue([])
    renderWithClient(<BookingNotes operatorId={OP_ID} bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument(),
    )
    const saveButton = screen.getByRole('button', { name: /Save note/i })
    expect(saveButton).toBeDisabled()

    const textarea = screen.getByPlaceholderText(/Add an internal note/i)
    await userEvent.type(textarea, '   ')
    expect(saveButton).toBeDisabled()

    await userEvent.type(textarea, 'real text')
    expect(saveButton).toBeEnabled()
  })

  it('creates a note with trimmed content when Save is clicked', async () => {
    mocks.listBookingNotes.mockResolvedValue([])
    mocks.createBookingNote.mockResolvedValue(makeNote({ content: 'hello' }))
    renderWithClient(<BookingNotes operatorId={OP_ID} bookingId={BOOKING_ID} />)

    await waitFor(() =>
      expect(screen.getByText(/No internal notes yet/i)).toBeInTheDocument(),
    )
    const textarea = screen.getByPlaceholderText(/Add an internal note/i)
    await userEvent.type(textarea, '  hello  ')

    await userEvent.click(screen.getByRole('button', { name: /Save note/i }))

    await waitFor(() =>
      expect(mocks.createBookingNote).toHaveBeenCalledWith(OP_ID, BOOKING_ID, {
        content: 'hello',
      }),
    )
  })

  it('deletes a note after window.confirm returns true', async () => {
    mocks.listBookingNotes.mockResolvedValue([
      makeNote({ id: 'n-42', content: 'deletable' }),
    ])
    mocks.deleteBookingNote.mockResolvedValue()
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    renderWithClient(<BookingNotes operatorId={OP_ID} bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('deletable')).toBeInTheDocument())

    const row = screen.getByText('deletable').closest('div.flex')!
    const trashButton = within(row.parentElement!).getByRole('button', {
      name: /Delete note/i,
    })
    await userEvent.click(trashButton)

    await waitFor(() =>
      expect(mocks.deleteBookingNote).toHaveBeenCalledWith(OP_ID, BOOKING_ID, 'n-42'),
    )
    confirmSpy.mockRestore()
  })

  it('does NOT delete when window.confirm returns false', async () => {
    mocks.listBookingNotes.mockResolvedValue([
      makeNote({ id: 'n-skip', content: 'survives' }),
    ])
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    renderWithClient(<BookingNotes operatorId={OP_ID} bookingId={BOOKING_ID} />)

    await waitFor(() => expect(screen.getByText('survives')).toBeInTheDocument())

    const row = screen.getByText('survives').closest('div.flex')!
    const trashButton = within(row.parentElement!).getByRole('button', {
      name: /Delete note/i,
    })
    await userEvent.click(trashButton)

    expect(mocks.deleteBookingNote).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
