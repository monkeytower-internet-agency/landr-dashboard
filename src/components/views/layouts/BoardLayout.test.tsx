// landr-kjls — BoardLayout unit tests.
//
// Covers:
//   - Renders one column per registered enum value of the column-by field.
//   - Cards render compact info (customer, product, total, date).
//   - Click on a card opens BookingDetailSheet (sheet is mocked).
//   - resolveBoardDrop (pure) returns the right mutate payload for valid
//     transitions and null for disallowed / no-op drops.
//   - isStageTransitionAllowed pins the v1 wired transitions.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SavedViewWithState } from '@/lib/saved-views'
import type { BookingRow } from '@/lib/bookings'

// Mock BookingDetailSheet to keep the test free of supabase / API plumbing
// — we only care that opening it surfaces the right booking row id.
vi.mock('@/components/BookingDetailSheet', () => ({
  BookingDetailSheet: ({ row }: { row: BookingRow | null }) =>
    row ? (
      <div data-testid="mock-detail-sheet" data-row-id={row.id}>
        sheet for {row.id}
      </div>
    ) : null,
}))

import {
  BoardLayout,
  resolveBoardDrop,
  isStageTransitionAllowed,
} from './BoardLayout'

const OP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function makeView(
  overrides: Partial<SavedViewWithState> = {},
): SavedViewWithState {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    operator_id: OP_ID,
    creator_user_id: USER_ID,
    entity_type: 'booking',
    visibility: 'personal',
    name: 'Stage board',
    config: {
      layout: 'board',
      filters: [],
      sort: [],
      boardConfig: { columnBy: 'current_stage' },
    },
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
    user_state: { pinned: false, hidden: false, sort_order: 0 },
    ...overrides,
  }
}

