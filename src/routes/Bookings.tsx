import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DownloadIcon } from 'lucide-react'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { BookingsTable } from '@/components/BookingsTable'
import { BookingsFilters } from '@/components/bookings/BookingsFilters'
import { QuickFilterStrip } from '@/components/bookings/QuickFilterStrip'
import { CustomerDetailSheet } from '@/components/CustomerDetailSheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  customerDisplay,
  earliestServiceDate,
  fetchBookings,
  productDisplay,
  type BookingRow,
} from '@/lib/bookings'
import { filterBookings } from '@/lib/bookings-filter-match'
import { useBookingsFilters } from '@/lib/bookings-filters'
import { downloadCsv, todayStampUtc, type CsvColumn } from '@/lib/csv-export'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

// landr-xnpc — CSV column set for the Bookings list export. Defined at
// module scope so we don't reallocate it on every render; the accessors
// are pure so this is safe.
const bookingCsvColumns: CsvColumn<BookingRow>[] = [
  { header: 'Booking ID', value: (r) => r.id },
  { header: 'Booked on', value: (r) => r.created_at },
  { header: 'Service date', value: (r) => earliestServiceDate(r) ?? '' },
  { header: 'Customer', value: (r) => customerDisplay(r) },
  { header: 'Email', value: (r) => r.customer?.email ?? '' },
  { header: 'Phone', value: (r) => r.customer?.phone ?? '' },
  { header: 'Product', value: (r) => productDisplay(r) },
  { header: 'Status', value: (r) => r.current_semantic_state },
  { header: 'Stage', value: (r) => r.current_stage?.code ?? '' },
  {
    header: 'Gross total',
    value: (r) => {
      const n = Number(r.gross_total)
      return Number.isFinite(n) ? n.toFixed(2) : ''
    },
  },
  { header: 'Currency', value: (r) => r.currency || 'EUR' },
]

export function Bookings() {
  const { currentOperatorId } = useOperator()
  const [active, setActive] = useState<BookingRow | null>(null)
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null)
  const filtersApi = useBookingsFilters()
  const [searchParams, setSearchParams] = useSearchParams()

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

  // landr-xnpc — export the CURRENT FILTERED view. Column set mirrors the
  // on-screen table so the file is recognisable next to the UI.
  function onExportCsv() {
    downloadCsv(
      `bookings-${todayStampUtc()}.csv`,
      filteredRows,
      bookingCsvColumns,
    )
  }

  // landr-ne58 — `?open=<bookingId>` deep-links into the sheet, used by the
  // sidebar Recently-viewed list (bookings have no detail URL). Resolve
  // once the fetch lands; if the id no longer matches a row (deleted,
  // wrong operator) we silently drop the param. We strip the param after
  // opening so the URL is stable for the back button.
  //
  // The set-state-in-effect lint rule warns against this pattern in
  // general, but URL-param → local-state synchronisation is one of the
  // known exceptions (mirrors how createBrowserRouter loaders bridge URL
  // state into component state). The effect runs at most once per
  // (openId, fetched-rows) pair.
  const openId = searchParams.get('open')
  useEffect(() => {
    if (!openId) return
    if (!query.data) return
    const match = rows.find((r) => r.id === openId) ?? null
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(match)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('open')
    setSearchParams(next, { replace: true })
    // setSearchParams is stable for the URL state but its identity is not;
    // intentionally NOT included as a dep to avoid an infinite re-run loop
    // after we strip the param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, query.data, rows])

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.bookings.title} />
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.bookings.title}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={onExportCsv}
          disabled={filteredRows.length === 0}
          aria-label={t.bookings.exportCsvAria(filteredRows.length)}
          data-testid="bookings-export-csv"
        >
          <DownloadIcon className="size-4" />
          {t.bookings.exportCsv}
        </Button>
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
          {/* landr-68a9 — pill strip lives ABOVE the dropdown filter bar
              so the operator hits common windows in one click. Clicking a
              preset replaces the chip state; the dropdowns below still
              work for finer-grained selections. */}
          <QuickFilterStrip filtersApi={filtersApi} />
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
