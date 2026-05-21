// landr-aqn4 — Approvals queue upgraded with sortable columns, filter
// chips, header pending-count badge, row-click → BookingDetailSheet, a
// friendly empty state, and a new Activity-date column.
//
// The list itself is still fetched via fetchPendingGeneralApprovals
// (Supabase REST → bookings + approval_trace). Approve/Reject buttons
// remain inline on the row so the page acts as a triage queue rather than
// forcing a sheet round-trip for every decision.

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  DownloadIcon,
  PartyPopperIcon,
} from 'lucide-react'

import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { BulkActionToolbar } from '@/components/BulkActionToolbar'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonTableRows } from '@/components/SkeletonTableRows'
import { ApprovalsFilters } from '@/components/approvals/ApprovalsFilters'
import { StageChip } from '@/components/approvals/StageChip'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  activityDateDisplay,
  bulkSendReminder,
  customerDisplay,
  dateDisplay,
  fetchPendingGeneralApprovals,
  firstActivityDate,
  invalidateBookingCaches,
  postGeneralApprovalDecision,
  priceDisplay,
  productDisplay,
  type ApprovalDecision,
  type BookingRow,
} from '@/lib/bookings'
import { filterApprovals } from '@/lib/approvals-filter-match'
import { useApprovalsFilters } from '@/lib/approvals-filters'
import { downloadCsv, todayStampUtc, type CsvColumn } from '@/lib/csv-export'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

type DialogState = {
  row: BookingRow
  decision: ApprovalDecision
} | null

// landr-xnpc — CSV column set for the Approvals queue export. Stable at
// module scope; mirrors the on-screen approval table plus the gross_total
// numeric so operators can sort/SUM in their spreadsheet of choice.
const approvalsCsvColumns: CsvColumn<BookingRow>[] = [
  { header: 'Booking ID', value: (r) => r.id },
  { header: 'Requested', value: (r) => r.created_at },
  { header: 'Activity date', value: (r) => firstActivityDate(r) ?? '' },
  { header: 'Stage', value: (r) => r.current_stage?.code ?? '' },
  { header: 'Customer', value: (r) => customerDisplay(r) },
  { header: 'Email', value: (r) => r.customer?.email ?? '' },
  { header: 'Product', value: (r) => productDisplay(r) },
  {
    header: 'Gross total',
    value: (r) => {
      const n = Number(r.gross_total)
      return Number.isFinite(n) ? n.toFixed(2) : ''
    },
  },
  { header: 'Currency', value: (r) => r.currency || 'EUR' },
]

