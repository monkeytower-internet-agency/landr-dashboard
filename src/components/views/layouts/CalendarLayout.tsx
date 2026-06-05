// landr-9kbl — Calendar layout renderer for a saved View.
//
// Plots each Item (BookingRow) as an event on a FullCalendar dayGrid month
// view, keyed off `view.config.calendarConfig.dateField`. If an optional
// `dateEndField` is configured, the event spans [dateField, dateEndField]
// inclusive; otherwise it renders as a single-day event on dateField.
//
// Reuses (deliberately, not crib-pasted):
//   - FullCalendar + dayGridPlugin / timeGridPlugin: already deps via
//     BookingsCalendar.tsx.
//   - BookingDetailSheet: shared detail panel; opened on event click.
//   - customerDisplay / productDisplay helpers from @/lib/bookings for the
//     compact event content.
//
// Differences from BookingsCalendar.tsx:
//   - No capacity pills (those belong to /calendar's daily-ops surface).
//   - dateField is dynamic — the Views abstraction picks ANY date field on
//     the entity, not just date_range_start.
//
// landr-mofm — view variants: month (default), week, day. Stored on
// `calendarConfig.view` and persisted via `onConfigChange` when the user
// picks a different variant. Mirrors the segmented switcher used by the
// legacy BookingsCalendar.
//
// landr-nnbm — drag-to-reschedule is now wired (was deferred in v1). The
// layout enables DnD only when `dateField === 'date_range_start'`, because
// the PATCH route writes `date_range_start` / `date_range_end` on
// booking_products; dragging an event whose calendar position is keyed on
// some other date field would silently move the wrong thing.

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import {
  customerDisplay,
  productDisplay,
  toDateOnlyIso,
  type BookingRow,
} from '@/lib/bookings'
import type { SavedViewWithState } from '@/lib/saved-views'
import { findField } from '@/lib/views-entity-fields'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import type { BookingItem } from '@/lib/views-bookings-data'

export type CalendarView = 'month' | 'week' | 'day'

const FC_VIEW_BY_VARIANT: Record<CalendarView, string> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
}

const VIEW_VARIANTS: ReadonlyArray<CalendarView> = ['month', 'week', 'day']

function isCalendarView(x: unknown): x is CalendarView {
  return x === 'month' || x === 'week' || x === 'day'
}

type CalendarConfig = {
  dateField?: string
  dateEndField?: string
  view?: CalendarView
}

function readCalendarConfig(
  config: Record<string, unknown> | null | undefined,
): CalendarConfig {
  if (!config) return {}
  const raw = (config as { calendarConfig?: unknown }).calendarConfig
  if (!raw || typeof raw !== 'object') return {}
  const c = raw as CalendarConfig
  return {
    dateField: typeof c.dateField === 'string' ? c.dateField : undefined,
    dateEndField:
      typeof c.dateEndField === 'string' ? c.dateEndField : undefined,
    view: isCalendarView(c.view) ? c.view : undefined,
  }
}

// Pluck a date string from a booking row for a given system field. Returns
// the earliest non-null value across items for item-level date fields.
function dateValue(row: BookingRow, fieldKey: string): string | null {
  switch (fieldKey) {
    case 'date_range_start': {
      let best: string | null = null
      for (const it of row.items) {
        if (!it.date_range_start) continue
        if (best === null || it.date_range_start < best) best = it.date_range_start
      }
      return best
    }
    case 'date_range_end': {
      let best: string | null = null
      for (const it of row.items) {
        if (!it.date_range_end) continue
        // Latest end pairs naturally with earliest start.
        if (best === null || it.date_range_end > best) best = it.date_range_end
      }
      return best
    }
    default:
      return null
  }
}

// landr-nnbm — pick the booking_products line whose date_range_start
// matches the value rendered on the calendar. Used to resolve a drop
// back to the line we should PATCH. Returns null if no item carries a
// matching date — caller must guard before firing the reschedule.
function itemAtStart(row: BookingRow, startIso: string): {
  id: string
  date_range_start: string
  date_range_end: string | null
} | null {
  for (const it of row.items) {
    if (it.date_range_start === startIso) {
      return {
        id: it.id,
        date_range_start: it.date_range_start,
        date_range_end: it.date_range_end,
      }
    }
  }
  return null
}

// FullCalendar treats all-day event `end` as EXCLUSIVE. Bump by one day so
// the visible range matches the inclusive [start, end] semantics stored on
// booking_products.
function bumpExclusive(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + 1))
  return date.toISOString().slice(0, 10)
}

// landr-nnbm — drag-to-reschedule payload. `itemId` is the
// booking_products line id of the EARLIEST scheduled item on the row
// (matches the pick used to plot the event). Callers wire this to
// useDragReschedule's `reschedule` so the hook owns the optimistic
// write, the FastAPI PATCH, and the toast / Undo. CalendarLayout itself
// stays pure (no react-query / no sonner).
export type CalendarReschedulePayload = {
  bookingId: string
  itemId: string
  newStart: string
  newEnd: string | null
  previousStart: string
  previousEnd: string | null
  label: string
}

