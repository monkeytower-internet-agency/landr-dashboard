import { useCallback, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { CalendarRangeIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTable } from '@/components/DataTable'
import { selectColumn } from '@/components/data-table-select'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  bulkSendReminder,
  customerDisplay,
  dateDisplay,
  earliestScheduledItem,
  earliestServiceDate,
  effectiveGrossOf,
  formatServiceDateRange,
  hasPriceOverride,
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
import { BookingRowContextMenu } from '@/components/bookings/BookingRowContextMenu'
import { CustomerNameLink } from '@/components/CustomerNameLink'
import { DayChips } from '@/components/booking/DayChips'
import { StageBadge } from '@/components/booking/StageBadge'
import { TagChipRow } from '@/components/tags/TagChip'
import { InlineEditCell } from '@/components/bookings/InlineEditCell'
import {
  decisionFromSelection,
  statusOptionsFor,
  useInlineEditBooking,
} from '@/lib/inline-edit-booking'
import { bulkApplyTagsToBookings } from '@/lib/tags'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { t } from '@/lib/strings'
import { highlightMatch } from '@/lib/text-highlight'
import { useListKeyboardNav } from '@/lib/use-list-keyboard-nav'

type Props = {
  rows: BookingRow[]
  onRowClick: (row: BookingRow) => void
  onCustomerClick?: (contactId: string) => void
  // landr-sj2z — when true, render skeleton rows in place of the table
  // body. The route still owns the loading lifecycle (useQuery.isPending);
  // the table just paints a placeholder so the operator sees the chrome
  // immediately instead of a blank gap.
  isLoading?: boolean
  /**
   * landr-j57l — when both are passed, the global search input becomes
   * controlled by the parent so it can persist to the URL (`?q=…`).
   * Omitting them keeps the legacy uncontrolled behaviour for any callers
   * that don't need URL round-tripping (calendar embeds, future surfaces).
   */
  globalFilter?: string
  onGlobalFilterChange?: (next: string) => void
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
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])
  // landr-j57l — controlled-or-uncontrolled global search. When the parent
  // passes both props the input is fully controlled (Bookings.tsx uses
  // this to sync to ?q=); otherwise we fall back to internal state.
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('')
  const isGlobalFilterControlled = controlledGlobalFilter !== undefined
  const globalFilter = isGlobalFilterControlled
    ? controlledGlobalFilter
    : internalGlobalFilter
  const setGlobalFilter = useCallback(
    (next: string) => {
      if (isGlobalFilterControlled) {
        onGlobalFilterChange?.(next)
      } else {
        setInternalGlobalFilter(next)
      }
    },
    [isGlobalFilterControlled, onGlobalFilterChange],
  )
  // landr-lbbj — bulk-select state. Set<id> keeps the selection compact
  // and lets us O(1) check from the header / row checkboxes.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // landr-puix — price-override dialog state. The inline-edit price cell
  // captures the new gross_total from the numeric editor, then asks the
  // operator for a required reason via the dialog before firing the
  // server write. Holding the prospective value here (instead of
  // per-row state) keeps the BookingsTable column memo stable.
  const [pricePrompt, setPricePrompt] = useState<{
    bookingId: string
    previousGross: number | string | null | undefined
    newGross: number
  } | null>(null)
  const [priceReason, setPriceReason] = useState<string>('')
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
      // landr-lbbj / landr-3qkr.2 — leading select column via the shared
      // selectColumn factory (matches ContactsTable + GeneralApprovals).
      selectColumn<BookingRow>({
        selectedIds,
        setSelectedIds,
        testIdPrefix: 'bookings',
      }),
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
        // The service date is a RANGE (start–end, possibly multi-day), so a
        // single-date inline editor here is misleading. The cell is now a
        // plain read-only display: clicking it bubbles to the row click
        // (onRowClick → BookingDetailSheet), matching the booked-on (Created)
        // and Product cells, where the operator edits the dates properly via
        // the slide-in detail panel.
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
          return (
            <span
              className="whitespace-nowrap"
              data-testid={`bookings-cell-service-date-${row.original.id}`}
            >
              {formatServiceDateRange(start, end, { hour12 })}
            </span>
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
        // landr-puix — inline-edit price cell. The numeric editor commits
        // the prospective gross_total to local state and pops the
        // reason-required dialog below; the dialog's Confirm fires the
        // server write through inlineEdit.overridePrice. Overridden rows
        // render italic + amber to flag the manual deviation from the
        // engine-computed price.
        id: 'price',
        header: t.bookings.columnPrice,
        // Sort + filter against the effective (override-aware) value so
        // BookingsTable.sort-by-price respects the operator's adjustment.
        accessorFn: (row) => effectiveGrossOf(row) || 0,
        cell: ({ row }) => {
          const r = row.original
          const overridden = hasPriceOverride(r)
          const formatted = priceDisplay(r)
          const display = (
            <span
              className={cn(
                'font-medium',
                overridden && 'text-amber-700 italic',
              )}
              title={
                overridden ? t.bookings.inlineEdit.priceOverrideTooltip : undefined
              }
              data-testid={`bookings-cell-price-${r.id}`}
            >
              {formatted}
            </span>
          )
          // Initial editor value = the current effective gross with two
          // decimal places. If neither parses, fall back to empty.
          const eff = effectiveGrossOf(r)
          const initial = Number.isFinite(eff) ? eff.toFixed(2) : ''
          return (
            <InlineEditCell
              kind="number"
              value={initial}
              ariaLabel={t.bookings.inlineEdit.priceAria(formatted)}
              display={display}
              testId={`bookings-cell-price-${r.id}`}
              onCommit={(next) => {
                const parsed = Number(next)
                if (!Number.isFinite(parsed) || parsed < 0) {
                  toast.error(t.bookings.inlineEdit.priceUpdateError, {
                    description: t.bookings.inlineEdit.priceInvalidValue,
                  })
                  return
                }
                // No-op if the value didn't change; InlineEditCell's
                // commit already short-circuits identical strings, but
                // we also guard the parsed value here for parity with
                // overridden-then-re-typed cases.
                if (parsed === eff) return
                setPricePrompt({
                  bookingId: r.id,
                  previousGross: r.override_gross_total ?? r.gross_total,
                  newGross: parsed,
                })
                setPriceReason('')
              }}
            />
          )
        },
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

  // landr-euta — vim-style j/k row navigation. The hook owns the
  // window-level keydown listener; we pass it the post-pagination row
  // count and wire Enter → onRowClick + x → toggle bulk-select on the
  // focused row. Toggle re-uses the same Set<id> state the checkbox
  // column writes to, so 'x' and a checkbox click stay in lock-step.
  const visibleRows = table.getRowModel().rows
  const nav = useListKeyboardNav({
    rowCount: visibleRows.length,
    onOpen: (index) => {
      const row = visibleRows[index]
      if (row) onRowClick(row.original)
    },
    onToggleSelect: (index) => {
      const row = visibleRows[index]
      if (!row) return
      const id = row.original.id
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
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

  // landr-uqr2 — bulk-apply tags. Reads each selected row's current tag
  // ids off the in-memory row set and POSTs the UNION (current ∪ chosen)
  // via setBookingTags per row. Promise.allSettled handles partial
  // failures — at least one success keeps the picker closed and toasts
  // a warning with the fail count.
  async function runBulkApplyTags(
    ids: string[],
    tagIds: string[],
  ): Promise<void> {
    if (!currentOperatorId || tagIds.length === 0 || ids.length === 0) return
    setBulkBusy(true)
    try {
      const items = ids.map((id) => {
        const row = rows.find((r) => r.id === id)
        return {
          id,
          currentTagIds: (row?.tags ?? []).map((t) => t.id),
        }
      })
      const { ok, failed } = await bulkApplyTagsToBookings(
        currentOperatorId,
        items,
        tagIds,
      )
      setSelectedIds(new Set())
      if (failed.length === 0) {
        toast.success(t.bulkActions.toastTagsApplied(ok, tagIds.length))
      } else if (ok > 0) {
        toast.warning(t.bulkActions.toastTagsPartial(ok, failed.length))
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

  // landr-3qkr.2 — mobile card: select checkbox (bulk actions exist here)
  // + customer (key field) + product + service date + status badge + price.
  // Tapping the card body opens the detail sheet (the row's primary
  // action); the inline-edit price/status cells stay desktop-only.
  const renderCard = (row: Row<BookingRow>) => {
    const booking = row.original
    const checked = selectedIds.has(booking.id)
    const item = earliestScheduledItem(booking)
    const serviceDate =
      item && item.date_range_start
        ? formatServiceDateRange(
            item.date_range_start,
            matchingServiceEnd(booking, item.date_range_start),
            { hour12 },
          )
        : null
    const overridden = hasPriceOverride(booking)
    return (
      <div className="bg-card flex flex-col gap-2 rounded-lg border p-3 shadow-s">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={checked}
            onChange={(e) => {
              const next = new Set(selectedIds)
              if (e.currentTarget.checked) next.add(booking.id)
              else next.delete(booking.id)
              setSelectedIds(next)
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={t.bulkActions.selectRowAria(booking.id)}
            data-testid={`bookings-card-select-${booking.id}`}
            className="mt-1 size-5"
          />
          <button
            type="button"
            onClick={() => onRowClick(booking)}
            className="min-w-0 flex-1 text-left"
            data-testid={`bookings-card-${booking.id}`}
          >
            <span className="block truncate font-medium">
              {highlightMatch(customerDisplay(booking), globalFilter)}
            </span>
            <span className="text-muted-foreground block truncate text-sm">
              {highlightMatch(productDisplay(booking), globalFilter)}
            </span>
          </button>
          <StageBadge
            state={booking.current_semantic_state}
            stageCode={stageCode(booking)}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            {serviceDate ?? '—'}
          </span>
          <span
            className={cn('font-medium', overridden && 'text-amber-700 italic')}
          >
            {priceDisplay(booking)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={t.bookings.empty}
        isLoading={isLoading}
        skeletonTestId="bookings-skeleton"
        search={{
          value: globalFilter,
          onChange: setGlobalFilter,
          placeholder: t.bookings.filterPlaceholder,
        }}
        matchCountNode={`${table.getFilteredRowModel().rows.length} / ${rows.length}`}
        onRowClick={(row) => onRowClick(row.original)}
        rowTestId={(row) => `bookings-row-${row.original.id}`}
        rowProps={(_row, index) => nav.getRowProps(index)}
        renderCard={renderCard}
        rowWrapper={(row, rowNode) => (
          // landr-oxlk — right-click → quick actions. The trigger wraps the
          // row/card via asChild so left-click → open sheet, j/k focus, and
          // the testid stay unchanged.
          <BookingRowContextMenu
            key={row.id}
            row={row.original}
            operatorId={currentOperatorId ?? null}
            onOpenDetail={(r) => onRowClick(r)}
            copyLinkPath={(r) => `/bookings?open=${r.id}`}
          >
            {rowNode}
          </BookingRowContextMenu>
        )}
      />

      <BulkActionToolbar
        selectedIds={[...selectedIds]}
        onClear={() => setSelectedIds(new Set())}
        actions={['tag', 'exportCsv', 'sendReminder']}
        onExportCsv={(ids) => runBulkExportCsv(ids)}
        onSendReminder={(ids) => runBulkSendReminder(ids)}
        onApplyTags={(ids, tagIds) => runBulkApplyTags(ids, tagIds)}
        operatorId={currentOperatorId ?? undefined}
        busy={bulkBusy}
        testIdPrefix="bookings-bulk-toolbar"
      />

      {/* landr-puix — price-override confirmation dialog. The numeric
          cell editor captures the prospective gross_total and pops this
          dialog to collect the required reason. Confirm fires the
          server write through inlineEdit.overridePrice (operator-scoped
          POST). The dialog opens only when pricePrompt is non-null;
          clearing it on close releases the prompt + draft reason. */}
      <AlertDialog
        open={pricePrompt !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPricePrompt(null)
            setPriceReason('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.bookings.inlineEdit.priceDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.bookings.inlineEdit.priceDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-price-override-amount">
                {t.bookings.inlineEdit.priceNewAmountLabel}
              </Label>
              <Input
                id="bk-price-override-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={
                  pricePrompt
                    ? Number.isFinite(pricePrompt.newGross)
                      ? pricePrompt.newGross.toFixed(2)
                      : ''
                    : ''
                }
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  if (!pricePrompt) return
                  setPricePrompt({
                    ...pricePrompt,
                    newGross: Number.isFinite(v) ? v : 0,
                  })
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-price-override-reason">
                {t.bookings.inlineEdit.priceReasonLabel}
              </Label>
              <Textarea
                id="bk-price-override-reason"
                value={priceReason}
                onChange={(e) => setPriceReason(e.target.value)}
                placeholder={t.bookings.inlineEdit.priceReasonPlaceholder}
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t.bookings.inlineEdit.priceDialogCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !pricePrompt ||
                !Number.isFinite(pricePrompt.newGross) ||
                pricePrompt.newGross < 0 ||
                priceReason.trim().length === 0
              }
              onClick={(e) => {
                e.preventDefault()
                if (!pricePrompt) return
                inlineEdit.overridePrice({
                  bookingId: pricePrompt.bookingId,
                  operatorId: currentOperatorId,
                  newGrossTotal: pricePrompt.newGross,
                  reason: priceReason,
                  previousGrossTotal: pricePrompt.previousGross,
                })
                setPricePrompt(null)
                setPriceReason('')
              }}
            >
              {t.bookings.inlineEdit.priceDialogConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