export function GeneralApprovals() {
  const { currentOperatorId } = useOperator()
  // landr-f1s — respect time_format_24h for the request timestamps.
  const { hour12 } = useOperatorCalendarPrefs()
  const queryClient = useQueryClient()
  const filtersApi = useApprovalsFilters()

  const [dialog, setDialog] = useState<DialogState>(null)
  const [note, setNote] = useState('')
  const [activeRow, setActiveRow] = useState<BookingRow | null>(null)
  // landr-lbbj — bulk-select state lives in the route component so the
  // toolbar (presentation only) and the table can share it.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const query = useQuery<BookingRow[]>({
    queryKey: ['bookings', 'general-approvals', currentOperatorId ?? 'none'],
    queryFn: () => fetchPendingGeneralApprovals(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dialog) throw new Error('No booking selected')
      await postGeneralApprovalDecision({
        bookingId: dialog.row.id,
        decision: dialog.decision,
        notes: note.trim() || undefined,
      })
    },
    onSuccess: () => {
      const isApprove = dialog?.decision === 'approve'
      toast.success(
        isApprove
          ? t.generalApprovals.toastApproved
          : t.generalApprovals.toastRejected,
      )
      // landr-399m — approve/reject mutates the booking row; invalidate both
      // ['bookings'] and ['views-bookings'] via the shared helper so the
      // Views layer's queue badge / counters refresh in lock-step.
      void invalidateBookingCaches(queryClient)
      handleClose()
    },
    onError: (err: Error) => {
      toast.error(t.generalApprovals.toastError, { description: err.message })
    },
  })

  function openDialog(row: BookingRow, decision: ApprovalDecision) {
    setNote('')
    setDialog({ row, decision })
  }

  function handleClose() {
    if (mutation.isPending) return
    setDialog(null)
    setNote('')
  }

  const rows = useMemo(() => query.data ?? [], [query.data])
  const filteredRows = useMemo(
    () => filterApprovals(rows, filtersApi.filters),
    [rows, filtersApi.filters],
  )
  const isApprove = dialog?.decision === 'approve'

  // Sort defaults to most-recent-request first; the operator can flip
  // any column (request date, customer, product, price, activity date).
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])

  const columns = useMemo<ColumnDef<BookingRow>[]>(
    () => [
      // landr-lbbj — bulk-select column. Header checkbox toggles ALL
      // currently-visible (filtered+sorted) rows; row checkbox toggles
      // that single id. Both stopPropagation so clicking the box doesn't
      // also open the detail sheet underneath.
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
              data-testid="approvals-select-all"
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
              data-testid={`approvals-select-${id}`}
            />
          )
        },
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: t.generalApprovals.columnDate,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {dateDisplay(row.original.created_at, { hour12 })}
          </span>
        ),
        sortingFn: 'datetime',
      },
      {
        // Sortable by the ISO date string — lexicographic compare on
        // YYYY-MM-DD matches calendar order. Bookings with no activity
        // date sort to the end via sortUndefined.
        id: 'activity_date',
        accessorFn: (row) => firstActivityDate(row),
        sortUndefined: 'last',
        header: t.generalApprovals.columnActivityDate,
        cell: ({ row }) => {
          const display = activityDateDisplay(row.original)
          if (!display) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return <span className="whitespace-nowrap">{display}</span>
        },
      },
      {
        // landr-qmdo — color-coded "Awaiting X" chip showing which actor
        // needs to act next. Sortable by stage code so the operator can
        // batch-process "all the Hotel ones" without leaving the queue.
        id: 'stage',
        header: t.generalApprovals.columnStage,
        accessorFn: (row) => row.current_stage?.code ?? '',
        cell: ({ row }) => <StageChip code={row.original.current_stage?.code} />,
      },
      {
        id: 'customer',
        header: t.generalApprovals.columnCustomer,
        accessorFn: (row) => customerDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate">{getValue<string>()}</span>
        ),
      },
      {
        id: 'product',
        header: t.generalApprovals.columnProduct,
        accessorFn: (row) => productDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate">{getValue<string>()}</span>
        ),
      },
      {
        id: 'price',
        header: t.generalApprovals.columnPrice,
        accessorFn: (row) => Number(row.gross_total) || 0,
        cell: ({ row }) => (
          <span className="font-medium">{priceDisplay(row.original)}</span>
        ),
      },
      {
        id: 'actions',
        header: t.generalApprovals.columnActions,
        enableSorting: false,
        cell: ({ row }) => (
          <div
            className="flex items-center gap-2"
            // The row itself is click-to-open-sheet; the button cluster
            // stops propagation so Approve/Reject don't ALSO open the
            // detail sheet underneath.
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              variant="default"
              onClick={() => openDialog(row.original, 'approve')}
              aria-label={`${t.generalApprovals.actionApprove} booking ${row.original.id}`}
            >
              {t.generalApprovals.actionApprove}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => openDialog(row.original, 'reject')}
              aria-label={`${t.generalApprovals.actionReject} booking ${row.original.id}`}
            >
              {t.generalApprovals.actionReject}
            </Button>
          </div>
        ),
      },
    ],
    [hour12, selectedIds],
  )

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const pendingCount = rows.length

  // landr-xnpc — export the CURRENT FILTERED view (post chip filters), not
  // the raw queue. If the operator narrowed to "Hotel review only" they
  // want the CSV to match that.
  function onExportCsv() {
    downloadCsv(
      `approvals-${todayStampUtc()}.csv`,
      filteredRows,
      approvalsCsvColumns,
    )
  }

  // landr-lbbj — bulk-action handlers. Each one fans out via Promise.all
  // so all rows fire in parallel; partial failures surface in the toast.
  async function runBulkDecision(
    ids: string[],
    decision: ApprovalDecision,
  ): Promise<void> {
    setBulkBusy(true)
    const results = await Promise.allSettled(
      ids.map((id) =>
        postGeneralApprovalDecision({ bookingId: id, decision }),
      ),
    )
    setBulkBusy(false)
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const fail = results.length - ok
    void invalidateBookingCaches(queryClient)
    setSelectedIds(new Set())

    if (fail === 0) {
      // landr-8eks / landr-a4kh — no Undo affordance: bulk approve/reject is
      // non-reversible (emails fire on approve, voucher used_count decrements
      // on reject, audit_log captures the transition, and the post-transition
      // stage is past a Stripe-promotable boundary). Reject path already warns
      // 'You cannot undo this from here.' in confirmRejectDescription.
      const message =
        decision === 'approve'
          ? t.bulkActions.toastApproved(ok)
          : t.bulkActions.toastRejected(ok)
      toast.success(message)
    } else if (ok > 0) {
      toast.warning(t.bulkActions.toastPartial(ok, fail))
    } else {
      toast.error(t.bulkActions.toastError)
    }
  }

  function runBulkExportCsv(ids: string[]): void {
    // landr-lbbj — reuse landr-xnpc's column schema so the bulk export
    // and the top-right "Download CSV" produce byte-identical files for
    // the same rows.
    const subset = rows.filter((r) => ids.includes(r.id))
    downloadCsv(
      `approvals-${todayStampUtc()}.csv`,
      subset,
      approvalsCsvColumns,
    )
    toast.success(t.bulkActions.toastExported(subset.length))
    setSelectedIds(new Set())
  }

  // landr-vaob — bulk send-reminder wired to the real endpoint
  // (POST /api/staff/operators/{op}/bookings/bulk-reminder, landr-s0wo).
  // The endpoint is best-effort per booking — cross-tenant ids and
  // enqueue/template failures land in `failed` rather than aborting the
  // batch, so we surface a partial-success toast when failed.length > 0.
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

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.generalApprovals.title} />
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{t.generalApprovals.title}</h1>
          {pendingCount > 0 ? (
            <span
              className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              data-testid="approvals-count-badge"
              aria-label={t.generalApprovals.pendingCount(pendingCount)}
            >
              {t.generalApprovals.pendingCount(pendingCount)}
            </span>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onExportCsv}
          disabled={filteredRows.length === 0}
          aria-label={t.generalApprovals.exportCsvAria(filteredRows.length)}
          data-testid="approvals-export-csv"
        >
          <DownloadIcon className="size-4" />
          {t.generalApprovals.exportCsv}
        </Button>
      </header>

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.generalApprovals.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        /* landr-sj2z — paint the table chrome + pulsing skeleton rows
           while the first fetch is in flight, instead of a one-line
           "Loading…" string. The approvals queue has no filter chrome to
           show during loading (filters are derived from the row set), so
           we render a bare table shell with the skeleton body. */
        <div
          className="overflow-x-auto rounded-md border"
          data-testid="approvals-skeleton-shell"
        >
          <Table>
            <TableBody>
              <SkeletonTableRows
                count={6}
                columnCount={columns.length}
                data-testid="approvals-skeleton"
              />
            </TableBody>
          </Table>
        </div>
      ) : rows.length === 0 ? (
        <ApprovalsEmptyState />
      ) : (
        <>
          <ApprovalsFilters
            bookings={rows}
            filtersApi={filtersApi}
            testIdPrefix="approvals-filters"
          />
          <div
            className="overflow-x-auto rounded-md border"
            data-testid="approvals-table"
          >
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
                              data-testid={`approvals-sort-${header.column.id}`}
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
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-muted-foreground py-8 text-center text-sm"
                    >
                      {t.generalApprovals.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={() => setActiveRow(row.original)}
                      className="cursor-pointer"
                      data-testid={`approvals-row-${row.original.id}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <BookingDetailSheet
        row={activeRow}
        onOpenChange={(open) => {
          if (!open) setActiveRow(null)
        }}
      />

      <BulkActionToolbar
        selectedIds={[...selectedIds]}
        onClear={() => setSelectedIds(new Set())}
        actions={['approve', 'reject', 'exportCsv', 'sendReminder']}
        onApprove={(ids) => runBulkDecision(ids, 'approve')}
        onReject={(ids) => runBulkDecision(ids, 'reject')}
        onExportCsv={(ids) => runBulkExportCsv(ids)}
        onSendReminder={(ids) => runBulkSendReminder(ids)}
        busy={bulkBusy}
        testIdPrefix="approvals-bulk-toolbar"
      />

      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) handleClose()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isApprove
                ? t.generalApprovals.approveDialogTitle
                : t.generalApprovals.rejectDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isApprove
                ? t.generalApprovals.approveDialogDescription
                : t.generalApprovals.rejectDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dialog ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="font-medium">{customerDisplay(dialog.row)}</div>
                <div className="text-muted-foreground text-xs">
                  {productDisplay(dialog.row)} — {priceDisplay(dialog.row)}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="approval-note">
                  {t.generalApprovals.noteLabel}
                </Label>
                <Textarea
                  id="approval-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t.generalApprovals.notePlaceholder}
                  disabled={mutation.isPending}
                  rows={3}
                />
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={mutation.isPending}
              onClick={handleClose}
            >
              {t.generalApprovals.cancel}
            </AlertDialogCancel>
            <Button
              variant={isApprove ? 'default' : 'destructive'}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? isApprove
                  ? t.generalApprovals.approving
                  : t.generalApprovals.rejecting
                : isApprove
                  ? t.generalApprovals.confirmApprove
                  : t.generalApprovals.confirmReject}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// landr-s1mr — reuse the shared <EmptyState> with the celebratory tone.
// We keep this wrapper so the route can render `<ApprovalsEmptyState />`
// the same way it did before (and so the data-testid stays stable for
// the existing tests).
function ApprovalsEmptyState() {
  return (
    <EmptyState
      icon={PartyPopperIcon}
      tone="celebratory"
      title={t.emptyStates.approvals.title}
      description={t.emptyStates.approvals.description}
      data-testid="approvals-empty-state"
    />
  )
}