type Props = {
  view: SavedViewWithState
  items: BookingItem[]
  /** Optional override for layout-internal testing — defaults to
   *  manage-its-own-sheet behaviour. */
  onItemClick?: (item: BookingItem) => void
  /** landr-m4zq — 0=Sunday..6=Saturday. Defaults to 1 (Monday) so
   *  callers that haven't been updated still render the previous
   *  Europe-first calendar. */
  firstDayOfWeek?: number
  /** landr-mofm — when wired, the view-variant switcher (month/week/day)
   *  persists into view.config.calendarConfig.view via this callback.
   *  When omitted the switcher still works locally but won't survive a
   *  remount. */
  onConfigChange?: (patch: Record<string, unknown>) => void
  /** landr-nnbm — when set AND the view's dateField is
   *  `date_range_start`, events become draggable. Drop fires this
   *  callback with the new + previous dates so the parent can patch
   *  optimistically + show a toast with Undo. */
  onReschedule?: (payload: CalendarReschedulePayload) => void
}

export function CalendarLayout({
  view,
  items,
  onItemClick,
  firstDayOfWeek = 1,
  onConfigChange,
  onReschedule,
}: Props) {
  const calendarConfig = useMemo(
    () => readCalendarConfig(view.config),
    [view.config],
  )
  const activeView: CalendarView = calendarConfig.view ?? 'month'

  const dateFieldMeta = calendarConfig.dateField
    ? findField(view.entity_type, calendarConfig.dateField)
    : null
  const dateEndFieldMeta = calendarConfig.dateEndField
    ? findField(view.entity_type, calendarConfig.dateEndField)
    : null

  const validDateField = dateFieldMeta?.type === 'date'
  const validDateEndField =
    dateEndFieldMeta === null
      ? true // not configured → no constraint
      : dateEndFieldMeta?.type === 'date'

  // Detail sheet is layout-local. Tests can drive it via onItemClick; the
  // shipped UI uses internal state so the layout drops into ViewPage without
  // a sheet wire-up upstream.
  const [openRow, setOpenRow] = useState<BookingRow | null>(null)

  // landr-mofm — drive FullCalendar's view via a ref. We render our own
  // segmented switcher (outside FullCalendar's headerToolbar) so we control
  // the data-testids + can persist the choice into calendarConfig.view.
  const calendarRef = useRef<FullCalendar | null>(null)
  useEffect(() => {
    const api = calendarRef.current?.getApi()
    const target = FC_VIEW_BY_VARIANT[activeView]
    if (api && api.view.type !== target) api.changeView(target)
  }, [activeView])

  function handleSelectView(next: CalendarView) {
    if (next === activeView) return
    if (onConfigChange) {
      const prev = (view.config ?? {}) as Record<string, unknown>
      const prevCal = (prev.calendarConfig ?? {}) as Record<string, unknown>
      onConfigChange({
        ...prev,
        calendarConfig: { ...prevCal, view: next },
      })
    } else {
      // No persistence wired — still flip FullCalendar locally so the
      // switcher is functional in tests / standalone usage.
      calendarRef.current?.getApi().changeView(FC_VIEW_BY_VARIANT[next])
    }
  }

  // landr-nnbm — DnD is only safe when the calendar's date field is
  // `date_range_start`: the PATCH route writes that exact column on
  // booking_products. For any other date field, leave events
  // non-editable so a drop can't silently overwrite the wrong column.
  const dndEnabled =
    !!onReschedule && calendarConfig.dateField === 'date_range_start'

  const events = useMemo<EventInput[]>(() => {
    if (!validDateField || !validDateEndField || !calendarConfig.dateField) {
      return []
    }
    const out: EventInput[] = []
    for (const item of items) {
      const start = dateValue(item, calendarConfig.dateField)
      if (!start) continue
      const endRaw =
        calendarConfig.dateEndField !== undefined
          ? dateValue(item, calendarConfig.dateEndField)
          : null
      // FullCalendar `end` is exclusive for all-day events — bump by one day
      // so the range stays visible across the configured last date.
      const end = endRaw && endRaw >= start ? bumpExclusive(endRaw) : undefined
      // Only events backed by a real booking_products line can be
      // dragged (the PATCH route needs a `lineId`). When the calendar
      // is keyed on `date_range_start`, we resolve that line by
      // matching `start` — if no item matches (data drift), the event
      // stays draggable but the drop handler will revert.
      const isEditable = dndEnabled
      out.push({
        id: item.id,
        title: `${customerDisplay(item)} — ${productDisplay(item)}`,
        start,
        end,
        allDay: true,
        editable: isEditable,
        extendedProps: {
          customerName: customerDisplay(item),
          productName: productDisplay(item),
          rowId: item.id,
          // Capture the start used to plot the event so the drop
          // handler can resolve back to the underlying line by id.
          plottedStart: start,
        },
      })
    }
    return out
  }, [
    items,
    calendarConfig.dateField,
    calendarConfig.dateEndField,
    validDateField,
    validDateEndField,
    dndEnabled,
  ])

  // Index by id so the click handler can resolve back to the BookingRow.
  const itemsById = useMemo(() => {
    const map = new Map<string, BookingItem>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  if (!validDateField || !validDateEndField) {
    return (
      <Card data-testid="view-layout-calendar-placeholder">
        <CardHeader>
          <CardTitle>{t.views.body.calendar.placeholderTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {t.views.body.calendar.placeholderBody}
          </p>
        </CardContent>
      </Card>
    )
  }

  function handleEventClick(arg: EventClickArg) {
    const row = itemsById.get(arg.event.id)
    if (!row) return
    if (onItemClick) {
      onItemClick(row)
      return
    }
    setOpenRow(row)
  }

  function handleEventDrop(arg: EventDropArg) {
    if (!onReschedule || !dndEnabled) {
      arg.revert()
      return
    }
    const row = itemsById.get(arg.event.id)
    const newStartDate = arg.event.start
    if (!row || !newStartDate) {
      arg.revert()
      return
    }
    const plottedStart = arg.event.extendedProps.plottedStart as
      | string
      | undefined
    if (!plottedStart) {
      arg.revert()
      return
    }
    const line = itemAtStart(row, plottedStart)
    if (!line) {
      arg.revert()
      return
    }
    const newStart = toDateOnlyIso(newStartDate)
    // FullCalendar reports all-day end as exclusive — back off one day
    // so the persisted `date_range_end` stays inclusive (matches the
    // bumpExclusive applied at render time).
    let newEnd: string | null = null
    if (arg.event.end) {
      const endExclusive = new Date(arg.event.end)
      if (arg.event.allDay) {
        endExclusive.setDate(endExclusive.getDate() - 1)
      }
      newEnd = toDateOnlyIso(endExclusive)
    } else if (line.date_range_end) {
      // FullCalendar doesn't emit `end` when the event is single-day;
      // keep the previous end inclusive so the patch round-trips.
      newEnd = line.date_range_end
    }
    onReschedule({
      bookingId: row.id,
      itemId: line.id,
      newStart,
      newEnd,
      previousStart: line.date_range_start,
      previousEnd: line.date_range_end,
      label: `${customerDisplay(row)} — ${productDisplay(row)}`,
    })
  }

  function renderEventContent(arg: EventContentArg) {
    const customerName = arg.event.extendedProps.customerName as
      | string
      | undefined
    const productName = arg.event.extendedProps.productName as
      | string
      | undefined
    return (
      <div
        data-testid="view-calendar-event"
        data-row-id={arg.event.id}
        className={cn(
          'flex flex-col gap-0.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs leading-tight',
          'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
        )}
      >
        <span className="truncate font-medium">{customerName ?? arg.event.title}</span>
        {productName ? (
          <span className="truncate opacity-80">{productName}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="view-layout-calendar">
      <div
        className="flex items-center justify-end gap-1"
        data-testid="view-calendar-view-switcher"
      >
        {VIEW_VARIANTS.map((variant) => (
          <Button
            key={variant}
            type="button"
            size="sm"
            variant={activeView === variant ? 'default' : 'outline'}
            aria-pressed={activeView === variant}
            className="h-7 px-2 text-xs"
            data-testid={`view-calendar-view-${variant}`}
            onClick={() => handleSelectView(variant)}
          >
            {variant === 'month'
              ? t.calendar.viewMonth
              : variant === 'week'
                ? t.calendar.viewWeek
                : t.calendar.viewDay}
          </Button>
        ))}
      </div>
      {/* landr-3qkr.5 — horizontal scroll container with edge-fade so the
          user can see the calendar grid continues off-screen on narrow
          viewports (the FullCalendar month grid has a fixed min-width). */}
      <div className="landr-fc overflow-x-auto rounded-md border p-3 [mask-image:linear-gradient(to_right,black_90%,transparent_100%)]">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={FC_VIEW_BY_VARIANT[activeView]}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="auto"
          firstDay={firstDayOfWeek}
          weekNumbers={false}
          // landr-nnbm — `editable` toggles drag/drop globally on the
          // calendar; each event still sets its own `editable` flag so
          // non-DnD events stay frozen even with this on.
          editable={dndEnabled}
          eventStartEditable={dndEnabled}
          eventDurationEditable={false}
          events={events}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={renderEventContent}
        />
      </div>
      <BookingDetailSheet
        row={openRow}
        onOpenChange={(open) => {
          if (!open) setOpenRow(null)
        }}
      />
    </div>
  )
}
