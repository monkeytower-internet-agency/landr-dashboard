import { useMemo, useState } from 'react'
import { CalendarRangeIcon } from 'lucide-react'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { BookingsCalendar } from '@/components/BookingsCalendar'
import { BookingsFilters } from '@/components/bookings/BookingsFilters'
import { CustomerDetailSheet } from '@/components/CustomerDetailSheet'
import { EmptyState } from '@/components/EmptyState'
import { EmptyCalendar } from '@/components/illustrations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchBookings, type BookingRow } from '@/lib/bookings'
import {
  buildDayRoster,
  fetchFlyingParticipants,
  type FlyingParticipantsByBooking,
} from '@/lib/day-roster'
import { filterBookings } from '@/lib/bookings-filter-match'
import { useBookingsFilters } from '@/lib/bookings-filters'
import { useCalendarView } from '@/lib/calendar-view-memory'
import { useDragReschedule } from '@/lib/calendar-reschedule'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

export function Calendar() {
  const { currentOperatorId } = useOperator()
  const { workHoursStart, workHoursEnd, hour12, firstDayOfWeek } =
    useOperatorCalendarPrefs()
  const [active, setActive] = useState<BookingRow | null>(null)
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null)
  const filtersApi = useBookingsFilters()
  // landr-1lj — per-operator memory of the last selected calendar view.
  const calendarView = useCalendarView(currentOperatorId)

  const query = useRealtimeQuery<BookingRow[]>({
    queryKey: ['bookings', currentOperatorId ?? 'none'],
    queryFn: () => fetchBookings(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? [
          {
            table: 'bookings',
            filter: `operator_id=eq.${currentOperatorId}`,
          },
          {
            table: 'booking_products',
            filter: `operator_id=eq.${currentOperatorId}`,
          },
        ]
      : null,
  })

  // landr-nnbm — drag-to-reschedule: optimistic cache write + FastAPI
  // PATCH + sonner toast with Undo. Both the main /calendar and the
  // Views Calendar layout share `useDragReschedule`; the only
  // difference is which cache key receives the optimistic write.
  const { reschedule } = useDragReschedule({
    queryKeys: [['bookings', currentOperatorId ?? 'none']],
  })

  // landr-sr69 — flying participants for the day roster. One query per
  // operator (companions excluded server-side via is_guiding), kept live via
  // realtime on booking_participants. The per-day roster is derived
  // client-side from the bookings already loaded (their items.selected_days).
  const participantsQuery = useRealtimeQuery<FlyingParticipantsByBooking>({
    queryKey: ['flying-participants', currentOperatorId ?? 'none'],
    queryFn: () => fetchFlyingParticipants(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? [
          {
            table: 'booking_participants',
            filter: `operator_id=eq.${currentOperatorId}`,
          },
        ]
      : null,
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const filteredRows = useMemo(
    () => filterBookings(rows, filtersApi.filters),
    [rows, filtersApi.filters],
  )

  // landr-sr69 — roster keyed by day, derived from the FILTERED bookings so
  // the roster stays consistent with whatever the operator has filtered to.
  const rosterByDay = useMemo(
    () => buildDayRoster(filteredRows, participantsQuery.data ?? new Map()),
    [filteredRows, participantsQuery.data],
  )
  // landr-3uai — the calendar shows per-day capacity pills only when the
  // operator has narrowed to a single product. Multi-select means the
  // calendar still filters by those products, but the pill doesn't try to
  // sum across heterogeneous capacities (would be misleading).
  const activeProductId =
    filtersApi.filters.productIds.length === 1
      ? filtersApi.filters.productIds[0]
      : null

  return (
    <div className="flex flex-col gap-6">
      {/* The topbar (PageTitleDisplay) already renders "Calendar" as the page
          headline, so we don't repeat it in the body — just declare it. */}
      <PageTitle title={t.calendar.title} />
      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.calendar.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.calendar.loading}</p>
      ) : rows.length === 0 ? (
        // landr-s1mr — friendly empty state when the operator has zero
        // bookings at all. We surface this instead of the empty filter
        // bar + blank calendar grid, which read as "is it broken?".
        <EmptyState
          icon={CalendarRangeIcon}
          illustration={<EmptyCalendar className="h-full w-full" />}
          accentHue="bookings"
          title={t.emptyStates.calendar.title}
          description={t.emptyStates.calendar.description}
          data-testid="calendar-empty-state"
        />
      ) : (
        <>
          <BookingsFilters
            bookings={rows}
            filtersApi={filtersApi}
            testIdPrefix="calendar-filters"
          />
          <BookingsCalendar
            rows={filteredRows}
            workHoursStart={workHoursStart}
            workHoursEnd={workHoursEnd}
            hour12={hour12}
            firstDayOfWeek={firstDayOfWeek}
            view={calendarView.view}
            onViewChange={calendarView.setView}
            operatorId={currentOperatorId}
            activeProductId={activeProductId}
            rosterByDay={rosterByDay}
            onEventClick={(row) => setActive(row)}
            onCustomerClick={(id) => setOpenCustomerId(id)}
            onReschedule={({ event, newStart, newEnd }) => {
              if (!event.itemId) return
              // Resolve the live item from the row cache so we can
              // capture the previous dates for Undo.
              const item = event.raw.items.find((it) => it.id === event.itemId)
              const previousStart = item?.date_range_start ?? newStart
              const previousEnd = item?.date_range_end ?? null
              reschedule({
                bookingId: event.bookingId,
                itemId: event.itemId,
                newStart,
                newEnd,
                previousStart,
                previousEnd,
                label: event.title,
              })
            }}
          />
        </>
      )}
      <BookingDetailSheet
        row={active}
        onOpenChange={(open) => {
          if (!open) setActive(null)
        }}
        onCustomerClick={(id) => setOpenCustomerId(id)}
      />
      <CustomerDetailSheet
        contactId={openCustomerId}
        onOpenChange={(open) => {
          if (!open) setOpenCustomerId(null)
        }}
      />
    </div>
  )
}
