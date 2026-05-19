import { useMemo, useState } from 'react'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { BookingsTable } from '@/components/BookingsTable'
import { BookingsFilters } from '@/components/bookings/BookingsFilters'
import { CustomerDetailSheet } from '@/components/CustomerDetailSheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchBookings, type BookingRow } from '@/lib/bookings'
import { filterBookings } from '@/lib/bookings-filter-match'
import { useBookingsFilters } from '@/lib/bookings-filters'
import { useOperator } from '@/lib/operator'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

export function Bookings() {
  const { currentOperatorId } = useOperator()
  const [active, setActive] = useState<BookingRow | null>(null)
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null)
  const filtersApi = useBookingsFilters()

  const query = useRealtimeQuery<BookingRow[]>({
    queryKey: ['bookings', currentOperatorId ?? 'none'],
    queryFn: () => fetchBookings(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'bookings',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  const rows = useMemo(() => query.data ?? [], [query.data])
  const filteredRows = useMemo(
    () => filterBookings(rows, filtersApi.filters),
    [rows, filtersApi.filters],
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.bookings.title}</h1>
      </header>
      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.bookings.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.bookings.loading}</p>
      ) : (
        <>
          <BookingsFilters
            bookings={rows}
            filtersApi={filtersApi}
            testIdPrefix="bookings-filters"
          />
          <BookingsTable
            rows={filteredRows}
            onRowClick={(row) => setActive(row)}
            onCustomerClick={(id) => setOpenCustomerId(id)}
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
