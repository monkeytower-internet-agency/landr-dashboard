// landr-5f8q — chronological history view for the BookingDetailSheet
// "Timeline" tab. Reads from audit_log + payments + outbound_emails via
// fetchBookingTimeline(). Pure-presentation: all event synthesis lives in
// src/lib/bookings.ts so this component stays testable in isolation.

import { useQuery } from '@tanstack/react-query'
import {
  CalendarPlus,
  CheckCircle2,
  CircleDot,
  CircleSlash,
  CreditCard,
  Hotel,
  Mail,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import {
  fetchBookingTimeline,
  type BookingRow,
  type TimelineEvent,
  type TimelineEventKind,
} from '@/lib/bookings'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  booking: BookingRow
}

const ICON_BY_KIND: Record<TimelineEventKind, LucideIcon> = {
  created: CalendarPlus,
  stage_changed: CircleDot,
  approved: CheckCircle2,
  rejected: XCircle,
  hotel_confirmed: Hotel,
  hotel_declined: Hotel,
  paid: CreditCard,
  cancelled: CircleSlash,
  finalised: CheckCircle2,
  rescheduled: CalendarPlus,
  email_sent: Mail,
}

const TONE_BY_KIND: Record<TimelineEventKind, string> = {
  created: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  stage_changed:
    'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  approved:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  rejected: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  hotel_confirmed:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  hotel_declined: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  paid: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  finalised: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  rescheduled:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  email_sent:
    'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
}

const _timestampFormatter = new Intl.DateTimeFormat('en-IE', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return _timestampFormatter.format(d)
}

export function BookingTimeline({ booking }: Props): ReactNode {
  const query = useQuery<TimelineEvent[]>({
    // Keyed under ['bookings', id, 'timeline'] so the shared
    // invalidateBookingCaches() helper (['bookings']) automatically wipes
    // the timeline when any write touches this booking.
    queryKey: ['bookings', booking.id, 'timeline'],
    queryFn: () => fetchBookingTimeline(booking.id, booking),
    staleTime: 30_000,
  })

  if (query.isPending) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="booking-timeline-loading"
      >
        {t.bookings.timeline.loading}
      </p>
    )
  }

  if (query.isError) {
    return (
      <p
        className="text-destructive text-sm"
        role="alert"
        data-testid="booking-timeline-error"
      >
        {t.bookings.timeline.error}
      </p>
    )
  }

  const events = query.data ?? []
  if (events.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm italic"
        data-testid="booking-timeline-empty"
      >
        {t.bookings.timeline.empty}
      </p>
    )
  }

  return (
    <ol
      className="flex flex-col gap-3"
      aria-label={t.bookings.timeline.tabTimeline}
      data-testid="booking-timeline"
    >
      {events.map((evt) => {
        const Icon = ICON_BY_KIND[evt.kind] ?? CircleDot
        const tone = TONE_BY_KIND[evt.kind] ?? 'bg-muted text-muted-foreground'
        return (
          <li
            key={evt.id}
            className="flex items-start gap-3"
            data-event-kind={evt.kind}
          >
            <span
              className={cn(
                'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full',
                tone,
              )}
              aria-hidden
            >
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{evt.label}</span>
                <time
                  className="text-muted-foreground shrink-0 text-xs"
                  dateTime={evt.occurredAt}
                >
                  {formatTimestamp(evt.occurredAt)}
                </time>
              </div>
              {evt.detail ? (
                <span className="text-muted-foreground text-xs">
                  {evt.detail}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
