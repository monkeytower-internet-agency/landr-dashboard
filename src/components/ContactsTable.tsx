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
import { ArrowDown, ArrowUp, ArrowUpDown, ClockIcon, Trash2Icon } from 'lucide-react'
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
  contactDate,
  contactIsErased,
  contactNameDisplay,
  type ContactRow,
} from '@/lib/contacts'
import { t } from '@/lib/strings'

type Props = {
  rows: ContactRow[]
  onEdit: (row: ContactRow) => void
  onErase: (row: ContactRow) => void
  onAudit: (row: ContactRow) => void
}

export function ContactsTable({ rows, onEdit, onErase, onAudit }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<ContactRow>[]>(
    () => [
      {
        id: 'name',
        header: t.contacts.columnName,
        accessorFn: (row) => contactNameDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate font-medium">{getValue<string>()}</span>
        ),
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: t.contacts.columnEmail,
        cell: ({ row }) => (
          <span className="text-muted-foreground truncate">
            {row.original.email ?? '—'}
          </span>
        ),
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: t.contacts.columnPhone,
        cell: ({ row }) => (
          <span className="text-muted-foreground truncate">
            {row.original.phone ?? '—'}
          </span>
        ),
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: t.contacts.columnCreated,
        cell: ({ row }) => contactDate(row.original.created_at),
        sortingFn: 'datetime',
      },
      {
        id: 'status',
        header: t.contacts.columnStatus,
        accessorFn: (row) =>
          contactIsErased(row)
            ? t.contacts.statusErased
            : t.contacts.statusActive,
        cell: ({ row }) => {
          const erased = contactIsErased(row.original)
          return (
            <span
              data-erased={erased}
              className={
                erased
                  ? 'bg-destructive/10 text-destructive inline-flex rounded-full px-2 py-0.5 text-xs'
                  : 'bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs'
              }
            >
              {erased ? t.contacts.statusErased : t.contacts.statusActive}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: () => (
          <span className="sr-only">{t.contacts.columnActions}</span>
        ),
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const erased = contactIsErased(row.original)
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onAudit(row.original)
                }}
                aria-label={`${t.contacts.actionAudit} — ${contactNameDisplay(row.original)}`}
              >
                <ClockIcon className="size-3.5" />
                <span className="hidden sm:inline">
                  {t.contacts.actionAudit}
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={erased}
                onClick={(e) => {
                  e.stopPropagation()
                  onErase(row.original)
                }}
                aria-label={`${t.contacts.actionErase} — ${contactNameDisplay(row.original)}`}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2Icon className="size-3.5" />
                <span className="hidden sm:inline">
                  {t.contacts.actionEraseShort}
                </span>
              </Button>
            </div>
          )
        },
      },
    ],
    [onEdit, onErase, onAudit],
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
          placeholder={t.contacts.filterPlaceholder}
          className="max-w-sm"
          aria-label={t.contacts.filterPlaceholder}
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
                  {t.contacts.empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onEdit(row.original)}
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
    </div>
  )
}
