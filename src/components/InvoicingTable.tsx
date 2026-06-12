// landr-a4pl.2 — Holded invoicing status table.
//
// Wraps the shared DataTable (landr-3qkr.2) — desktop table + below-md card
// list — over the HoldedInvoiceRow[] for the currently-selected bucket. Owns:
//   • the column schema (booking ref link, customer, finalised date, amount,
//     status badge, attempts n/max, last error on failed rows, Holded invoice
//     ref on transferred rows)
//   • the per-row Retry action on failed rows
//   • the mobile card renderer
//
// Bucket selection, the summary tabs and the Sync-now button live in the
// route (Invoicing.tsx); this component is presentational + emits onRetry /
// onOpenBooking callbacks.

import { useMemo, useState } from 'react'
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/DataTable'
import { cn } from '@/lib/utils'
import {
  pendingFlagFor,
  type HoldedInvoiceRow,
  type HoldedInvoiceStatus,
} from '@/lib/holded-invoicing'
import { t } from '@/lib/strings'

// Status badge label + tone, keyed off the raw external_sync_log status.
const STATUS_LABEL: Record<HoldedInvoiceStatus, string> = {
  pending: t.invoicing.statusPending,
  in_flight: t.invoicing.statusInFlight,
  succeeded: t.invoicing.statusSucceeded,
  failed: t.invoicing.statusFailed,
  blocked_on_human: t.invoicing.statusBlocked,
}

const STATUS_TONE: Record<HoldedInvoiceStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  in_flight: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  succeeded:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  blocked_on_human:
    'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

function StatusBadge({ status }: { status: HoldedInvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_TONE[status] ?? 'bg-muted text-muted-foreground',
      )}
      data-status={status}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// Pending sub-flag chip ('Due soon' grey vs 'Overdue' amber) rendered beside
// the booking ref on pending rows. age_days > 2 ⇒ overdue (epic contract).
function PendingFlag({ ageDays }: { ageDays: number }) {
  const flag = pendingFlagFor(ageDays)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium',
        flag === 'overdue'
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-muted text-muted-foreground',
      )}
      data-flag={flag}
    >
      {flag === 'overdue' ? t.invoicing.flagOverdue : t.invoicing.flagDueSoon}
    </span>
  )
}

function finalisedDisplay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE')
}

type Props = {
  rows: HoldedInvoiceRow[]
  isLoading?: boolean
  /** Open the booking detail (route navigates to /bookings?open=<id>). */
  onOpenBooking: (row: HoldedInvoiceRow) => void
  /** Retry a single failed row. */
  onRetry: (row: HoldedInvoiceRow) => void
  /** sync_log_id currently mid-retry — disables that row's button + spins it. */
  retryingId?: string | null
  /** Whether the whole-operator sync is in flight (disables retry buttons). */
  syncBusy?: boolean
}

