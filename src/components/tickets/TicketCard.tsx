// landr-wwhn.11 — single ticket card on the kanban board.
// landr-wwhn.22 — compact assignee chip (initials for humans, robot icon for agents).
//
// Draggable when its column is in DRAGGABLE_STATUSES (backlog, ready).
// Read-only (no drag) in bd-authoritative columns (in_progress/in_review/done).
//
// Compact rendering: title, type chip, priority badge, blocked indicator,
// and assignee avatar (when assigned). Click opens the ticket detail.
// `blocked` renders as a badge on the card, NOT as a separate column.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BotIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import {
  DRAGGABLE_STATUSES,
  PRIORITY_LABEL,
  PRIORITY_TOOLTIP,
  TYPE_LABEL,
  type AssignableUser,
  type TicketRow,
} from '@/lib/tickets'

type Props = {
  ticket: TicketRow
  /** Called when the operator clicks the card to open the detail sheet. */
  onOpen: (ticket: TicketRow) => void
  /**
   * Optional resolved assignee for display. Pass the AssignableUser row that
   * matches ticket.assignee_id (looked up by the parent board from a cached
   * assignable_users list). When absent the assignee chip is hidden.
   */
  assignee?: AssignableUser | null
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

export function TicketCard({ ticket, onOpen, assignee }: Props) {
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

      {/* Footer: priority + assignee chip + date */}
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

        <div className="flex items-center gap-1.5">
          {/* Assignee chip — compact avatar (initials or robot icon) */}
          {assignee && (
            <AssigneeChip
              assignee={assignee}
              data-testid={`ticket-card-assignee-${ticket.id}`}
            />
          )}
          <span className="text-muted-foreground whitespace-nowrap">
            {createdDate}
          </span>
        </div>
      </div>
    </button>
  )
}

// ---- AssigneeChip -----------------------------------------------------------
// Compact avatar shown on the card footer.
// Humans: two-letter initials circle (derived from email).
// Claude agents: robot icon circle.
// Both carry a tooltip with the email for discoverability.

type AssigneeChipProps = {
  assignee: AssignableUser
  'data-testid'?: string
}

function AssigneeChip({ assignee, 'data-testid': testId }: AssigneeChipProps) {
  const title = assignee.email ?? (assignee.is_claude_agent ? 'Claude agent' : 'Assigned')

  if (assignee.is_claude_agent) {
    return (
      <span
        className="inline-flex size-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
        title={title}
        aria-label={`Assigned to agent: ${title}`}
        data-testid={testId}
      >
        <BotIcon className="size-3" aria-hidden />
      </span>
    )
  }

  // Human — derive up to 2 initials from the email local part.
  const local = (assignee.email ?? '').split('@')[0] ?? ''
  const parts = local.split(/[._-]/).filter(Boolean)
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : local.slice(0, 2).toUpperCase()

  return (
    <span
      className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      title={title}
      aria-label={`Assigned to: ${title}`}
      data-testid={testId}
    >
      {initials || '?'}
    </span>
  )
}
