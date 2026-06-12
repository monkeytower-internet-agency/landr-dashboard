// landr-21x1 — Shared day-roster UI components.
//
// Extracted from BookingsCalendar.tsx so both BookingsCalendar and
// CalendarLayout (daily-roster mode) can import them without duplicating.
//
// DayCellRoster — compact per-day flying roster inside a month-grid day cell.
//   Shows first ROSTER_CELL_LIMIT distinct names + a '+N more' affordance.
//   The whole block is a single button that opens the day roster panel.
//
// DayRosterPanel — full per-day flying roster Dialog, grouped by booking.
//   Each booking heading opens that booking's detail sheet.
//
// formatRosterDate — shared date formatter (ISO → human, en-IE locale).
//   Mirrors the formatAgendaDate helper in BookingsCalendar; both should
//   use this shared version going forward to stay in sync.

import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  groupRosterByBooking,
  type DayRosterEntry,
} from '@/lib/day-roster'
import { t } from '@/lib/strings'

// ---------------------------------------------------------------------------
// Date formatting — shared with CalendarLayout daily-roster mode.

const _rosterDateFormatter = new Intl.DateTimeFormat('en-IE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// eslint-disable-next-line react-refresh/only-export-components
export function formatRosterDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
  return _rosterDateFormatter.format(date)
}

// ---------------------------------------------------------------------------
// DayCellRoster — compact per-day flying roster inside a month-grid day cell.

const ROSTER_CELL_LIMIT = 3

export type DayCellRosterProps = {
  iso: string
  dayNumberText: string
  entries: DayRosterEntry[]
  onOpen: () => void
}

export function DayCellRoster({
  iso,
  dayNumberText,
  entries,
  onOpen,
}: DayCellRosterProps) {
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
// DayRosterPanel — the full per-day flying roster Dialog, grouped by booking.

export type DayRosterPanelProps = {
  iso: string | null
  entries: DayRosterEntry[]
  onClose: () => void
  onOpenBooking: (bookingId: string) => void
}

export function DayRosterPanel({
  iso,
  entries,
  onClose,
  onOpenBooking,
}: DayRosterPanelProps) {
  const groups = useMemo(() => groupRosterByBooking(entries), [entries])
  const total = entries.length
  const dateLabel = iso ? formatRosterDate(iso) : ''

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