export function InvoicingTable({
  rows,
  isLoading = false,
  onOpenBooking,
  onRetry,
  retryingId,
  syncBusy = false,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'finalised_at', desc: true },
  ])

  const columns = useMemo<ColumnDef<HoldedInvoiceRow>[]>(
    () => [
      {
        id: 'booking_ref',
        accessorKey: 'booking_ref',
        header: t.invoicing.columnBookingRef,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenBooking(r)
                }}
                className="text-primary font-medium hover:underline"
                aria-label={t.invoicing.openBookingAria(r.booking_ref)}
                data-testid={`invoicing-booking-link-${r.sync_log_id}`}
              >
                {r.booking_ref}
              </button>
              {r.bucket === 'pending' ? (
                <PendingFlag ageDays={r.age_days} />
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'customer_name',
        accessorKey: 'customer_name',
        header: t.invoicing.columnCustomer,
        cell: ({ row }) => (
          <span className="truncate">{row.original.customer_name}</span>
        ),
      },
      {
        id: 'finalised_at',
        accessorKey: 'finalised_at',
        header: t.invoicing.columnFinalised,
        sortingFn: 'datetime',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {finalisedDisplay(row.original.finalised_at)}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorKey: 'amount',
        header: t.invoicing.columnAmount,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-medium whitespace-nowrap">
            {row.original.amount}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t.invoicing.columnStatus,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'attempts',
        header: t.invoicing.columnAttempts,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {t.invoicing.attempts(
              row.original.attempt_count,
              row.original.max_attempts,
            )}
          </span>
        ),
      },
      {
        // Last error on failed rows; Holded invoice ref on transferred rows;
        // dash otherwise. Keeps a single trailing detail column rather than
        // two mostly-empty ones.
        id: 'detail',
        header: t.invoicing.columnError,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          if (r.bucket === 'failed' && r.failure_reason) {
            return (
              <span
                className="text-destructive line-clamp-2 max-w-xs text-sm"
                title={r.failure_reason}
                data-testid={`invoicing-error-${r.sync_log_id}`}
              >
                {r.failure_reason}
              </span>
            )
          }
          if (r.bucket === 'transferred' && r.external_reference) {
            return (
              <span
                className="text-muted-foreground font-mono text-xs"
                data-testid={`invoicing-holded-ref-${r.sync_log_id}`}
              >
                {r.external_reference}
              </span>
            )
          }
          return <span className="text-muted-foreground text-xs">—</span>
        },
      },
      {
        // Per-row Retry on failed rows only.
        id: 'actions',
        header: t.invoicing.columnActions,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original
          if (r.bucket !== 'failed') return null
          const busy = retryingId === r.sync_log_id
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || syncBusy}
              aria-label={t.invoicing.retryAria(r.booking_ref)}
              data-testid={`invoicing-retry-${r.sync_log_id}`}
              onClick={(e) => {
                e.stopPropagation()
                onRetry(r)
              }}
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                t.invoicing.retry
              )}
            </Button>
          )
        },
      },
    ],
    [onOpenBooking, onRetry, retryingId, syncBusy],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  })

  // Mobile card: booking ref + status badge on top; customer + amount; the
  // failed-row error and per-row Retry below. Mirrors the desktop columns.
  const renderCard = (row: Row<HoldedInvoiceRow>) => {
    const r = row.original
    const busy = retryingId === r.sync_log_id
    return (
      <div className="bg-card flex flex-col gap-2 rounded-lg border p-3 shadow-s">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenBooking(r)}
            className="min-w-0 flex-1 text-left"
            aria-label={t.invoicing.openBookingAria(r.booking_ref)}
            data-testid={`invoicing-card-booking-link-${r.sync_log_id}`}
          >
            <span className="text-primary block font-medium hover:underline">
              {r.booking_ref}
            </span>
            <span className="text-muted-foreground block truncate text-sm">
              {r.customer_name}
            </span>
          </button>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={r.status} />
            {r.bucket === 'pending' ? (
              <PendingFlag ageDays={r.age_days} />
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-sm">
            {finalisedDisplay(r.finalised_at)}
          </span>
          <span className="font-medium">{r.amount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {t.invoicing.attempts(r.attempt_count, r.max_attempts)}
          </span>
          {r.bucket === 'transferred' && r.external_reference ? (
            <span
              className="text-muted-foreground font-mono text-xs"
              data-testid={`invoicing-card-holded-ref-${r.sync_log_id}`}
            >
              {r.external_reference}
            </span>
          ) : null}
        </div>
        {r.bucket === 'failed' && r.failure_reason ? (
          <p
            className="text-destructive text-sm"
            data-testid={`invoicing-card-error-${r.sync_log_id}`}
          >
            {r.failure_reason}
          </p>
        ) : null}
        {r.bucket === 'failed' ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={busy || syncBusy}
            aria-label={t.invoicing.retryAria(r.booking_ref)}
            data-testid={`invoicing-card-retry-${r.sync_log_id}`}
            onClick={() => onRetry(r)}
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              t.invoicing.retry
            )}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <DataTable
      table={table}
      columnCount={columns.length}
      emptyMessage={t.invoicing.empty}
      isLoading={isLoading}
      skeletonTestId="invoicing-skeleton"
      containerTestId="invoicing-table"
      onRowClick={(row) => onOpenBooking(row.original)}
      rowTestId={(row) => `invoicing-row-${row.original.sync_log_id}`}
      renderCard={renderCard}
    />
  )
}
