import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarRangeIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  bulkSendReminder,
  customerDisplay,
  dateDisplay,
  earliestScheduledItem,
  earliestServiceDate,
  formatServiceDateRange,
  matchingServiceEnd,
  priceDisplay,
  productDisplay,
  stageCode,
  type BookingRow,
} from '@/lib/bookings'
import {
  downloadCsv,
  todayStampUtc,
  type CsvColumn,
} from '@/lib/csv-export'
import { BulkActionToolbar } from '@/components/BulkActionToolbar'
import { CustomerNameLink } from '@/components/CustomerNameLink'
import { DayChips } from '@/components/booking/DayChips'
import { SkeletonTableRows } from '@/components/SkeletonTableRows'
import { StageBadge } from '@/components/booking/StageBadge'
import { TagChipRow } from '@/components/tags/TagChip'
import { InlineEditCell } from '@/components/bookings/InlineEditCell'
import {
  decisionFromSelection,
  statusOptionsFor,
  useInlineEditBooking,
} from '@/lib/inline-edit-booking'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { t } from '@/lib/strings'
import { highlightMatch } from '@/lib/text-highlight'

type Props = {
  rows: BookingRow[]
  onRowClick: (row: BookingRow) => void
  onCustomerClick?: (contactId: string) => void
  // landr-sj2z — when true, render skeleton rows in place of the table
  // body. The route still owns the loading lifecycle (useQuery.isPending);
  // the table just paints a placeholder so the operator sees the chrome
  // immediately instead of a blank gap.
  isLoading?: boolean
}

