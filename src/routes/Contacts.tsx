import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DownloadIcon } from 'lucide-react'
import { ContactAuditSheet } from '@/components/ContactAuditSheet'
import { ContactsFilters } from '@/components/contacts/ContactsFilters'
import { SegmentChips } from '@/components/contacts/SegmentChips'
import { ContactsTable } from '@/components/ContactsTable'
import { CustomerDetailSheet } from '@/components/CustomerDetailSheet'
import { GdprEraseDialog } from '@/components/GdprEraseDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  contactIsErased,
  contactNameDisplay,
  fetchContacts,
  fetchContactTypeCounts,
  fetchUpcomingBookingsByContact,
  mergeNextBookingDates,
  todayIsoDate,
  type ContactRow,
} from '@/lib/contacts'
import {
  matchesBookingWindowFilter,
  parseContactsFiltersFromUrl,
  serialiseContactsFiltersToUrl,
  useContactsFilters,
} from '@/lib/contacts-filters'
import {
  compareNextBookingAsc,
  isClientSideSort,
  parseContactsSortFromUrl,
  serialiseContactsSortToUrl,
  useContactsSort,
} from '@/lib/contacts-sort'
import { downloadCsv, todayStampUtc, type CsvColumn } from '@/lib/csv-export'
import { useOperator } from '@/lib/operator'
import { filterByTagIds } from '@/lib/segments'
import { PageTitle } from '@/lib/page-title'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

// landr-xnpc — CSV column set for the Contacts list export. Defined at
// module scope so it's stable across renders. Status mirrors what the
// table shows (Active / Erased) rather than dumping raw timestamps.
const contactCsvColumns: CsvColumn<ContactRow>[] = [
  { header: 'Contact ID', value: (r) => r.id },
  { header: 'Name', value: (r) => contactNameDisplay(r) },
  { header: 'First name', value: (r) => r.first_name ?? '' },
  { header: 'Last name', value: (r) => r.last_name ?? '' },
  { header: 'Email', value: (r) => r.email ?? '' },
  { header: 'Phone', value: (r) => r.phone ?? '' },
  { header: 'Preferred locale', value: (r) => r.preferred_locale ?? '' },
  { header: 'Types', value: (r) => (r.types ?? []).join('|') },
  { header: 'Created', value: (r) => r.created_at },
  { header: 'Updated', value: (r) => r.updated_at },
  {
    header: 'Status',
    value: (r) => (contactIsErased(r) ? 'erased' : 'active'),
  },
]

