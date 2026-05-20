import { useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, DayCellContentArg } from '@fullcalendar/core'
import type { AvailabilityRow } from '@/lib/availability'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

type DaySummary = {
  date: string
  capacity: number
  reserved: number
  rows: AvailabilityRow[]
  allClosed: boolean
}

type Props = {
  rows: AvailabilityRow[]
  onDayClick?: (summary: DaySummary | null, date: string) => void
  onPillClick?: (summary: DaySummary | null, date: string) => void
  onRangeSelect?: (fromDate: string, toDate: string) => void
}

function groupByDate(rows: AvailabilityRow[]): Map<string, DaySummary> {
  const out = new Map<string, DaySummary>()
  for (const row of rows) {
    const prev = out.get(row.date)
    if (prev) {
      prev.capacity += row.capacity
      prev.reserved += row.capacity_reserved
      prev.rows.push(row)
      prev.allClosed = prev.allClosed && row.capacity === 0
    } else {
      out.set(row.date, {
        date: row.date,
        capacity: row.capacity,
        reserved: row.capacity_reserved,
        rows: [row],
        allClosed: row.capacity === 0,
      })
    }
  }
  return out
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function AvailabilityCalendar({
  rows,
  onDayClick,
  onPillClick,
  onRangeSelect,
}: Props) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const byDate = useMemo(() => groupByDate(rows), [rows])

  function handleSelect(arg: DateSelectArg) {
    if (!onRangeSelect) return
    // FullCalendar end is exclusive — subtract one day for inclusive range.
    const end = new Date(arg.end)
    end.setDate(end.getDate() - 1)
    const toIso = toLocalIso
    onRangeSelect(toIso(arg.start), toIso(end))
    calendarRef.current?.getApi().unselect()
  }

  function handleDayCellDidMount(arg: DayCellContentArg) {
    if (!onDayClick) return
    const iso = toLocalIso(arg.date)
    const summary = byDate.get(iso) ?? null
    const el = arg.el
    el.style.cursor = 'pointer'
    el.addEventListener('click', (ev: MouseEvent) => {
      // FullCalendar's selectable swallows single clicks via selectMirror but
      // the cell-level click still fires; only intercept clicks that aren't
      // part of a drag-select.
      const target = ev.target as HTMLElement
      if (target.closest('.fc-event')) return
      // Pill clicks call stopPropagation in React-land, but FullCalendar
      // attaches its cell handler at the DOM level — bypass cell open when
      // the click originated on the pill button.
      if (target.closest('[data-testid="day-chip"][data-interactive="true"]')) {
        return
      }
      onDayClick(summary, iso)
    })
  }

  function renderDayCellContent(arg: DayCellContentArg) {
    const iso = toLocalIso(arg.date)
    const summary = byDate.get(iso)
    const handlePill = onPillClick
      ? (ev: ReactMouseEvent<HTMLButtonElement>) => {
          // Stop the click from bubbling to the cell-level click handler
          // (which would also open the day editor — landr-5rsf).
          ev.stopPropagation()
          onPillClick(summary ?? null, iso)
        }
      : undefined
    return (
      <div className="flex h-full w-full flex-col gap-1 p-1">
        <div className="text-muted-foreground text-xs font-medium">
          {arg.dayNumberText}
        </div>
        {summary ? (
          summary.allClosed ? (
            <button
              type="button"
              data-testid="day-chip"
              data-state="closed"
              data-interactive={handlePill ? 'true' : undefined}
              onClick={handlePill}
              className={cn(
                'inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[10px]',
                'border-destructive/30 bg-destructive/10 text-destructive line-through',
                handlePill ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              {t.schedule.dayClosed}
            </button>
          ) : (
            <button
              type="button"
              data-testid="day-chip"
              data-state="open"
              data-interactive={handlePill ? 'true' : undefined}
              onClick={handlePill}
              className={cn(
                'inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[10px]',
                'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
                handlePill ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              {summary.reserved}/{summary.capacity}
            </button>
          )
        ) : (
          <span
            data-testid="day-chip"
            data-state="empty"
            className="text-muted-foreground text-[10px]"
          >
            {t.schedule.dayUnscheduled}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="landr-fc rounded-md border p-3">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        height="auto"
        firstDay={1}
        selectable={!!onRangeSelect}
        selectMirror
        select={handleSelect}
        dayCellContent={renderDayCellContent}
        dayCellDidMount={handleDayCellDidMount}
      />
    </div>
  )
}
