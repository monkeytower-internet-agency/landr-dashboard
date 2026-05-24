// landr-wwhn.11 — single board column for the ticket kanban.
//
// One column per TicketStatus value. Droppable always (useDroppable),
// but the disabled prop greys it out when the column is bd-authoritative
// (in_progress/in_review/done — operators cannot drop there; only the
// bridge worker moves tickets forward).
//
// Pattern follows BoardColumn.tsx from the views layout.

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import type { TicketRow } from '@/lib/tickets'
import { TicketCard } from './TicketCard'

type Props = {
  /** TicketStatus value — the column key. */
  columnKey: string
  label: string
  items: TicketRow[]
  onOpen: (ticket: TicketRow) => void
  /**
   * True for bd-authoritative columns (in_progress/in_review/done).
   * The column accepts no drops and is rendered in a muted style.
   */
  readMostly: boolean
}

const READ_MOSTLY_REASON =
  'This column is managed by the engineering workflow. Tickets move here automatically.'

export function TicketBoardColumn({
  columnKey,
  label,
  items,
  onOpen,
  readMostly,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${columnKey}`,
    data: { columnKey },
    // Disable drop target for bd-authoritative columns.
    disabled: readMostly,
  })

  return (
    <div
      data-testid={`ticket-board-column-${columnKey}`}
      data-board-column={columnKey}
      data-board-column-read-mostly={readMostly || undefined}
      className={cn(
        'bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-md p-3',
        isOver && !readMostly && 'ring-primary/50 ring-2',
        readMostly && 'opacity-75',
      )}
      title={readMostly ? READ_MOSTLY_REASON : undefined}
    >
      {/* Column header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="truncate text-sm font-medium"
            data-testid={`ticket-board-column-label-${columnKey}`}
          >
            {label}
          </span>
          <span
            className="text-muted-foreground text-xs"
            data-testid={`ticket-board-column-count-${columnKey}`}
          >
            {items.length}
          </span>
        </div>
        {readMostly && (
          <span
            className="text-muted-foreground shrink-0 text-[10px]"
            title={READ_MOSTLY_REASON}
            aria-label="Read-only — managed by engineering workflow"
          >
            auto
          </span>
        )}
      </div>

      {/* Drop zone + cards */}
      <SortableContext
        items={items.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="flex min-h-16 flex-col gap-2"
          data-testid={`ticket-board-column-drop-${columnKey}`}
        >
          {items.length === 0 ? (
            <p
              className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs"
              data-testid={`ticket-board-column-empty-${columnKey}`}
            >
              No tickets
            </p>
          ) : (
            items.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