export function Contacts() {
  const { currentOperatorId } = useOperator()
  const [editContactId, setEditContactId] = useState<string | null>(null)
  const [eraseTarget, setEraseTarget] = useState<ContactRow | null>(null)
  const [auditTarget, setAuditTarget] = useState<ContactRow | null>(null)

  // landr-pqk — sort + type filter are per-user, persisted in localStorage.
  // The query key embeds both so a change re-runs the fetch with the new
  // ORDER BY / overlap filter at the API layer.
  // landr-dp45 — `includeErased` is also part of the key so flipping the
  // "Show erased contacts" toggle re-runs the fetch with/without the
  // `gdpr_erased_at IS NULL` filter.
  //
  // landr-j57l — URL deep-link parses (?type=…&erased=…&sort=…&q=…) are
  // captured once via useState initializer and passed into the hooks as
  // `initialOverride`. URL > localStorage on first mount; subsequent state
  // changes push back to the URL via the effect below ({ replace: true }).
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialUrlFilters] = useState(() =>
    parseContactsFiltersFromUrl(searchParams),
  )
  const [initialUrlSort] = useState(() =>
    parseContactsSortFromUrl(searchParams),
  )
  const [initialUrlQuery] = useState(
    () => searchParams.get('q')?.trim() ?? '',
  )
  const sortApi = useContactsSort({ initialOverride: initialUrlSort })
  const filtersApi = useContactsFilters({ initialOverride: initialUrlFilters })
  const { sort } = sortApi
  const { filters } = filtersApi
  const typesKey = filters.types.slice().sort().join(',') || 'all'

  // landr-j57l — `?q=` deep-links the global search input. Controlled by
  // the route so the value can sync to the URL; ContactsTable accepts
  // controlled globalFilter props now.
  const [globalQuery, setGlobalQuery] = useState<string>(initialUrlQuery)
  const handleGlobalQueryChange = useCallback((next: string) => {
    setGlobalQuery(next)
  }, [])

  const query = useRealtimeQuery<ContactRow[]>({
    queryKey: [
      'contacts',
      currentOperatorId ?? 'none',
      sort,
      typesKey,
      filters.includeErased ? 'with-erased' : 'no-erased',
    ],
    queryFn: () =>
      fetchContacts(currentOperatorId as string, {
        sort,
        types: filters.types,
        includeErased: filters.includeErased,
      }),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'contacts',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  // landr-knz3 — per-type counts for the chip badges. Separate from the
  // main list query because the counts are independent of the selected
  // filter (they always reflect the operator-wide totals). The default
  // (excludes GDPR-erased + soft-deleted) matches the visible list.
  const countsQuery = useQuery({
    queryKey: ['contact-type-counts', currentOperatorId ?? 'none', false],
    queryFn: () =>
      fetchContactTypeCounts(currentOperatorId as string, {
        includeErased: false,
      }),
    enabled: !!currentOperatorId,
    staleTime: 30_000,
  })

  // landr-6993 — parallel query for the upcoming-bookings join. Operator-
  // scoped, returns a Map<contactId, earliestDate>. We anchor `today` to
  // the local-clock day once per mount so the query key stays stable
  // across re-renders (otherwise every render would invalidate the cache).
  // Subscribes to the bookings table via useRealtimeQuery so a new /
  // cancelled / rescheduled booking nudges the icons + chip counts
  // without waiting for the staleTime to expire.
  const [today] = useState(() => todayIsoDate())
  const upcomingQuery = useRealtimeQuery<Map<string, string>>({
    queryKey: ['contacts-upcoming-bookings', currentOperatorId ?? 'none', today],
    queryFn: () =>
      fetchUpcomingBookingsByContact(currentOperatorId as string, { today }),
    enabled: !!currentOperatorId,
    staleTime: 60_000,
    realtime: currentOperatorId
      ? {
          table: 'bookings',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  // landr-6993 — derive per-window counts from the upcoming-bookings map
  // so the chip badges show how many contacts each chip will surface.
  // Counts reflect the operator-wide totals (not the current type / tag
  // filter), matching the per-type-counts behaviour from landr-knz3.
  const bookingWindowCounts = useMemo(() => {
    const out = { today: 0, future: 0 }
    const map = upcomingQuery.data
    if (!map) return out
    for (const d of map.values()) {
      if (d === today) out.today += 1
      else if (d > today) out.future += 1
    }
    return out
  }, [upcomingQuery.data, today])

  // landr-panu — ad-hoc tag filter (AND-of-tag-ids). Lifted here so the
  // SegmentChips bar can drive the table's visible row set. Sort + types
  // + includeErased still go through the server (via the query key); the
  // tag filter is applied client-side because tags live on a JOIN embed
  // we already fetch. Empty selection short-circuits to identity in
  // filterByTagIds, so the case-zero render path is unchanged.
  //
  // Note: we feed `query.data` directly into the useMemo (instead of
  // aliasing as `fetched` first) so the dep is the query reference itself
  // — same identity stability TanStack Query guarantees — keeping the
  // react-hooks/exhaustive-deps linter happy without a second useMemo.
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const rows = useMemo(() => {
    // landr-6993 — merge in each contact's next_booking_date (parallel
    // query result) BEFORE the tag / booking-window / sort passes so the
    // window filter + next_booking_asc sort have data to operate on.
    // mergeNextBookingDates is null-safe — when upcomingQuery hasn't
    // resolved yet we get a row set with next_booking_date: null on
    // every entry, which means the chip filter behaves consistently
    // (no rows pass during the loading window — same UX as the type
    // filter while the list is loading).
    const base = filterByTagIds(query.data ?? [], selectedTagIds)
    const withDates = mergeNextBookingDates(
      base,
      upcomingQuery.data ?? new Map<string, string>(),
    )
    // Booking-window chip filter — empty selection passes-through.
    const filtered = withDates.filter((row) =>
      matchesBookingWindowFilter(
        row.next_booking_date,
        filters.bookingWindows,
        today,
      ),
    )
    // landr-6993 — next_booking_asc is applied client-side because
    // next_booking_date is derived from the parallel query. Every other
    // sort mode stays on the server-side ORDER BY in fetchContacts.
    if (isClientSideSort(sort)) {
      const sorted = filtered.slice().sort(compareNextBookingAsc)
      return sorted
    }
    return filtered
  }, [
    query.data,
    selectedTagIds,
    upcomingQuery.data,
    filters.bookingWindows,
    today,
    sort,
  ])

  // landr-xnpc — CSV export mirrors the visible rows so the operator
  // gets exactly what's on screen (incl. the segment / tag filter pass).
  function onExportCsv() {
    downloadCsv(
      `contacts-${todayStampUtc()}.csv`,
      rows,
      contactCsvColumns,
    )
  }

  // landr-ne58 — `?open=<contactId>` deep-links into the CustomerDetailSheet,
  // used by the sidebar Recently-viewed list (contacts have no detail URL).
  // The sheet itself loads the row by id so we don't need to wait for the
  // list query — opening eagerly keeps the click-to-open feel snappy. We
  // strip the param after opening to keep the URL stable.
  //
  // URL-param → local-state sync is one of the documented exceptions to
  // the set-state-in-effect rule; see the matching comment in Bookings.tsx.
  // (searchParams/setSearchParams are declared at the top of the component
  // now — landr-j57l also needs them for filter URL round-tripping.)
  const openContactId = searchParams.get('open')
  useEffect(() => {
    if (!openContactId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditContactId(openContactId)
    const next = new URLSearchParams(searchParams)
    next.delete('open')
    setSearchParams(next, { replace: true })
    // setSearchParams identity intentionally excluded — see Bookings.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openContactId])

  // landr-j57l — state → URL sync. Mirrors the Bookings effect: on every
  // change of filters / sort / search push the merged params back to the
  // URL with { replace: true } so the link is bookmarkable without piling
  // up history entries. Compare-before-write inside the serialise helpers
  // means no-op renders don't re-trigger the router.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let dirty = serialiseContactsFiltersToUrl(next, filters)
    if (serialiseContactsSortToUrl(next, sort)) dirty = true
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
    // setSearchParams identity intentionally excluded; same pattern as
    // the `?open=` effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, globalQuery])

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t.contacts.title}
        subtitle={t.contacts.subtitleCount(rows.length)}
      />
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.contacts.title}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={onExportCsv}
          disabled={rows.length === 0}
          aria-label={t.contacts.exportCsvAria(rows.length)}
          data-testid="contacts-export-csv"
        >
          <DownloadIcon className="size-4" />
          {t.contacts.exportCsv}
        </Button>
      </header>
      <ContactsFilters
        sortApi={sortApi}
        filtersApi={filtersApi}
        typeCounts={countsQuery.data}
        bookingWindowCounts={bookingWindowCounts}
      />
      {/* landr-panu — saved customer segments (tag-AND quick filters)
          between the primary filter bar and the table so the operator
          sees both axes (type + segment) at once. */}
      <SegmentChips
        operatorId={currentOperatorId}
        selectedTagIds={selectedTagIds}
        onSelectedTagIdsChange={setSelectedTagIds}
      />
      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.contacts.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : (
        /* landr-sj2z — pass isLoading so the table paints a skeleton
           placeholder during the first fetch. The route no longer renders
           the old "Loading…" line; the skeleton communicates the same
           thing more clearly while keeping the table chrome stable. */
        <ContactsTable
          rows={rows}
          onEdit={(row) => setEditContactId(row.id)}
          onErase={(row) => setEraseTarget(row)}
          onAudit={(row) => setAuditTarget(row)}
          isLoading={query.isPending && !!currentOperatorId}
          globalFilter={globalQuery}
          onGlobalFilterChange={handleGlobalQueryChange}
        />
      )}
      <CustomerDetailSheet
        contactId={editContactId}
        onOpenChange={(open) => {
          if (!open) setEditContactId(null)
        }}
      />
      <GdprEraseDialog
        contact={eraseTarget}
        onOpenChange={(open) => {
          if (!open) setEraseTarget(null)
        }}
      />
      <ContactAuditSheet
        contact={auditTarget}
        onOpenChange={(open) => {
          if (!open) setAuditTarget(null)
        }}
      />
    </div>
  )
}
