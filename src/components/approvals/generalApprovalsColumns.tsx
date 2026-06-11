// Extracted from GeneralApprovals.tsx (landr-v9e4.9 — pure-helper extraction).
// ColumnDef factory for the GeneralApprovals table.

import type { ColumnDef } from '@tanstack/react-table'
import { selectColumn } from '@/components/data-table-select'
import { StageChip } from '@/components/approvals/StageChip'
import { ApprovalRowDecisionButtons } from '@/components/approvals/ApprovalRowDecisionButtons'
import {
  activityDateDisplay,
  customerDisplay,
  dateDisplay,
  firstActivityDate,
  priceDisplay,
  productDisplay,
  type ApprovalDecision,
  type BookingRow,
} from '@/lib/bookings'
import { t } from '@/lib/strings'

type BuildColumnsOptions = {
  hour12: boolean
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  onDecide: (row: BookingRow, decision: ApprovalDecision) => void
}

export function buildGeneralApprovalsColumns({
  hour12,
  selectedIds,
  setSelectedIds,
  onDecide,
}: BuildColumnsOptions): ColumnDef<BookingRow>[] {
  return [
    // landr-lbbj / landr-3qkr.2 — bulk-select column via the shared
    // selectColumn factory. Header checkbox toggles ALL currently-visible
    // (filtered+sorted) rows; row checkbox toggles that single id.
    selectColumn<BookingRow>({
      selectedIds,
      setSelectedIds,
      testIdPrefix: 'approvals',
    }),
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
      // needs to act next.
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
        <ApprovalRowDecisionButtons row={row.original} onDecide={onDecide} />
      ),
    },
  ]
}
