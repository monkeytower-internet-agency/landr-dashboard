import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { BookingsCalendar } from '@/components/BookingsCalendar'
import { BookingsFilters } from '@/components/bookings/BookingsFilters'
import { CustomerDetailSheet } from '@/components/CustomerDetailSheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchBookings,
  rescheduleBookingItem,
  type BookingRow,
} from '@/lib/bookings'
import { filterBookings } from '@/lib/bookings-filter-match'
import { useBookingsFilters } from '@/lib/bookings-filters'
import { useCalendarView } from '@/lib/calendar-view-memory'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

export function Calendar() {
  const { currentOperatorId } = useOperator()
  const { workHoursStart, workHoursEnd, hour12 } = useOperatorCalendarPrefs()
  const [active, setActive] = useState<BookingRow | null>(null)
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null)
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)
  const queryClient = useQueryClient()
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

  const reschedule = useMutation({
    mutationFn: rescheduleBookingItem,
    onSuccess: () => {
      setRescheduleError(null)
      queryClient.invalidateQueries({
        queryKey: ['bookings', currentOperatorId ?? 'none'],
      })
    },
    onError: (err: Error) => {
      setRescheduleError(err.message || t.calendar.rescheduleError)
      queryClient.invalidateQueries({
        queryKey: ['bookings', currentOperatorId ?? 'none'],
      })
    },
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const filteredRows = useMemo(
    () => filterBookings(rows, filtersApi.filters),
    [rows, filtersApi.filters],
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
      <PageTitle title={t.calendar.title} />
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.calendar.title}</h1>
      </header>
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
      ) : (
        <>
          {rescheduleError ? (
            <p
              role="alert"
              className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm"
            >
              {rescheduleError}
            </p>
          ) : null}
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
            view={calendarView.view}
            onViewChange={calendarView.setView}
            operatorId={currentOperatorId}
            activeProductId={activeProductId}
            onEventClick={(row) => setActive(row)}
            onCustomerClick={(id) => setOpenCustomerId(id)}
            onReschedule={({ event, newStart, newEnd }) => {
              if (!event.itemId) return
              reschedule.mutate({
                itemId: event.itemId,
                startDate: newStart,
                endDate: newEnd,
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
