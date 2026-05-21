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
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { ApprovalsFilters } from '@/components/approvals/ApprovalsFilters'
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
  customerDisplay,
  dateDisplay,
  fetchPendingGeneralApprovals,
  firstActivityDate,
  postGeneralApprovalDecision,
  priceDisplay,
  productDisplay,
  type ApprovalDecision,
  type BookingRow,
} from '@/lib/bookings'
import { filterApprovals } from '@/lib/approvals-filter-match'
import { useApprovalsFilters } from '@/lib/approvals-filters'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

type DialogState = {
  row: BookingRow
  decision: ApprovalDecision
} | null

export function GeneralApprovals() {
  const { currentOperatorId } = useOperator()
  // landr-f1s — respect time_format_24h for the request timestamps.
  const { hour12 } = useOperatorCalendarPrefs()
  const queryClient = useQueryClient()
  const filtersApi = useApprovalsFilters()

  const [dialog, setDialog] = useState<DialogState>(null)
  const [note, setNote] = useState('')
  const [activeRow, setActiveRow] = useState<BookingRow | null>(null)

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
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
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
    [hour12],
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
        <p className="text-muted-foreground text-sm">
          {t.generalApprovals.loading}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState />
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

function EmptyState() {
  return (
    <div
      className="border-muted-foreground/20 flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-16 text-center"
      data-testid="approvals-empty-state"
    >
      <span className="text-3xl" aria-hidden>
        {t.generalApprovals.emptyEmoji}
      </span>
      <p className="text-muted-foreground text-sm">
        {t.generalApprovals.empty}
      </p>
    </div>
  )
}
