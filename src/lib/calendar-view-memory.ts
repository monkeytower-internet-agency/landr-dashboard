// landr-1lj — per-operator memory of the BookingsCalendar's last view
// (month / week / day). Stored under
// `landr.dashboard.calendarView.<operatorId>` so switching operators
// surfaces THAT operator's last preference and new operators get the
// shared default (timeGridWeek). The user's broader filter chips live
// in lib/bookings-filters and are user-scoped instead — the two state
// slices are deliberately orthogonal.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

export const DEFAULT_CALENDAR_VIEW: CalendarView = 'timeGridWeek'

const VALID_VIEWS: ReadonlyArray<CalendarView> = [
  'dayGridMonth',
  'timeGridWeek',
  'timeGridDay',
]

export function storageKey(operatorId: string): string {
  return `landr.dashboard.calendarView.${operatorId}`
}

function isCalendarView(v: unknown): v is CalendarView {
  return typeof v === 'string' && (VALID_VIEWS as ReadonlyArray<string>).includes(v)
}

function readStored(operatorId: string): CalendarView {
  if (typeof window === 'undefined') return DEFAULT_CALENDAR_VIEW
  try {
    const raw = window.localStorage.getItem(storageKey(operatorId))
    if (isCalendarView(raw)) return raw
    return DEFAULT_CALENDAR_VIEW
  } catch {
    return DEFAULT_CALENDAR_VIEW
  }
}

function writeStored(operatorId: string, value: CalendarView): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(operatorId), value)
  } catch {
    /* silently ignore — quota / disabled storage. */
  }
}

export type UseCalendarView = {
  view: CalendarView
  setView: (next: CalendarView) => void
}

/**
 * Restore-and-persist the BookingsCalendar view per operator. Switching
 * `operatorId` picks up THAT operator's previously stored value (or the
 * default for first-time operators).
 */
export function useCalendarView(operatorId: string | null): UseCalendarView {
  const [view, setViewState] = useState<CalendarView>(() =>
    operatorId ? readStored(operatorId) : DEFAULT_CALENDAR_VIEW,
  )

  // When the operator changes, hydrate from THAT operator's stored value.
  const lastOperatorRef = useRef<string | null>(operatorId)
  useEffect(() => {
    if (lastOperatorRef.current === operatorId) return
    lastOperatorRef.current = operatorId
    setViewState(operatorId ? readStored(operatorId) : DEFAULT_CALENDAR_VIEW)
  }, [operatorId])

  const setView = useCallback(
    (next: CalendarView) => {
      setViewState(next)
      if (operatorId) writeStored(operatorId, next)
    },
    [operatorId],
  )

  return useMemo(() => ({ view, setView }), [view, setView])
}
