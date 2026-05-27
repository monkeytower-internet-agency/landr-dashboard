import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  parseBookingsFiltersFromUrl,
  serialiseBookingsFiltersToUrl,
  useBookingsFilters,
} from '@/lib/bookings-filters'
import { downloadCsv, todayStampUtc, type CsvColumn } from '@/lib/csv-export'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { formatCurrency } from '@/lib/reporting'
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
  const [searchParams, setSearchParams] = useSearchParams()

  // landr-j57l — primary filters round-trip through the URL. We capture
  // the initial URL state once via useState initializer so the filters
  // hook seeds from the deep-link (URL > localStorage on first mount).
  // Subsequent state changes are pushed back to the URL via the effect
  // below with { replace: true } so the back button stays useful.
  const [initialUrlFilters] = useState(() =>
    parseBookingsFiltersFromUrl(searchParams),
  )
  const [initialUrlQuery] = useState(
    () => searchParams.get('q')?.trim() ?? '',
  )
  const filtersApi = useBookingsFilters({ initialOverride: initialUrlFilters })
  // landr-j57l — `?q=` deep-links the global search input. Lifted out of
  // BookingsTable (where it used to live as internal state) so we can sync
  // it to the URL. The table accepts controlled globalFilter props now.
  const [globalQuery, setGlobalQuery] = useState<string>(initialUrlQuery)

  // landr-rcmy — debounced mirror of globalQuery used by the data fetch so
  // every keystroke doesn't hit Supabase. Highlighting + client-side
  // filtering still react instantly to globalQuery; only the network read
  // waits for the user to stop typing for 250ms. The mirror also starts
  // populated from initialUrlQuery so a `?q=…` deep-link issues a
  // single-shot search without an extra empty fetch first.
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initialUrlQuery)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(globalQuery.trim())
    }, 250)
    return () => window.clearTimeout(t)
  }, [globalQuery])

  const query = useRealtimeQuery<BookingRow[]>({
    // landr-rcmy — debouncedQuery is part of the key so a new search term
    // triggers a fresh server fetch (and TanStack can keep separate
    // cache entries per query — back/forward navigation feels instant).
    queryKey: ['bookings', currentOperatorId ?? 'none', debouncedQuery],
    queryFn: () =>
      fetchBookings(currentOperatorId as string, debouncedQuery || undefined),
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

  // landr-fnhz — topbar subtitle: filtered count + summed gross revenue.
  // Mirrors what the table is currently showing (post-filter), so the
  // operator sees the same shape as the rows below. Picks the first
  // booking's currency for the format (EUR-dominant in our market; if
  // the operator ever mixes currencies the format still reads sensibly).
  const titleSubtitle = useMemo(() => {
    const total = filteredRows.reduce((acc, r) => {
      const n = Number(r.gross_total)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
    const currency = filteredRows[0]?.currency || 'EUR'
    return t.bookings.subtitleSummary(
      filteredRows.length,
      formatCurrency(total, currency),
    )
  }, [filteredRows])

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

  // landr-j57l — state → URL sync. On every filter / search change push
  // the current state back to the URL with { replace: true } so the link
  // stays shareable without piling up history entries (mirrors the
  // landr-jzc0 Schedule pattern). Compare-before-write inside the
  // serialise helpers means a no-op render won't re-set the URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let dirty = serialiseBookingsFiltersToUrl(next, filtersApi.filters)
    const trimmedQuery = globalQuery.trim()
    if (trimmedQuery) {
      if (next.get('q') !== trimmedQuery) {
        next.set('q', trimmedQuery)
        dirty = true
      }
    } else if (next.has('q')) {
      next.delete('q')
      dirty = true
    }
    if (dirty) setSearchParams(next, { replace: true })
    // setSearchParams identity is unstable; including it would re-run the
    // effect after every write. Intentionally omitted — same pattern as
    // the `?open=` effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersApi.filters, globalQuery])

  // Stable callback for the controlled search input; keeps BookingsTable's
  // useCallback deps quiet.
  const handleGlobalQueryChange = useCallback((next: string) => {
    setGlobalQuery(next)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.bookings.title} subtitle={titleSubtitle} />
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
          {/* landr-sj2z — pass isLoading so the table can paint a skeleton
              placeholder during the first fetch instead of the old plain
              "Loading…" line. The EmptyState card only renders once the
              fetch settles AND zero rows came back. */}
          <BookingsTable
            rows={filteredRows}
            onRowClick={(row) => setActive(row)}
            onCustomerClick={(id) => setOpenCustomerId(id)}
            isLoading={query.isPending && !!currentOperatorId}
            globalFilter={globalQuery}
            onGlobalFilterChange={handleGlobalQueryChange}
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
