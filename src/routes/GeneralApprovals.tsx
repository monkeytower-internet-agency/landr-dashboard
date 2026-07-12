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
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { DownloadIcon, PartyPopperIcon } from 'lucide-react'

import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { BulkActionToolbar } from '@/components/BulkActionToolbar'
import { DataTable } from '@/components/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonTableRows } from '@/components/SkeletonTableRows'
import { ApprovalRowContextMenu } from '@/components/approvals/ApprovalRowContextMenu'
import { ApprovalsFilters } from '@/components/approvals/ApprovalsFilters'
import { ApprovalRowDecisionButtons } from '@/components/approvals/ApprovalRowDecisionButtons'
import { buildGeneralApprovalsColumns } from '@/components/approvals/generalApprovalsColumns'
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
import { Table, TableBody } from '@/components/ui/table'
import {
  activityDateDisplay,
  bulkSendReminder,
  customerDisplay,
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
import { bulkApplyTagsToBookings } from '@/lib/tags'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { useListKeyboardNav } from '@/lib/use-list-keyboard-nav'

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

  const columns = useMemo(
    () =>
      buildGeneralApprovalsColumns({
        hour12,
        selectedIds,
        setSelectedIds,
        onDecide: openDialog,
      }),
    [hour12, selectedIds],
  )

  // TanStack Table's useReactTable() returns functions that cannot be
  // memoized safely; React Compiler skips memoization here by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // landr-euta — vim-style j/k row navigation. Enter opens the detail
  // sheet (same as a row click); 'x' toggles bulk-select on the focused
  // row, reusing the shared selectedIds Set so x and the checkbox
  // column write to the same state.
  const visibleApprovalRows = table.getRowModel().rows
  const nav = useListKeyboardNav({
    rowCount: visibleApprovalRows.length,
    onOpen: (index) => {
      const row = visibleApprovalRows[index]
      if (row) setActiveRow(row.original)
    },
    onToggleSelect: (index) => {
      const row = visibleApprovalRows[index]
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

  const pendingCount = rows.length

  // landr-3qkr.2 — mobile card: select checkbox (bulk actions exist here) +
  // customer + product + stage chip + activity date + price, with the inline
  // Approve / Reject cluster as the row's primary action. Tapping the card
  // body opens the detail sheet, same as a desktop row click.
  const renderApprovalCard = (row: Row<BookingRow>) => {
    const booking = row.original
    const checked = selectedIds.has(booking.id)
    const activity = activityDateDisplay(booking)
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
            data-testid={`approvals-card-select-${booking.id}`}
            className="mt-1 size-5"
          />
          <button
            type="button"
            onClick={() => setActiveRow(booking)}
            className="min-w-0 flex-1 text-left"
            data-testid={`approvals-card-${booking.id}`}
          >
            <span className="block truncate font-medium">
              {customerDisplay(booking)}
            </span>
            <span className="text-muted-foreground block truncate text-sm">
              {productDisplay(booking)}
            </span>
          </button>
          <StageChip code={booking.current_stage?.code} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            {activity ?? '—'}
          </span>
          <span className="font-medium">{priceDisplay(booking)}</span>
        </div>
        <ApprovalRowDecisionButtons row={booking} onDecide={openDialog} />
      </div>
    )
  }

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

  // landr-uqr2 — bulk-apply tags. Same shape as BookingsTable's handler:
  // read each selected row's current tag ids off the in-memory row set
  // and POST the UNION (current ∪ chosen) via setBookingTags per row.
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
          currentTagIds: (row?.tags ?? []).map((tagRef) => tagRef.id),
        }
      })
      const { ok, failed } = await bulkApplyTagsToBookings(
        currentOperatorId,
        items,
        tagIds,
      )
      void invalidateBookingCaches(queryClient)
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
      <PageTitle
        title={t.generalApprovals.title}
        subtitle={t.generalApprovals.subtitleCount(pendingCount)}
      />
      {/* landr-3qkr.6 — flex-wrap so the Export CSV button stays usable on a
          360px phone. The page title + pending count now live in the topbar
          (PageTitle subtitleCount), so the body header carries only the
          Export CSV action, right-aligned. */}
      <header className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
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
          <DataTable
            table={table}
            columnCount={columns.length}
            emptyMessage={t.generalApprovals.empty}
            paginate={false}
            containerTestId="approvals-table"
            sortTestId={(columnId) => `approvals-sort-${columnId}`}
            onRowClick={(row) => setActiveRow(row.original)}
            rowTestId={(row) => `approvals-row-${row.original.id}`}
            rowProps={(_row, index) => nav.getRowProps(index)}
            renderCard={renderApprovalCard}
            rowWrapper={(row, rowNode) => (
              // landr-oxlk — right-click → Open / Approve / Reject. Approve
              // & Reject defer to openDialog() so the same AlertDialog wizard
              // the inline buttons use handles the confirmation + note.
              <ApprovalRowContextMenu
                key={row.id}
                row={row.original}
                onOpenDetail={(r) => setActiveRow(r)}
                onDecide={(r, decision) => openDialog(r, decision)}
              >
                {rowNode}
              </ApprovalRowContextMenu>
            )}
          />
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
        actions={['approve', 'reject', 'tag', 'exportCsv', 'sendReminder']}
        onApprove={(ids) => runBulkDecision(ids, 'approve')}
        onReject={(ids) => runBulkDecision(ids, 'reject')}
        onExportCsv={(ids) => runBulkExportCsv(ids)}
        onSendReminder={(ids) => runBulkSendReminder(ids)}
        onApplyTags={(ids, tagIds) => runBulkApplyTags(ids, tagIds)}
        operatorId={currentOperatorId ?? undefined}
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
            {/* landr-wg2y: reject uses 'brand' (orange), not 'destructive'
                (red) — it's the reject side of the approve/reject decision,
                not a delete/erase action. */}
            <Button
              variant={isApprove ? 'default' : 'brand'}
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
