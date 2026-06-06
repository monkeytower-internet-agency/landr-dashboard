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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CustomerNameLink } from '@/components/CustomerNameLink'
import {
  bookingsToCalendarEvents,
  toDateOnlyIso,
  type BookingCalendarEvent,
  type BookingRow,
  type BookingSemanticState,
} from '@/lib/bookings'
import {
  groupRosterByBooking,
  type DayRosterEntry,
} from '@/lib/day-roster'
import { fetchAvailability, type AvailabilityRow } from '@/lib/availability'
import { useIsMobile } from '@/hooks/use-mobile'
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
  // landr-sr69 — flying roster keyed by ISO 'YYYY-MM-DD'. Each day's entries
  // are the flying participants (companions excluded) of every booking that
  // flies that day. When present, the month grid renders a compact roster in
  // each day cell and clicking a day opens the full roster panel. Omit (or
  // pass an empty map) to keep the legacy plain calendar.
  rosterByDay?: Map<string, DayRosterEntry[]>
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
  rosterByDay,
}: Props) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  // landr-3qkr.5 — on phones the month grid is unusable; default to agenda
  // list mode when the viewport is <md. The toggle lets users switch back.
  // Initialised to `true` on mobile; `false` on desktop. We use a lazy
  // initial state so the hook value (which starts `false` on first paint) is
  // read only once — switching from desktop to phone mid-session is not a
  // supported scenario so the stale initial value on frame 1 is acceptable.
  const [agendaMode, setAgendaMode] = useState(() => isMobile)

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

  // landr-sr69 — bookingId → BookingRow so the roster panel can open the
  // existing BookingDetailSheet flow via onEventClick(row).
  const rowById = useMemo(() => {
    const map = new Map<string, BookingRow>()
    for (const r of rows) map.set(r.id, r)
    return map
  }, [rows])

  // landr-sr69 — the day whose roster panel is open (ISO 'YYYY-MM-DD'), or
  // null when closed. Only meaningful when a roster is supplied.
  const rosterEnabled = !!rosterByDay && rosterByDay.size > 0
  const [openRosterDay, setOpenRosterDay] = useState<string | null>(null)
  const openRosterEntries =
    openRosterDay && rosterByDay ? (rosterByDay.get(openRosterDay) ?? []) : []

  // landr-sr69 — booking_id → distinct flying participant names, derived from
  // the day roster. The agenda (mobile) lists these under each booking entry.
  const participantsByBooking = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!rosterByDay) return map
    const seen = new Map<string, Set<string>>()
    for (const entries of rosterByDay.values()) {
      for (const e of entries) {
        let names = map.get(e.bookingId)
        let nameSet = seen.get(e.bookingId)
        if (!names) {
          names = []
          map.set(e.bookingId, names)
          nameSet = new Set()
          seen.set(e.bookingId, nameSet)
        }
        if (!nameSet!.has(e.participantName)) {
          nameSet!.add(e.participantName)
          names.push(e.participantName)
        }
      }
    }
    return map
  }, [rosterByDay])

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

  // landr-3uai / landr-sr69 — custom day-cell content. Renders (a) the
  // capacity pill in the corner when a single-product filter is active, and
  // (b) the flying roster (first names + '+N more') below the day number when
  // a roster is supplied. When neither is active, returns FullCalendar's
  // default content so the plain calendar stays clean.
  function renderDayCellContent(arg: DayCellContentArg) {
    if (!availabilityEnabled && !rosterEnabled) return undefined
    const iso = toLocalIso(arg.date)
    const summary = availabilityEnabled ? capacityByDate.get(iso) : undefined
    const roster = rosterByDay?.get(iso) ?? []
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
        {roster.length > 0 ? (
          <DayCellRoster
            iso={iso}
            dayNumberText={arg.dayNumberText}
            entries={roster}
            onOpen={() => setOpenRosterDay(iso)}
          />
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
      {/* Toolbar row: view-mode tabs on the left + agenda toggle on the right. */}
      {/* landr-3qkr.6 — flex-wrap so that if a phone user switches to grid
          mode the grid/list toggle + the Month/Week/Day view tabs wrap to a
          second line instead of being clipped by the page overflow-x-guard.
          Desktop is unchanged (wraps only when the row can't fit). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Grid/List toggle — shown always so users can switch on any screen.
            On mobile it defaults to List; on desktop it defaults to Grid. */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={!agendaMode ? 'default' : 'outline'}
            onClick={() => setAgendaMode(false)}
            data-testid="calendar-grid-toggle"
            aria-pressed={!agendaMode}
          >
            {t.calendar.agendaToggleToGrid}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={agendaMode ? 'default' : 'outline'}
            onClick={() => setAgendaMode(true)}
            data-testid="calendar-agenda-toggle"
            aria-pressed={agendaMode}
          >
            {t.calendar.agendaToggleToList}
          </Button>
        </div>

        {/* Grid-view tab switcher — only when showing the calendar grid. */}
        {!agendaMode ? (
          <Tabs
            value={view}
            onValueChange={(next) => handleViewChange(next as CalendarView)}
          >
            <TabsList
              className="flex items-center gap-1 border-0 bg-transparent p-0"
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
        ) : null}
      </div>

      {!agendaMode && showOffHoursToggle ? (
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

      {agendaMode ? (
        // landr-3qkr.5 — agenda list: chronological, day-grouped. Same tap
        // behaviour as the grid (calls onEventClick for the matching row).
        <AgendaList
          events={calendarEvents}
          participantsByBooking={participantsByBooking}
          onEventClick={onEventClick}
          onCustomerClick={onCustomerClick}
        />
      ) : (
        /* landr-gu14 — tighter padding on phone so the FullCalendar grid
           has more width to render day cells; desktop keeps the original
           p-3 breathing room. */
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
      )}

      {/* landr-sr69 — day roster panel. Opened by clicking a day-cell roster
          summary in the month grid. Names grouped by booking; each booking
          ref links into the existing BookingDetailSheet flow via
          onEventClick(row). A Dialog (not an in-cell popover) sidesteps
          FullCalendar's day-cell overflow clipping and works on mobile. */}
      <DayRosterPanel
        iso={openRosterDay}
        entries={openRosterEntries}
        onClose={() => setOpenRosterDay(null)}
        onOpenBooking={(bookingId) => {
          const row = rowById.get(bookingId)
          if (row && onEventClick) {
            setOpenRosterDay(null)
            onEventClick(row)
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// landr-sr69 — DayCellRoster: compact per-day flying roster inside a month
// grid day cell. Shows the first ROSTER_CELL_LIMIT names + a '+N more'
// affordance, then the whole block is a single button that opens the day
// roster panel. Kept compact (text-[10px], truncate, no wrap) so a 20-pilot
// day stays inside the cell without overflowing.

const ROSTER_CELL_LIMIT = 3

type DayCellRosterProps = {
  iso: string
  dayNumberText: string
  entries: DayRosterEntry[]
  onOpen: () => void
}

function DayCellRoster({ iso, dayNumberText, entries, onOpen }: DayCellRosterProps) {
  // Distinct participant names for the compact preview — the same pilot can
  // fly more than one booking that day; we de-dupe for the cell summary but
  // the panel still shows the full per-booking breakdown.
  const names = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of entries) {
      if (seen.has(e.participantName)) continue
      seen.add(e.participantName)
      out.push(e.participantName)
    }
    return out
  }, [entries])

  const shown = names.slice(0, ROSTER_CELL_LIMIT)
  const overflow = names.length - shown.length

  return (
    <button
      type="button"
      data-testid="calendar-day-roster"
      data-date={iso}
      data-count={names.length}
      aria-label={t.calendar.roster.dayCellAria(names.length, dayNumberText)}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className="mt-0.5 flex w-full flex-col items-start gap-px overflow-hidden rounded-sm text-left transition-colors hover:bg-accent/40"
    >
      {shown.map((name, i) => (
        <span
          key={i}
          data-testid="calendar-day-roster-name"
          className="block w-full truncate text-[10px] leading-tight text-foreground/80"
        >
          {name}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          data-testid="calendar-day-roster-more"
          className="block text-[10px] font-medium leading-tight text-muted-foreground"
        >
          {t.calendar.roster.moreCount(overflow)}
        </span>
      ) : null}
    </button>
  )
}

// ---------------------------------------------------------------------------
// landr-sr69 — DayRosterPanel: the full per-day flying roster, grouped by
// booking. Each booking heading is a button that opens that booking's detail
// sheet (via the parent's onEventClick), and lists its flying participants.

type DayRosterPanelProps = {
  iso: string | null
  entries: DayRosterEntry[]
  onClose: () => void
  onOpenBooking: (bookingId: string) => void
}

function DayRosterPanel({
  iso,
  entries,
  onClose,
  onOpenBooking,
}: DayRosterPanelProps) {
  const groups = useMemo(() => groupRosterByBooking(entries), [entries])
  // Total flying slots that day (sum across bookings) — a pilot flying two
  // bookings counts twice here, matching "N pilots flying" intent at the
  // booking level.
  const total = entries.length
  const dateLabel = iso ? formatAgendaDate(iso) : ''

  return (
    <Dialog open={iso !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md"
        data-testid="calendar-day-roster-panel"
        data-date={iso ?? undefined}
      >
        <DialogHeader>
          <DialogTitle>{dateLabel}</DialogTitle>
          <DialogDescription>
            {total > 0
              ? t.calendar.roster.panelHeading(total)
              : t.calendar.roster.panelEmpty}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {groups.map((group) => (
            <div
              key={group.bookingId}
              data-testid="roster-booking-group"
              data-booking-id={group.bookingId}
            >
              <button
                type="button"
                data-testid="roster-booking-link"
                onClick={() => onOpenBooking(group.bookingId)}
                className="mb-1 inline-flex items-center gap-1 rounded-sm font-mono text-xs font-semibold text-primary hover:underline"
              >
                {group.bookingRef}
              </button>
              <ul className="flex flex-col gap-0.5 pl-1">
                {group.participantNames.map((name, i) => (
                  <li
                    key={i}
                    data-testid="roster-participant-name"
                    className="text-sm"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// landr-3qkr.5 — AgendaList: chronological, day-grouped list of bookings.
//
// Groups events by their start date (ISO YYYY-MM-DD) and renders each group
// as a labelled section. Tapping a row calls onEventClick with the raw
// BookingRow — identical to the calendar grid's click behaviour so the
// parent's detail sheet flow is unchanged.

const _agendaDateFormatter = new Intl.DateTimeFormat('en-IE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function formatAgendaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
  return _agendaDateFormatter.format(date)
}

type AgendaListProps = {
  events: BookingCalendarEvent[]
  // landr-sr69 — booking_id → flying participant names. Listed under each
  // booking entry so the mobile agenda shows the full per-day roster.
  participantsByBooking?: Map<string, string[]>
  onEventClick?: (row: BookingRow) => void
  onCustomerClick?: (contactId: string) => void
}

function AgendaList({
  events,
  participantsByBooking,
  onEventClick,
  onCustomerClick,
}: AgendaListProps) {
  // Group by start date (YYYY-MM-DD), sorted chronologically.
  const groups = useMemo(() => {
    const map = new Map<string, BookingCalendarEvent[]>()
    const noDate: BookingCalendarEvent[] = []
    for (const ev of events) {
      const dateKey = ev.start ? ev.start.slice(0, 10) : null
      if (!dateKey) {
        noDate.push(ev)
        continue
      }
      const existing = map.get(dateKey)
      if (existing) {
        existing.push(ev)
      } else {
        map.set(dateKey, [ev])
      }
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    return { sorted, noDate }
  }, [events])

  if (groups.sorted.length === 0 && groups.noDate.length === 0) {
    return (
      <p
        className="text-muted-foreground py-8 text-center text-sm"
        data-testid="calendar-agenda-empty"
      >
        {t.calendar.agendaEmpty}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1" data-testid="calendar-agenda-list">
      {groups.sorted.map(([dateKey, dayEvents]) => (
        <AgendaDay
          key={dateKey}
          dateKey={dateKey}
          events={dayEvents}
          participantsByBooking={participantsByBooking}
          onEventClick={onEventClick}
          onCustomerClick={onCustomerClick}
        />
      ))}
      {groups.noDate.length > 0 ? (
        <AgendaDay
          key="__no-date__"
          dateKey={null}
          events={groups.noDate}
          participantsByBooking={participantsByBooking}
          onEventClick={onEventClick}
          onCustomerClick={onCustomerClick}
        />
      ) : null}
    </div>
  )
}

type AgendaDayProps = {
  dateKey: string | null
  events: BookingCalendarEvent[]
  participantsByBooking?: Map<string, string[]>
  onEventClick?: (row: BookingRow) => void
  onCustomerClick?: (contactId: string) => void
}

function AgendaDay({
  dateKey,
  events,
  participantsByBooking,
  onEventClick,
  onCustomerClick,
}: AgendaDayProps) {
  const dateLabel = dateKey ? formatAgendaDate(dateKey) : t.calendar.agendaNoDate
  return (
    <div data-testid={`agenda-day-${dateKey ?? 'no-date'}`}>
      <div className="bg-muted/40 border-t px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        {dateLabel}
      </div>
      <div className="divide-y">
        {events.map((ev) => (
          <AgendaRow
            key={ev.id}
            event={ev}
            participantNames={participantsByBooking?.get(ev.id) ?? []}
            onEventClick={onEventClick}
            onCustomerClick={onCustomerClick}
          />
        ))}
      </div>
    </div>
  )
}

type AgendaRowProps = {
  event: BookingCalendarEvent
  // landr-sr69 — flying participants on this booking, listed under the row.
  participantNames: string[]
  onEventClick?: (row: BookingRow) => void
  onCustomerClick?: (contactId: string) => void
}

function AgendaRow({
  event,
  participantNames,
  onEventClick,
  onCustomerClick,
}: AgendaRowProps) {
  const state = event.state
  const cls = STATE_CLASS[state]
  const contactId = event.raw.customer?.id ?? null

  return (
    <button
      type="button"
      data-testid="agenda-row"
      data-state={state}
      data-booking-id={event.id}
      onClick={() => onEventClick?.(event.raw)}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/20 min-h-[44px]',
      )}
    >
      {/* State colour strip */}
      <span
        className={cn(
          'mt-0.5 h-full w-1 shrink-0 rounded-full border',
          cls,
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {contactId && event.customerName && onCustomerClick ? (
          <CustomerNameLink
            contactId={contactId}
            display={event.customerName}
            onClick={onCustomerClick}
            className="truncate font-medium text-sm"
          />
        ) : (
          <span className="truncate font-medium text-sm block">
            {event.title}
          </span>
        )}
        {event.productName ? (
          <span className="truncate text-xs text-muted-foreground block">
            {event.productName}
          </span>
        ) : null}
        {participantNames.length > 0 ? (
          <ul
            className="mt-1 flex flex-col gap-px"
            data-testid="agenda-roster"
          >
            {participantNames.map((name, i) => (
              <li
                key={i}
                data-testid="agenda-roster-name"
                className="truncate text-xs text-foreground/70"
              >
                {name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </button>
  )
}
