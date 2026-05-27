// landr-wwhn.11 — single ticket card on the kanban board.
// landr-wwhn.22 — compact assignee chip (initials for humans, robot icon for agents).
// landr-7dya.2  — origin-tier chip (PROD vs STAGING).
// landr-7dya.3  — Trello-style card status icons.
//
// Draggable when its column is in DRAGGABLE_STATUSES (backlog, ready).
// Read-only (no drag) in bd-authoritative columns (in_progress/in_review/done).
//
// Compact rendering: title, type chip, origin chip, status icons (attachment,
// watch, assignee, priority, comments, moscow, blocked). Click opens the detail.
// `blocked` is shown in the status-icons row, NOT as a separate standalone badge.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import {
  DRAGGABLE_STATUSES,
  PRIORITY_LABEL,
  TYPE_LABEL,
  type AssignableUser,
  type TicketRow,
} from '@/lib/tickets'
import { OriginChip, CardStatusIcons } from './CardVisuals'
import type { OriginTier } from './CardVisuals'

type Props = {
  ticket: TicketRow
  /** Called when the operator clicks the card to open the detail sheet. */
  onOpen: (ticket: TicketRow) => void
  /**
   * Optional resolved assignee for display. Pass the AssignableUser row that
   * matches ticket.assignee_id (looked up by the parent board from a cached
   * assignable_users list). When absent the assignee avatar is hidden.
   */
  assignee?: AssignableUser | null
  /**
   * landr-7dya.2 — Origin tier for the colored chip.
   * Operators do not see the origin chip; pass it only from staff views
   * (e.g. the inbox/board when the viewer is_landr_staff).
   */
  originTier?: OriginTier
  /** landr-7dya.2 — Staging operator label for the chip tooltip. */
  originOperatorLabel?: string | null
  /** landr-7dya.3 — Number of attachments on this ticket (0 = hide indicator). */
  attachmentCount?: number
  /** landr-7dya.3 — Number of comments on this ticket (0 = hide indicator). */
  commentCount?: number
  /** landr-7dya.3 — Whether the current user is watching this ticket. */
  isWatching?: boolean
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

export function TicketCard({
  ticket,
  onOpen,
  assignee,
  originTier,
  originOperatorLabel,
  attachmentCount = 0,
  commentCount = 0,
  isWatching = false,
}: Props) {
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

      {/* Chips row: type + origin chip */}
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

        {/* landr-7dya.2 — origin chip (staff-only; absent when originTier not passed) */}
        {originTier && (
          <OriginChip
            tier={originTier}
            operatorLabel={originOperatorLabel}
            data-testid={`ticket-card-origin-${ticket.id}`}
          />
        )}
      </div>

      {/* landr-7dya.3 — Trello-style status icons (priority, moscow, blocked,
           attachments, comments, watch, assignee avatar) */}
      <CardStatusIcons
        attachmentCount={attachmentCount}
        isWatching={isWatching}
        assignee={assignee ?? null}
        priority={ticket.priority}
        commentCount={commentCount}
        moscow={ticket.moscow ?? null}
        blocked={ticket.blocked}
        data-testid={`ticket-card-status-icons-${ticket.id}`}
      />

      {/* Footer: date */}
      <div className="mt-0.5 flex items-center justify-end gap-2">
        <span className="text-muted-foreground whitespace-nowrap">
          {createdDate}
        </span>
      </div>
    </button>
  )
}

