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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  permissionsSummary,
  staffDate,
  staffEmailDisplay,
  type StaffRow,
} from '@/lib/staff'
import { t } from '@/lib/strings'

type Props = {
  rows: StaffRow[]
  onEdit: (row: StaffRow) => void
  onRevoke: (row: StaffRow) => void
}

export function StaffTable({ rows, onEdit, onRevoke }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: false },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<StaffRow>[]>(
    () => [
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
        cell: ({ row }) => {
          const label = staffEmailDisplay(row.original)
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(row.original)
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
                  onRevoke(row.original)
                }}
                aria-label={`${t.staff.actionRevoke} — ${label}`}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2Icon className="size-3.5" />
                <span className="hidden sm:inline">{t.staff.actionRevoke}</span>
              </Button>
            </div>
          )
        },
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={t.staff.filterPlaceholder}
          className="max-w-sm"
          aria-label={t.staff.filterPlaceholder}
        />
        <div className="text-muted-foreground text-sm">
          {t.staff.matches(table.getFilteredRowModel().rows.length, rows.length)}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table aria-label={t.staff.listAriaLabel}>
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
                          className="hover:text-foreground inline-flex items-center gap-1"
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
                  {t.staff.empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
    </div>
  )
}
