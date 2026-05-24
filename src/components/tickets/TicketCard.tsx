// landr-wwhn.11 — single ticket card on the kanban board.
//
// Draggable when its column is in DRAGGABLE_STATUSES (backlog, ready).
// Read-only (no drag) in bd-authoritative columns (in_progress/in_review/done).
//
// Compact rendering: title, type chip, priority badge, and blocked indicator.
// Click opens the ticket detail (via parent callback; detail sheet is landr-wwhn.13).
// `blocked` renders as a badge on the card, NOT as a separate column.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import {
  DRAGGABLE_STATUSES,
  PRIORITY_LABEL,
  PRIORITY_TOOLTIP,
  TYPE_LABEL,
  type TicketRow,
} from '@/lib/tickets'

type Props = {
  ticket: TicketRow
  /** Called when the operator clicks the card to open the detail sheet. */
  onOpen: (ticket: TicketRow) => void
}

const PRIORITY_TONE: Record<string, string> = {
  p0: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  p1: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  p2: 'bg-muted text-muted-foreground',
}

const TYPE_TONE: Record<string, string> = {
  bug: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  feature:
    'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  annoyance:
    'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300',
  question:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
}

export function TicketCard({ ticket, onOpen }: Props) {
  const isDraggableColumn = DRAGGABLE_STATUSES.has(ticket.status)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: ticket.id,
      data: { ticketId: ticket.id },
      // Only allow drag gesture initiation for human-owned columns.
      disabled: !isDraggableColumn,
    })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const createdDate = new Intl.DateTimeFormat('en-IE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(ticket.created_at))

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(ticket)}
      data-testid={`ticket-card-${ticket.id}`}
      data-ticket-card="true"
      data-ticket-status={ticket.status}
      aria-label={`${ticket.title} — ${TYPE_LABEL[ticket.type]} — ${PRIORITY_LABEL[ticket.priority]}`}
      className={cn(
        'border-input bg-card text-card-foreground flex w-full flex-col gap-2 rounded-md border p-3 text-left text-xs shadow-sm transition-shadow',
        'hover:border-foreground/30 hover:shadow-md',
        'focus-visible:outline-2 focus-visible:outline-ring',
        isDragging && 'opacity-60 shadow-lg',
        isDraggableColumn && 'cursor-grab active:cursor-grabbing',
        !isDraggableColumn && 'cursor-pointer',
      )}
      {...attributes}
      {...(isDraggableColumn ? listeners : {})}
    >
      {/* Title */}
      <span className="text-sm font-medium leading-tight line-clamp-2">
        {ticket.title}
      </span>

      {/* Chips row: type + blocked badge */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
            TYPE_TONE[ticket.type] ?? 'bg-muted text-muted-foreground',
          )}
          data-testid={`ticket-card-type-${ticket.id}`}
        >
          {TYPE_LABEL[ticket.type]}
        </span>

        {ticket.blocked && (
          <span
            className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-red-700"
            data-testid={`ticket-card-blocked-${ticket.id}`}
            title="This ticket is blocked"
          >
            Blocked
          </span>
        )}
      </div>

      {/* Footer: priority + date */}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
            PRIORITY_TONE[ticket.priority] ?? PRIORITY_TONE.p2,
          )}
          title={PRIORITY_TOOLTIP[ticket.priority]}
          data-testid={`ticket-card-priority-${ticket.id}`}
        >
          {PRIORITY_LABEL[ticket.priority]}
        </span>
        <span className="text-muted-foreground whitespace-nowrap">
          {createdDate}
        </span>
      </div>
    </button>
  )
}
