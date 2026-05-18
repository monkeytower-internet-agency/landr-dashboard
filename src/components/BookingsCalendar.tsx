import { useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core'
import { Button } from '@/components/ui/button'
import {
  bookingsToCalendarEvents,
  toDateOnlyIso,
  type BookingCalendarEvent,
  type BookingRow,
  type BookingSemanticState,
} from '@/lib/bookings'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

const STATE_CLASS: Record<BookingSemanticState, string> = {
  pending:
    'bg-muted text-muted-foreground border-border hover:bg-muted/80',
  confirmed:
    'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
  finalised:
    'bg-accent text-accent-foreground border-accent hover:bg-accent/80',
  cancelled:
    'bg-destructive/10 text-destructive border-destructive/30 line-through hover:bg-destructive/20',
  no_show:
    'bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90',
}

const VIEW_LABEL: Record<CalendarView, string> = {
  dayGridMonth: t.calendar.viewMonth,
  timeGridWeek: t.calendar.viewWeek,
  timeGridDay: t.calendar.viewDay,
}

type Props = {
  rows: BookingRow[]
  onEventClick?: (row: BookingRow) => void
  onReschedule?: (args: {
    event: BookingCalendarEvent
    newStart: string
    newEnd: string | null
  }) => void
  initialView?: CalendarView
}

export function BookingsCalendar({
  rows,
  onEventClick,
  onReschedule,
  initialView = 'dayGridMonth',
}: Props) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const [view, setView] = useState<CalendarView>(initialView)

  const calendarEvents = useMemo<BookingCalendarEvent[]>(
    () => bookingsToCalendarEvents(rows),
    [rows],
  )
  const eventById = useMemo(() => {
    const map = new Map<string, BookingCalendarEvent>()
    for (const e of calendarEvents) map.set(e.id, e)
    return map
  }, [calendarEvents])

  const fcEvents = useMemo<EventInput[]>(
    () =>
      calendarEvents.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end ?? undefined,
        allDay: e.allDay,
        editable: e.itemId !== null,
        extendedProps: {
          state: e.state,
          productName: e.productName,
          customerName: e.customerName,
        },
      })),
    [calendarEvents],
  )

  function handleViewChange(next: CalendarView) {
    setView(next)
    calendarRef.current?.getApi().changeView(next)
  }

  function handleEventClick(arg: EventClickArg) {
    const ev = eventById.get(arg.event.id)
    if (ev && onEventClick) onEventClick(ev.raw)
  }

  function handleEventDrop(arg: EventDropArg) {
    const ev = eventById.get(arg.event.id)
    if (!ev || !ev.itemId) {
      arg.revert()
      return
    }
    if (!onReschedule) {
      arg.revert()
      return
    }
    const newStartDate = arg.event.start
    if (!newStartDate) {
      arg.revert()
      return
    }
    const newStart = toDateOnlyIso(newStartDate)
    // FullCalendar reports end as exclusive for all-day events; subtract
    // one day so the persisted date_range_end stays inclusive.
    let newEnd: string | null = null
    if (arg.event.end) {
      const endExclusive = new Date(arg.event.end)
      if (arg.event.allDay) {
        endExclusive.setDate(endExclusive.getDate() - 1)
      }
      newEnd = toDateOnlyIso(endExclusive)
    }
    onReschedule({ event: ev, newStart, newEnd })
  }

  function renderEventContent(arg: EventContentArg) {
    const state = arg.event.extendedProps.state as
      | BookingSemanticState
      | undefined
    const cls = state ? STATE_CLASS[state] : STATE_CLASS.pending
    return (
      <div
        data-testid="booking-event"
        data-state={state ?? 'pending'}
        className={cn(
          'flex flex-col gap-0.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs leading-tight',
          cls,
        )}
      >
        {arg.timeText ? (
          <span className="font-mono text-[10px] opacity-80">
            {arg.timeText}
          </span>
        ) : null}
        <span className="truncate font-medium">{arg.event.title}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-1" role="tablist">
        {(Object.keys(VIEW_LABEL) as CalendarView[]).map((v) => (
          <Button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            size="sm"
            variant={view === v ? 'default' : 'outline'}
            onClick={() => handleViewChange(v)}
          >
            {VIEW_LABEL[v]}
          </Button>
        ))}
      </div>
      <div className="landr-fc rounded-md border p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={initialView}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="auto"
          firstDay={1}
          weekNumbers={false}
          editable={!!onReschedule}
          eventStartEditable
          eventDurationEditable={false}
          events={fcEvents}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
          nowIndicator
        />
      </div>
    </div>
  )
}