// landr-lbbj — column schema used by the bulk-export action. Mirrors
// landr-xnpc's `bookingCsvColumns` in src/routes/Bookings.tsx so the bulk
// export and the top-right "Download CSV" produce byte-identical files
// for the same row set. If you change one, change the other.
const bulkExportColumns: CsvColumn<BookingRow>[] = [
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

export function BookingsTable({
  rows,
  onRowClick,
  onCustomerClick,
  isLoading = false,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])
  const [globalFilter, setGlobalFilter] = useState('')
  // landr-lbbj — bulk-select state. Set<id> keeps the selection compact
  // and lets us O(1) check from the header / row checkboxes.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // landr-vaob — disables the toolbar while bulkSendReminder is in flight.
  const [bulkBusy, setBulkBusy] = useState(false)
  // landr-f1s — respect the operator's time_format_24h preference for the
  // Created column.
  const { hour12 } = useOperatorCalendarPrefs()
  // landr-n2j2 — inline-edit cells need the operator-scoped query key so the
  // optimistic write + invalidation hits the same cache the page reads from.
  // Both ['bookings'] (this page) and ['views-bookings'] (saved Views) are
  // listed so a status / date flip stays consistent across surfaces.
  const { currentOperatorId } = useOperator()
  const opId = currentOperatorId ?? 'none'
  const inlineEdit = useInlineEditBooking({
    queryKeys: useMemo(
      () => [
        ['bookings', opId] as const,
        ['views-bookings', opId] as const,
      ],
      [opId],
    ),
  })

  const columns = useMemo<ColumnDef<BookingRow>[]>(
    () => [
      // landr-lbbj — leading select column (matches GeneralApprovals).
      {
        id: 'select',
        enableSorting: false,
        header: ({ table: t1 }) => {
          const visibleIds = t1
            .getRowModel()
            .rows.map((r) => (r.original as BookingRow).id)
          const allChecked =
            visibleIds.length > 0 &&
            visibleIds.every((id) => selectedIds.has(id))
          const someChecked = visibleIds.some((id) => selectedIds.has(id))
          return (
            <Checkbox
              checked={allChecked}
              ref={(el) => {
                if (el) el.indeterminate = !allChecked && someChecked
              }}
              onChange={(e) => {
                const next = new Set(selectedIds)
                if (e.currentTarget.checked) {
                  for (const id of visibleIds) next.add(id)
                } else {
                  for (const id of visibleIds) next.delete(id)
                }
                setSelectedIds(next)
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={t.bulkActions.selectAllAria}
              data-testid="bookings-select-all"
            />
          )
        },
        cell: ({ row }) => {
          const id = row.original.id
          const checked = selectedIds.has(id)
          return (
            <Checkbox
              checked={checked}
              onChange={(e) => {
                const next = new Set(selectedIds)
                if (e.currentTarget.checked) next.add(id)
                else next.delete(id)
                setSelectedIds(next)
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={t.bulkActions.selectRowAria(id)}
              data-testid={`bookings-select-${id}`}
            />
          )
        },
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: t.bookings.columnDate,
        cell: ({ row }) => dateDisplay(row.original.created_at, { hour12 }),
        sortingFn: 'datetime',
      },
      {
        // landr-04ec — sortable Service date column. Accessor returns the
        // booking's earliest item.date_range_start (or null when no item
        // is scheduled). Multi-item bookings with mixed dates use the MIN
        // — matches calendar/reporting semantics (earliestScheduledItem
        // in lib/bookings.ts and bookingsToCalendarEvents).
        // landr-n2j2 — clicking the cell opens a native date input that
        // PATCHes the EARLIEST scheduled item's date_range_start (and
        // collapses date_range_end onto it for single-day bookings). This
        // mirrors the calendar drag pattern. Bookings with NO scheduled
        // item render as read-only "—" — there's no line to PATCH.
        id: 'service_date',
        accessorFn: (row) => earliestServiceDate(row),
        sortUndefined: 'last',
        header: t.bookings.columnServiceDate,
        cell: ({ row }) => {
          const item = earliestScheduledItem(row.original)
          if (!item || !item.date_range_start) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          const start = item.date_range_start
          const end = matchingServiceEnd(row.original, start)
          const display = (
            <span className="whitespace-nowrap">
              {formatServiceDateRange(start, end)}
            </span>
          )
          return (
            <InlineEditCell
              kind="date"
              value={start}
              ariaLabel={t.bookings.inlineEdit.startDateAria}
              display={display}
              testId={`bookings-cell-service-date-${row.original.id}`}
              onCommit={(next) => {
                if (!next) return
                // Keep date_range_end pinned to start when it was a single-
                // day booking; preserve the relative end when it was a
                // range (shift by the same delta).
                let nextEnd: string | null = end
                if (end && end !== start) {
                  // Multi-day range — shift the end by the same number of
                  // calendar days the start moved.
                  const startMs = Date.parse(`${start}T00:00:00Z`)
                  const endMs = Date.parse(`${end}T00:00:00Z`)
                  const nextStartMs = Date.parse(`${next}T00:00:00Z`)
                  if (
                    Number.isFinite(startMs) &&
                    Number.isFinite(endMs) &&
                    Number.isFinite(nextStartMs)
                  ) {
                    const deltaMs = endMs - startMs
                    const nextEndDate = new Date(nextStartMs + deltaMs)
                    nextEnd = nextEndDate.toISOString().slice(0, 10)
                  }
                } else {
                  // Single-day — keep end pinned to the new start (most
                  // bookings in fixtures have end === start).
                  nextEnd = next
                }
                inlineEdit.rescheduleEarliestItem({
                  bookingId: row.original.id,
                  itemId: item.id,
                  previousStart: start,
                  previousEnd: end,
                  newStart: next,
                  newEnd: nextEnd,
                })
              }}
            />
          )
        },
      },
      {
        id: 'customer',
        header: t.bookings.columnCustomer,
        accessorFn: (row) => customerDisplay(row),
        cell: ({ row, getValue }) => {
          const display = getValue<string>()
          const contactId = row.original.customer?.id
          if (onCustomerClick && contactId) {
            return (
              <CustomerNameLink
                contactId={contactId}
                display={display}
                displayNode={highlightMatch(display, globalFilter)}
                onClick={onCustomerClick}
              />
            )
          }
          return (
            <span className="truncate">
              {highlightMatch(display, globalFilter)}
            </span>
          )
        },
      },
      {
        id: 'product',
        header: t.bookings.columnProduct,
        accessorFn: (row) => productDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate">
            {highlightMatch(getValue<string>(), globalFilter)}
          </span>
        ),
      },
      {
        id: 'days',
        header: t.bookings.columnDays,
        enableSorting: false,
        cell: ({ row }) => {
          const days = row.original.items.flatMap(
            (it) => it.selected_days ?? [],
          )
          if (days.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return <DayChips days={days} />
        },
      },
      {
        // landr-iz58 — operator-applied tag chips. Truncated at 2 + "+N more"
        // so list rows stay compact. Filter / sort intentionally off — the
        // tag dimension uses ViewFilterChips (filter type 'tag') instead.
        id: 'tags',
        header: t.bookings.columnTags,
        enableSorting: false,
        cell: ({ row }) => <TagChipRow tags={row.original.tags ?? []} />,
      },
      {
        // landr-n2j2 — inline-edit status dropdown. Scoped to the approval
        // transitions FastAPI exposes today (general / hotel awaiting
        // stages → approve/reject). Bookings in any other stage render as
        // a plain StageBadge (read-only) until a dedicated set-stage
        // endpoint ships (follow-up bd ticket).
        id: 'status',
        accessorKey: 'current_semantic_state',
        header: t.bookings.columnStatus,
        cell: ({ row }) => {
          const code = stageCode(row.original)
          const badge = (
            <StageBadge
              state={row.original.current_semantic_state}
              stageCode={code}
            />
          )
          const options = statusOptionsFor(row.original)
          if (options.length === 0) {
            return badge
          }
          return (
            <InlineEditCell
              kind="select"
              value="noop"
              options={options}
              ariaLabel={t.bookings.inlineEdit.statusAria(
                row.original.current_semantic_state,
              )}
              display={badge}
              testId={`bookings-cell-status-${row.original.id}`}
              onCommit={(selection) => {
                const decision = decisionFromSelection(code, selection)
                if (!decision) return
                inlineEdit.applyApprovalDecision({
                  bookingId: row.original.id,
                  decision,
                  fromStage: code as string,
                })
              }}
            />
          )
        },
      },
      {
        id: 'price',
        header: t.bookings.columnPrice,
        accessorFn: (row) => Number(row.gross_total) || 0,
        cell: ({ row }) => (
          <span className="font-medium">{priceDisplay(row.original)}</span>
        ),
      },
    ],
    [onCustomerClick, hour12, selectedIds, globalFilter, inlineEdit],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  })

  // landr-lbbj — bulk-action handlers. Bookings page has no approve/
  // reject context (those live on the Approvals queue) so we only
  // surface export-csv + send-reminder here.
  function runBulkExportCsv(ids: string[]): void {
    const subset = rows.filter((r) => ids.includes(r.id))
    downloadCsv(`bookings-${todayStampUtc()}.csv`, subset, bulkExportColumns)
    toast.success(t.bulkActions.toastExported(subset.length))
    setSelectedIds(new Set())
  }

  // landr-vaob — bulk send-reminder wired to the real endpoint
  // (POST /api/staff/operators/{op}/bookings/bulk-reminder, landr-s0wo).
  // Mirrors GeneralApprovals.runBulkSendReminder so the two surfaces
  // share toast semantics: full success / partial / total failure.
  async function runBulkSendReminder(ids: string[]): Promise<void> {
    if (!currentOperatorId) return
    setBulkBusy(true)
    try {
      const { sent, failed } = await bulkSendReminder(currentOperatorId, ids)
      setSelectedIds(new Set())
      if (failed.length === 0) {
        toast.success(t.bulkActions.toastReminderSent(sent))
      } else if (sent > 0) {
        toast.warning(t.bulkActions.toastReminderPartial(sent, failed.length))
      } else {
        toast.error(t.bulkActions.toastError)
      }
    } catch (err) {
      toast.error(t.bulkActions.toastError, {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setBulkBusy(false)
    }
  }

  // landr-s1mr / landr-sj2z — When there are zero bookings at all AND we
  // are NOT mid-fetch, show the friendly empty-state card. During the
  // initial loading window we fall through so the skeleton placeholder
  // takes over (see TableBody below) — preventing an "empty state flash"
  // before the first rows land.
  if (rows.length === 0 && !isLoading) {
    return (
      <EmptyState
        icon={CalendarRangeIcon}
        title={t.emptyStates.bookings.title}
        description={t.emptyStates.bookings.description}
        data-testid="bookings-empty-state"
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={t.bookings.filterPlaceholder}
          className="max-w-sm"
          aria-label={t.bookings.filterPlaceholder}
        />
        <div className="text-muted-foreground text-sm">
          {table.getFilteredRowModel().rows.length} / {rows.length}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const dir = header.column.getIsSorted()
                  const Icon = !dir
                    ? ArrowUpDown
                    : dir === 'asc'
                      ? ArrowUp
                      : ArrowDown
                  return (
                    <TableHead key={header.id}>
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="hover:text-foreground inline-flex cursor-pointer items-center gap-1"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <Icon className="size-3 opacity-60" />
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // landr-sj2z — pulsing skeleton placeholder while the first
              // fetch is still in flight. Column count matches the live
              // table so the eventual rows land in the same grid.
              <SkeletonTableRows
                count={6}
                columnCount={columns.length}
                data-testid="bookings-skeleton"
              />
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {t.bookings.empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick(row.original)}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <span className="text-muted-foreground text-sm">
          {table.getState().pagination.pageIndex + 1} /{' '}
          {Math.max(1, table.getPageCount())}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>

      <BulkActionToolbar
        selectedIds={[...selectedIds]}
        onClear={() => setSelectedIds(new Set())}
        actions={['exportCsv', 'sendReminder']}
        onExportCsv={(ids) => runBulkExportCsv(ids)}
        onSendReminder={(ids) => runBulkSendReminder(ids)}
        busy={bulkBusy}
        testIdPrefix="bookings-bulk-toolbar"
      />
    </div>
  )
}