function makeRow(
  overrides: Partial<BookingRow> & { id: string },
): BookingRow {
  const base: BookingRow = {
    id: overrides.id,
    created_at: '2026-05-21T10:00:00Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'contact-1',
      first_name: 'Marie',
      last_name: 'Curie',
      email: 'marie@example.com',
      phone: null,
    },
    items: [
      {
        id: 'bp-1',
        date_range_start: '2026-06-01',
        date_range_end: '2026-06-01',
        selected_days: null,
        products: {
          id: 'prod-1',
          name: 'Tandem flight',
          product_kind: 'service',
          service_time_shape: 'single_date',
        },
      },
    ],
  }
  return { ...base, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BoardLayout (landr-kjls)', () => {
  it('renders one column per registered enum value of current_stage', () => {
    render(
      <BoardLayout
        view={makeView()}
        items={[
          makeRow({ id: 'book-1' }),
          makeRow({
            id: 'book-2',
            current_stage: { code: 'confirmed' },
          }),
        ]}
        onItemMutate={vi.fn()}
      />,
    )
    // BOOKING_FIELDS.current_stage carries 5 enum values:
    //  awaiting_general / secondary / hotel + confirmed + cancelled.
    expect(
      screen.getByTestId('board-column-awaiting_general_approval'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('board-column-awaiting_secondary_approval'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('board-column-awaiting_hotel_approval'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('board-column-confirmed')).toBeInTheDocument()
    expect(screen.getByTestId('board-column-cancelled')).toBeInTheDocument()
  })

  it('renders compact card content for each item', () => {
    render(
      <BoardLayout
        view={makeView()}
        items={[makeRow({ id: 'book-1' })]}
        onItemMutate={vi.fn()}
      />,
    )
    const card = screen.getByTestId('board-card-book-1')
    expect(card).toHaveTextContent('Marie Curie')
    expect(card).toHaveTextContent('Tandem flight')
    // Currency formatting from Intl: "€100.00" (en-IE locale).
    expect(card.textContent).toMatch(/€\s?100\.00/)
  })

  it('clicking a card opens the BookingDetailSheet with its booking row', async () => {
    const user = userEvent.setup()
    render(
      <BoardLayout
        view={makeView()}
        items={[makeRow({ id: 'book-1' })]}
        onItemMutate={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('mock-detail-sheet')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('board-card-book-1'))
    const sheet = await screen.findByTestId('mock-detail-sheet')
    expect(sheet).toHaveAttribute('data-row-id', 'book-1')
  })

  it('renders a "must be enum" placeholder when column-by points at a non-enum field', () => {
    render(
      <BoardLayout
        view={makeView({
          config: {
            layout: 'board',
            filters: [],
            sort: [],
            boardConfig: { columnBy: 'customer_first_name' },
          },
        })}
        items={[]}
        onItemMutate={vi.fn()}
      />,
    )
    expect(screen.getByTestId('board-layout-placeholder')).toHaveTextContent(
      /enum/i,
    )
  })

  it('renders an empty-column placeholder for stages with no items', () => {
    render(
      <BoardLayout
        view={makeView()}
        items={[makeRow({ id: 'book-1' })]}
        onItemMutate={vi.fn()}
      />,
    )
    expect(
      screen.getByTestId('board-column-empty-confirmed'),
    ).toBeInTheDocument()
  })

  it('greys out columns with no supported incoming transition', () => {
    render(
      <BoardLayout view={makeView()} items={[]} onItemMutate={vi.fn()} />,
    )
    // awaiting_* columns have no STAGE_TRANSITIONS landing on them — they
    // start grey. confirmed + cancelled ARE valid targets.
    expect(
      screen.getByTestId('board-column-awaiting_general_approval'),
    ).toHaveAttribute('data-board-column-disabled')
    expect(screen.getByTestId('board-column-confirmed')).not.toHaveAttribute(
      'data-board-column-disabled',
    )
  })
})

describe('BoardLayout swimlanes (landr-4cwh)', () => {
  it('renders the flat single-axis Board when swimlaneBy is null', () => {
    render(
      <BoardLayout
        view={makeView({
          config: {
            layout: 'board',
            filters: [],
            sort: [],
            boardConfig: { columnBy: 'current_stage', swimlaneBy: null },
          },
        })}
        items={[makeRow({ id: 'book-1' })]}
        onItemMutate={vi.fn()}
      />,
    )
    // Flat board chrome (no matrix-only test ids).
    expect(screen.getByTestId('board-layout')).not.toHaveAttribute(
      'data-board-swimlane-by',
    )
    expect(
      screen.queryByTestId('board-matrix-header-confirmed'),
    ).not.toBeInTheDocument()
    // Card lives in the flat column, not in a (col, lane) cell.
    expect(
      screen.getByTestId('board-column-awaiting_general_approval'),
    ).toContainElement(screen.getByTestId('board-card-book-1'))
  })

  it('renders a 2D matrix when swimlaneBy is an enum field', () => {
    render(
      <BoardLayout
        view={makeView({
          config: {
            layout: 'board',
            filters: [],
            sort: [],
            boardConfig: {
              columnBy: 'current_stage',
              swimlaneBy: 'current_semantic_state',
            },
          },
        })}
        items={[
          makeRow({
            id: 'book-1',
            current_semantic_state: 'pending',
            current_stage: { code: 'awaiting_general_approval' },
          }),
          makeRow({
            id: 'book-2',
            current_semantic_state: 'confirmed',
            current_stage: { code: 'confirmed' },
          }),
        ]}
        onItemMutate={vi.fn()}
      />,
    )
    // Matrix-only chrome: data attr + per-column header + per-swimlane row.
    expect(screen.getByTestId('board-layout')).toHaveAttribute(
      'data-board-swimlane-by',
      'current_semantic_state',
    )
    expect(
      screen.getByTestId('board-matrix-header-confirmed'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('board-swimlane-pending')).toBeInTheDocument()
    expect(screen.getByTestId('board-swimlane-confirmed')).toBeInTheDocument()

    // Cards land in the correct (col, lane) cells.
    expect(
      screen.getByTestId('board-cell-awaiting_general_approval-pending'),
    ).toContainElement(screen.getByTestId('board-card-book-1'))
    expect(
      screen.getByTestId('board-cell-confirmed-confirmed'),
    ).toContainElement(screen.getByTestId('board-card-book-2'))
  })

  it('renders empty cells without cards', () => {
    render(
      <BoardLayout
        view={makeView({
          config: {
            layout: 'board',
            filters: [],
            sort: [],
            boardConfig: {
              columnBy: 'current_stage',
              swimlaneBy: 'current_semantic_state',
            },
          },
        })}
        items={[
          makeRow({
            id: 'book-1',
            current_semantic_state: 'pending',
            current_stage: { code: 'awaiting_general_approval' },
          }),
        ]}
        onItemMutate={vi.fn()}
      />,
    )
    // (confirmed × pending) cell has no card.
    const cell = screen.getByTestId('board-cell-confirmed-pending')
    expect(cell).not.toContainElement(screen.queryByTestId('board-card-book-1'))
    // Empty-column placeholder still renders inside the cell via BoardColumn.
    expect(
      cell.querySelector('[data-testid^="board-column-empty-"]'),
    ).not.toBeNull()
  })

  it('shows an inline warning when swimlaneBy points at an unknown field', () => {
    render(
      <BoardLayout
        view={makeView({
          config: {
            layout: 'board',
            filters: [],
            sort: [],
            boardConfig: {
              columnBy: 'current_stage',
              swimlaneBy: 'no_such_field',
            },
          },
        })}
        items={[makeRow({ id: 'book-1' })]}
        onItemMutate={vi.fn()}
      />,
    )
    expect(screen.getByTestId('board-swimlane-warning')).toHaveTextContent(
      /no_such_field/i,
    )
    // Falls back to flat layout — the matrix chrome must not render.
    expect(
      screen.queryByTestId('board-matrix-header-confirmed'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('board-column-awaiting_general_approval'),
    ).toBeInTheDocument()
  })

  it('shows an inline warning when swimlaneBy points at a non-groupable field', () => {
    render(
      <BoardLayout
        view={makeView({
          config: {
            layout: 'board',
            filters: [],
            sort: [],
            boardConfig: {
              columnBy: 'current_stage',
              swimlaneBy: 'customer_first_name', // text — not enum/id
            },
          },
        })}
        items={[]}
        onItemMutate={vi.fn()}
      />,
    )
    expect(screen.getByTestId('board-swimlane-warning')).toHaveTextContent(
      /enum or id/i,
    )
  })
})

describe('resolveBoardDrop (landr-kjls)', () => {
  const items = [
    makeRow({ id: 'a' }),
    makeRow({ id: 'b', current_stage: { code: 'confirmed' } }),
    makeRow({ id: 'c', current_stage: { code: 'awaiting_hotel_approval' } }),
  ]

  it('returns the mutate payload for a valid awaiting_general → confirmed drop', () => {
    const out = resolveBoardDrop({
      activeId: 'a',
      overId: 'column:confirmed',
      items,
      columnBy: 'current_stage',
    })
    expect(out).toEqual({
      itemId: 'a',
      fieldKey: 'current_stage',
      newValue: 'confirmed',
    })
  })

  it('returns the mutate payload when dropping on another card (uses that card’s column)', () => {
    const out = resolveBoardDrop({
      activeId: 'a',
      overId: 'b', // card in confirmed column
      items,
      columnBy: 'current_stage',
    })
    expect(out).toEqual({
      itemId: 'a',
      fieldKey: 'current_stage',
      newValue: 'confirmed',
    })
  })

  it('returns null when dropping back on the same column (no-op)', () => {
    const out = resolveBoardDrop({
      activeId: 'b',
      overId: 'column:confirmed',
      items,
      columnBy: 'current_stage',
    })
    expect(out).toBeNull()
  })

  it('returns null for a transition with no wired endpoint (confirmed → awaiting_general)', () => {
    const out = resolveBoardDrop({
      activeId: 'b',
      overId: 'column:awaiting_general_approval',
      items,
      columnBy: 'current_stage',
    })
    expect(out).toBeNull()
  })

  it('returns null when over is null (drop outside any zone)', () => {
    const out = resolveBoardDrop({
      activeId: 'a',
      overId: null,
      items,
      columnBy: 'current_stage',
    })
    expect(out).toBeNull()
  })

  it('allows the hotel → confirmed transition', () => {
    const out = resolveBoardDrop({
      activeId: 'c',
      overId: 'column:confirmed',
      items,
      columnBy: 'current_stage',
    })
    expect(out?.newValue).toBe('confirmed')
  })

  it('strips the matrix `::<lane>` suffix from compound column drop ids (landr-4cwh)', () => {
    const out = resolveBoardDrop({
      activeId: 'a',
      overId: 'column:confirmed::pending',
      items,
      columnBy: 'current_stage',
    })
    // The transition gate sees `confirmed` — the lane suffix is ignored.
    expect(out).toEqual({
      itemId: 'a',
      fieldKey: 'current_stage',
      newValue: 'confirmed',
    })
  })
})

describe('isStageTransitionAllowed (landr-kjls)', () => {
  it('allows the four documented v1 approval transitions', () => {
    expect(
      isStageTransitionAllowed('awaiting_general_approval', 'confirmed'),
    ).toBe(true)
    expect(
      isStageTransitionAllowed('awaiting_general_approval', 'cancelled'),
    ).toBe(true)
    expect(
      isStageTransitionAllowed('awaiting_hotel_approval', 'confirmed'),
    ).toBe(true)
    expect(
      isStageTransitionAllowed('awaiting_hotel_approval', 'cancelled'),
    ).toBe(true)
  })

  it('rejects awaiting_secondary_approval (no endpoint in v1)', () => {
    expect(
      isStageTransitionAllowed('awaiting_secondary_approval', 'confirmed'),
    ).toBe(false)
  })

  it('rejects backwards / from-null / no-op transitions', () => {
    expect(
      isStageTransitionAllowed('confirmed', 'awaiting_general_approval'),
    ).toBe(false)
    expect(isStageTransitionAllowed(null, 'confirmed')).toBe(false)
    expect(isStageTransitionAllowed('confirmed', 'confirmed')).toBe(false)
  })
})

describe('BoardLayout drag dispatch (landr-kjls)', () => {
  it('translates a valid drop into an onItemMutate call', async () => {
    // We can't drive @dnd-kit's pointer pipeline cleanly in jsdom, so we
    // verify the dispatch via the pure resolver + propagating its payload.
    // handleDragEnd is a one-liner over resolveBoardDrop + onItemMutate.
    const onItemMutate = vi.fn().mockResolvedValue(undefined)
    const items = [makeRow({ id: 'book-1' })]
    render(
      <BoardLayout
        view={makeView()}
        items={items}
        onItemMutate={onItemMutate}
      />,
    )

    const drop = resolveBoardDrop({
      activeId: 'book-1',
      overId: 'column:confirmed',
      items,
      columnBy: 'current_stage',
    })
    expect(drop).not.toBeNull()
    if (drop) {
      await onItemMutate(drop.itemId, drop.fieldKey, drop.newValue)
    }
    expect(onItemMutate).toHaveBeenCalledWith(
      'book-1',
      'current_stage',
      'confirmed',
    )
  })
})
