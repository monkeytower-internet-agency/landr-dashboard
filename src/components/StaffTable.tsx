import { useMemo, useState } from 'react'
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
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/DataTable'
import {
  permissionsSummary,
  staffDate,
  staffEmailDisplay,
  staffNameDisplay,
  type StaffRow,
} from '@/lib/staff'
import { t } from '@/lib/strings'

type Props = {
  rows: StaffRow[]
  onEdit: (row: StaffRow) => void
  onRevoke: (row: StaffRow) => void
}

// landr-3qkr.2 — shared edit/revoke action cluster, reused by the desktop
// actions column and the mobile card so behaviour stays identical.
function StaffRowActions({
  row,
  onEdit,
  onRevoke,
}: {
  row: StaffRow
  onEdit: (row: StaffRow) => void
  onRevoke: (row: StaffRow) => void
}) {
  const label = staffEmailDisplay(row)
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onEdit(row)
        }}
        aria-label={`${t.staff.actionEdit} — ${label}`}
      >
        <PencilIcon className="size-3.5" />
        <span className="hidden sm:inline">{t.staff.actionEdit}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onRevoke(row)
        }}
        aria-label={`${t.staff.actionRevoke} — ${label}`}
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2Icon className="size-3.5" />
        <span className="hidden sm:inline">{t.staff.actionRevoke}</span>
      </Button>
    </div>
  )
}

export function StaffTable({ rows, onEdit, onRevoke }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: false },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<StaffRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) => staffNameDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate font-medium">{getValue<string>()}</span>
        ),
      },
      {
        id: 'email',
        header: t.staff.columnEmail,
        accessorFn: (row) => staffEmailDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate font-medium">{getValue<string>()}</span>
        ),
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: t.staff.columnRole,
        cell: ({ row }) => (
          <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs">
            {row.original.role}
          </span>
        ),
      },
      {
        id: 'permissions',
        header: t.staff.columnPermissions,
        accessorFn: (row) => permissionsSummary(row.permissions),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground text-sm">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: t.staff.columnJoined,
        cell: ({ row }) => staffDate(row.original.created_at),
        sortingFn: 'datetime',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t.staff.columnActions}</span>,
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <StaffRowActions row={row.original} onEdit={onEdit} onRevoke={onRevoke} />
        ),
      },
    ],
    [onEdit, onRevoke],
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

  // landr-3qkr.2 — mobile card: name + email + role badge + permissions,
  // edit/revoke actions inline. Tap targets are the buttons themselves.
  const renderCard = (row: Row<StaffRow>) => {
    const member = row.original
    return (
      <div className="bg-card flex flex-col gap-2 rounded-lg border p-3 shadow-s">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">{staffNameDisplay(member)}</div>
            <div className="text-muted-foreground truncate text-sm">
              {staffEmailDisplay(member)}
            </div>
          </div>
          <span className="bg-muted text-muted-foreground inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs">
            {member.role}
          </span>
        </div>
        <div className="text-muted-foreground text-sm">
          {permissionsSummary(member.permissions)}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {staffDate(member.created_at)}
          </span>
          <StaffRowActions row={member} onEdit={onEdit} onRevoke={onRevoke} />
        </div>
      </div>
    )
  }

  return (
    <DataTable
      table={table}
      columnCount={columns.length}
      emptyMessage={t.staff.empty}
      search={{
        value: globalFilter,
        onChange: setGlobalFilter,
        placeholder: t.staff.filterPlaceholder,
      }}
      matchCountNode={t.staff.matches(
        table.getFilteredRowModel().rows.length,
        rows.length,
      )}
      tableAriaLabel={t.staff.listAriaLabel}
      renderCard={renderCard}
    />
  )
}
