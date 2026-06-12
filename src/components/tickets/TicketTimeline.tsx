// landr-wwhn.13 — TimelinePanel + renderEventLabel.
// Extracted from TicketDetailSheet.tsx (v9e4.8 refactor — pure file move).

import { useQuery } from '@tanstack/react-query'

import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

import {
  fetchTicketEvents,
  type TicketEvent,
} from '@/lib/tickets'

// ---- TimelinePanel ----------------------------------------------------------

type TimelinePanelProps = {
  ticketId: string
}

export function TimelinePanel({ ticketId }: TimelinePanelProps) {
  const { data: events, isPending } = useQuery({
    queryKey: ['ticket-events', ticketId],
    queryFn: () => fetchTicketEvents(ticketId),
  })

  const dateFormatter = new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-muted h-10 animate-pulse rounded-md" />
        ))}
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm italic"
        data-testid="ticket-timeline-empty"
      >
        {t.ticketDetail.noEvents}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1" data-testid="ticket-timeline-list">
      {events.map((ev) => (
        <li
          key={ev.id}
          className={cn(
            'flex items-start gap-3 rounded-md px-2 py-2 text-sm',
            ev.is_internal && 'bg-amber-50 dark:bg-amber-950/20',
          )}
          data-testid={`timeline-event-${ev.id}`}
        >
          <span className="text-muted-foreground mt-0.5 min-w-[112px] text-xs">
            {dateFormatter.format(new Date(ev.created_at))}
          </span>
          <span className="flex-1">
            {renderEventLabel(ev)}
            {ev.is_internal && (
              <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Internal
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ---- renderEventLabel -------------------------------------------------------

function renderEventLabel(ev: TicketEvent): string {
  const p = ev.payload
  switch (ev.event_type) {
    case 'created':
      return t.ticketDetail.eventCreated
    case 'status_changed':
      return t.ticketDetail.eventStatusChanged(
        String(p.from ?? '?'),
        String(p.to ?? '?'),
      )
    case 'assigned':
      return t.ticketDetail.eventAssigned
    case 'unassigned':
      return t.ticketDetail.eventUnassigned
    case 'blocked':
      return t.ticketDetail.eventBlocked
    case 'unblocked':
      return t.ticketDetail.eventUnblocked
    case 'comment_added':
      return p.is_internal
        ? t.ticketDetail.eventCommentInternal
        : t.ticketDetail.eventCommentAdded
    case 'label_added':
      return t.ticketDetail.eventLabelAdded
    case 'label_removed':
      return t.ticketDetail.eventLabelRemoved
    case 'promoted':
      return t.ticketDetail.eventPromoted(String(p.linked_bd_id ?? '?'))
    case 'shipped':
      return t.ticketDetail.eventShipped(String(p.release_ref ?? '?'))
    default:
      return t.ticketDetail.eventUnknown
  }
}
