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
import { CustomerNameLink } from '@/components/CustomerNameLink'
import {
  bookingsToCalendarEvents,
  toDateOnlyIso,
  type BookingCalendarEvent,
  type BookingRow,
  type BookingSemanticState,
} from '@/lib/bookings'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

// landr-f1s — pad a Postgres time value into FullCalendar's expected
// 'HH:MM:SS' shape. Accepts 'HH:MM' or 'HH:MM:SS'; returns 'HH:MM:SS'.
function toFcTime(value: string): string {
  return /^\d{1,2}:\d{2}:\d{2}$/.test(value) ? value : `${value}:00`
}

type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

const STATE_CLASS: Record<BookingSemanticState, string> = {
  pending:
    'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700',
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
  onCustomerClick?: (contactId: string) => void
  onReschedule?: (args: {
    event: BookingCalendarEvent
    newStart: string
    newEnd: string | null
  }) => void
  initialView?: CalendarView
  // landr-f1s — calendar display prefs from the operator row. Default
  // values mirror the DB defaults so omitting these in tests still
  // produces sensible behaviour.
  workHoursStart?: string
  workHoursEnd?: string
  /** true = 12h AM/PM, false = 24h. */
  hour12?: boolean
}

export function BookingsCalendar({
  rows,
  onEventClick,
  onCustomerClick,
  onReschedule,
  initialView = 'dayGridMonth',
  workHoursStart = '08:00',
  workHoursEnd = '20:00',
  hour12 = false,
}: Props) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const [view, setView] = useState<CalendarView>(initialView)
  // landr-f1s — when off-hours are collapsed (default), the calendar's
  // vertical time axis only spans [workHoursStart, workHoursEnd). When
  // expanded, the axis spans the full 24h day. State is local; persisting
  // can come later if users actually request it.
  const [offHoursExpanded, setOffHoursExpanded] = useState(false)

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
          contactId: e.raw.customer?.id ?? null,
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
    const contactId = arg.event.extendedProps.contactId as string | null
    const customerName = arg.event.extendedProps.customerName as
      | string
      | undefined
    const productName = arg.event.extendedProps.productName as
      | string
      | null
      | undefined
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
        {onCustomerClick && contactId && customerName ? (
          <span className="flex flex-col gap-0 truncate">
            <CustomerNameLink
              contactId={contactId}
              display={customerName}
              onClick={onCustomerClick}
              className="font-medium"
            />
            {productName ? (
              <span className="truncate opacity-80">{productName}</span>
            ) : null}
          </span>
        ) : (
          <span className="truncate font-medium">{arg.event.title}</span>
        )}
      </div>
    )
  }

  // landr-f1s — only the timeGrid* views have a vertical time axis. The
  // month grid is unaffected; pass slot props unconditionally — FullCalendar
  // ignores them in dayGridMonth.
  const slotMinTime = offHoursExpanded ? '00:00:00' : toFcTime(workHoursStart)
  const slotMaxTime = offHoursExpanded ? '24:00:00' : toFcTime(workHoursEnd)
  const showOffHoursToggle = view === 'timeGridWeek' || view === 'timeGridDay'

  // FullCalendar accepts a formatter spec object; hour12 toggles AM/PM.
  const slotLabelFormat = {
    hour: '2-digit' as const,
    minute: '2-digit' as const,
    hour12,
  }
  const eventTimeFormat = {
    hour: '2-digit' as const,
    minute: '2-digit' as const,
    hour12,
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
      {showOffHoursToggle ? (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={offHoursExpanded}
            onClick={() => setOffHoursExpanded((v) => !v)}
            data-testid="off-hours-toggle"
          >
            {offHoursExpanded
              ? t.calendar.collapseOffHours
              : t.calendar.expandOffHours(workHoursStart, workHoursEnd)}
          </Button>
        </div>
      ) : null}
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
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          slotLabelFormat={slotLabelFormat}
          eventTimeFormat={eventTimeFormat}
        />
      </div>
    </div>
  )
}
