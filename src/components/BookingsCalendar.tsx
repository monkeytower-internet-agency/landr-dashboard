import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {
  DatesSetArg,
  DayCellContentArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CustomerNameLink } from '@/components/CustomerNameLink'
import {
  bookingsToCalendarEvents,
  toDateOnlyIso,
  type BookingCalendarEvent,
  type BookingRow,
  type BookingSemanticState,
} from '@/lib/bookings'
import { fetchAvailability, type AvailabilityRow } from '@/lib/availability'
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
  // landr-1lj — controlled-view mode. When `view` is provided, the
  // component is controlled: it renders `view` and reports changes via
  // `onViewChange` (so callers can persist per-operator memory). Omit
  // both for the legacy uncontrolled flow that just starts at
  // `initialView`.
  view?: CalendarView
  onViewChange?: (next: CalendarView) => void
  // landr-f1s — calendar display prefs from the operator row. Default
  // values mirror the DB defaults so omitting these in tests still
  // produces sensible behaviour.
  workHoursStart?: string
  workHoursEnd?: string
  /** true = 12h AM/PM, false = 24h. */
  hour12?: boolean
  /** landr-m4zq — 0=Sunday..6=Saturday. Drives FullCalendar `firstDay`.
   *  Default 1 (Monday) mirrors the DB default. */
  firstDayOfWeek?: number
  // landr-3uai — when both are set, per-day capacity pills are rendered
  // in each day cell's corner. Click → /schedule with date+product
  // preselected. Both null/undefined ⇒ no pills (preserves the clean
  // daily-ops calendar).
  operatorId?: string | null
  activeProductId?: string | null
}

// landr-3uai — pill state derived from reserved/capacity sums for the day.
type CapacityState = 'open' | 'full' | 'overbooked'

function capacityState(reserved: number, capacity: number): CapacityState {
  if (capacity > 0 && reserved > capacity) return 'overbooked'
  if (capacity > 0 && reserved === capacity) return 'full'
  return 'open'
}

const CAPACITY_PILL_CLASS: Record<CapacityState, string> = {
  open:
    'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  full:
    'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  overbooked:
    'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20',
}

type DayCapacity = { capacity: number; reserved: number }

