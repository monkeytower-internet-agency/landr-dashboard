// landr-9kbl — Calendar layout renderer for a saved View.
//
// Plots each Item (BookingRow) as an event on a FullCalendar dayGrid month
// view, keyed off `view.config.calendarConfig.dateField`. If an optional
// `dateEndField` is configured, the event spans [dateField, dateEndField]
// inclusive; otherwise it renders as a single-day event on dateField.
//
// Reuses (deliberately, not crib-pasted):
//   - FullCalendar + dayGridPlugin: already a dep via BookingsCalendar.tsx.
//   - BookingDetailSheet: shared detail panel; opened on event click.
//   - customerDisplay / productDisplay helpers from @/lib/bookings for the
//     compact event content.
//
// Differences from BookingsCalendar.tsx:
//   - No view switcher (month grid only — week/day views aren't part of the
//     View Layout abstraction; users who want week-grid pick the legacy
//     /calendar page).
//   - No DnD reschedule in v1 (the spec explicitly defers this).
//   - No capacity pills (those belong to /calendar's daily-ops surface).
//   - dateField is dynamic — the Views abstraction picks ANY date field on
//     the entity, not just date_range_start.

import { useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import {
  customerDisplay,
  productDisplay,
  type BookingRow,
} from '@/lib/bookings'
import type { SavedViewWithState } from '@/lib/saved-views'
import { findField } from '@/lib/views-entity-fields'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import type { BookingItem } from '@/lib/views-bookings-data'

type CalendarConfig = {
  dateField?: string
  dateEndField?: string
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
}

export function CalendarLayout({
  view,
  items,
  onItemClick,
  firstDayOfWeek = 1,
}: Props) {
  const calendarConfig = useMemo(
    () => readCalendarConfig(view.config),
    [view.config],
  )

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
      out.push({
        id: item.id,
        title: `${customerDisplay(item)} — ${productDisplay(item)}`,
        start,
        end,
        allDay: true,
        extendedProps: {
          customerName: customerDisplay(item),
          productName: productDisplay(item),
          rowId: item.id,
        },
      })
    }
    return out
  }, [items, calendarConfig.dateField, calendarConfig.dateEndField, validDateField, validDateEndField])

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
      <div className="landr-fc rounded-md border p-3">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          height="auto"
          firstDay={firstDayOfWeek}
          weekNumbers={false}
          editable={false}
          events={events}
          eventClick={handleEventClick}
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
