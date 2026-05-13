import { useState } from 'react'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { BookingsTable } from '@/components/BookingsTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchBookings, type BookingRow } from '@/lib/bookings'
import { useOperator } from '@/lib/operator'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

export function Bookings() {
  const { currentOperatorId } = useOperator()
  const [active, setActive] = useState<BookingRow | null>(null)

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

  const rows = query.data ?? []

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
        <BookingsTable rows={rows} onRowClick={(row) => setActive(row)} />
      )}
      <BookingDetailSheet
        row={active}
        onOpenChange={(open) => {
          if (!open) setActive(null)
        }}
      />
    </div>
  )
}