function groupAvailabilityByDate(
  rows: AvailabilityRow[],
): Map<string, DayCapacity> {
  const out = new Map<string, DayCapacity>()
  for (const row of rows) {
    const prev = out.get(row.date)
    if (prev) {
      prev.capacity += row.capacity
      prev.reserved += row.capacity_reserved
    } else {
      out.set(row.date, {
        capacity: row.capacity,
        reserved: row.capacity_reserved,
      })
    }
  }
  return out
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function BookingsCalendar({
  rows,
  onEventClick,
  onCustomerClick,
  onReschedule,
  initialView = 'dayGridMonth',
  view: controlledView,
  onViewChange,
  workHoursStart = '08:00',
  workHoursEnd = '20:00',
  hour12 = false,
  firstDayOfWeek = 1,
  operatorId,
  activeProductId,
}: Props) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const navigate = useNavigate()
  const isControlled = controlledView !== undefined
  const [uncontrolledView, setUncontrolledView] = useState<CalendarView>(
    controlledView ?? initialView,
  )
  const view: CalendarView = isControlled ? controlledView : uncontrolledView

  // landr-3uai — track the visible date range so the capacity query can be
  // keyed on it. Falls back to a 6-week window around today on first paint
  // (before FullCalendar fires datesSet).
  const [visibleRange, setVisibleRange] = useState<{
    from: string
    to: string
  }>(() => {
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 14)
    const end = new Date(today)
    end.setDate(end.getDate() + 42)
    return { from: toLocalIso(start), to: toLocalIso(end) }
  })

  function handleDatesSet(arg: DatesSetArg) {
    // FullCalendar reports `end` as exclusive — subtract one day so the
    // window matches the inclusive `to` shape used by /availability.
    const end = new Date(arg.end)
    end.setDate(end.getDate() - 1)
    const next = { from: toLocalIso(arg.start), to: toLocalIso(end) }
    setVisibleRange((prev) =>
      prev.from === next.from && prev.to === next.to ? prev : next,
    )
  }

  // landr-3uai — only fire the availability query when a product filter
  // is active. Without it, the calendar stays clean (no pills, no fetch).
  const availabilityEnabled = !!operatorId && !!activeProductId
  const availabilityQuery = useQuery<AvailabilityRow[]>({
    queryKey: [
      'calendar-availability',
      operatorId ?? 'none',
      activeProductId ?? 'none',
      visibleRange.from,
      visibleRange.to,
    ],
    queryFn: () =>
      fetchAvailability(
        operatorId as string,
        activeProductId as string,
        visibleRange.from,
        visibleRange.to,
      ),
    enabled: availabilityEnabled,
  })

  const capacityByDate = useMemo(
    () => groupAvailabilityByDate(availabilityQuery.data ?? []),
    [availabilityQuery.data],
  )

  // landr-1lj — in controlled mode the parent owns view state. When that
  // value changes externally (e.g. operator switch picks up another
  // operator's stored view), drive FullCalendar to match.
  useEffect(() => {
    if (!isControlled) return
    const api = calendarRef.current?.getApi()
    if (api && api.view.type !== view) api.changeView(view)
  }, [isControlled, view])
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
    if (!isControlled) setUncontrolledView(next)
    onViewChange?.(next)
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

  // landr-3uai — render a small capacity pill in each day cell's corner.
  // The pill only appears in dayGrid* views (month grid) where day cells
  // have room for the badge; timeGrid* slot views are pill-free. When no
  // product filter is active, this returns FullCalendar's default content
  // so the daily-ops calendar stays clean.
  function renderDayCellContent(arg: DayCellContentArg) {
    if (!availabilityEnabled) return undefined
    const iso = toLocalIso(arg.date)
    const summary = capacityByDate.get(iso)
    return (
      <div className="relative flex h-full w-full flex-col p-1">
        <div className="text-xs font-medium">{arg.dayNumberText}</div>
        {summary ? (
          <button
            type="button"
            data-testid="calendar-capacity-pill"
            data-date={iso}
            data-state={capacityState(summary.reserved, summary.capacity)}
            aria-label={t.calendar.capacityPillAria(
              summary.reserved,
              summary.capacity,
              iso,
            )}
            onClick={(e) => {
              e.stopPropagation()
              const params = new URLSearchParams({
                date: iso,
                product: activeProductId as string,
              })
              navigate(`/schedule?${params.toString()}`)
            }}
            className={cn(
              'absolute right-1 top-1 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono leading-none transition-colors',
              CAPACITY_PILL_CLASS[
                capacityState(summary.reserved, summary.capacity)
              ],
            )}
          >
            {summary.reserved}/{summary.capacity}
          </button>
        ) : null}
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
      <Tabs
        value={view}
        onValueChange={(next) => handleViewChange(next as CalendarView)}
      >
        <TabsList
          className="flex items-center justify-end gap-1 border-0 bg-transparent p-0"
        >
          {(Object.keys(VIEW_LABEL) as CalendarView[]).map((v) => (
            <TabsTrigger key={v} value={v} asChild>
              <Button
                type="button"
                size="sm"
                variant={view === v ? 'default' : 'outline'}
              >
                {VIEW_LABEL[v]}
              </Button>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
      {/* landr-gu14 — tighter padding on phone so the FullCalendar grid
          has more width to render day cells; desktop keeps the original
          p-3 breathing room. */}
      <div className="landr-fc rounded-md border p-1 sm:p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={isControlled ? controlledView : initialView}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="auto"
          firstDay={firstDayOfWeek}
          weekNumbers={false}
          editable={!!onReschedule}
          eventStartEditable
          eventDurationEditable={false}
          events={fcEvents}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
          datesSet={handleDatesSet}
          dayCellContent={renderDayCellContent}
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
