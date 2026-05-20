import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, PencilIcon, Trash2Icon } from 'lucide-react'
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
import type { Location, LocationRoleType } from '@/lib/locations'
import { t } from '@/lib/strings'

type Props = {
  rows: Location[]
  roleTypes: LocationRoleType[]
  onEdit: (row: Location) => void
  onDelete: (row: Location) => void
}

export function LocationsTable({ rows, roleTypes, onEdit, onDelete }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: false },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const roleTypeMap = useMemo(() => {
    const m = new Map<string, LocationRoleType>()
    for (const rt of roleTypes) m.set(rt.id, rt)
    return m
  }, [roleTypes])

  const parentMap = useMemo(() => {
    const m = new Map<string, Location>()
    for (const row of rows) m.set(row.id, row)
    return m
  }, [rows])

  const columns = useMemo<ColumnDef<Location>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: t.pickupLocations.columnName,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        id: 'role_type_id',
        accessorKey: 'role_type_id',
        header: t.pickupLocations.columnRoleType,
        cell: ({ row }) => {
          const rt = roleTypeMap.get((row.original as Location & { role_type_id?: string }).role_type_id ?? '')
          return rt ? (
            <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs">
              {rt.label}
            </span>
          ) : null
        },
      },
      {
        id: 'parent_id',
        accessorKey: 'parent_id',
        header: t.pickupLocations.columnParent,
        cell: ({ row }) => {
          const parent = row.original.parent_id
            ? parentMap.get(row.original.parent_id)
            : null
          return parent ? (
            <span className="text-muted-foreground text-sm">{parent.name}</span>
          ) : null
        },
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: t.pickupLocations.columnEmail,
        cell: ({ row }) =>
          row.original.email ? (
            <span className="text-muted-foreground text-sm">
              {row.original.email}
            </span>
          ) : null,
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: '',
        enableGlobalFilter: false,
        sortingFn: 'datetime',
        cell: () => null,
      },
      {
        id: 'actions',
        header: () => (
          <span className="sr-only">{t.pickupLocations.columnActions}</span>
        ),
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(row.original)
              }}
              aria-label={`${t.pickupLocations.actionEdit} — ${row.original.name}`}
            >
              <PencilIcon className="size-3.5" />
              <span className="hidden sm:inline">
                {t.pickupLocations.actionEdit}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(row.original)
              }}
              aria-label={`${t.pickupLocations.actionDelete} — ${row.original.name}`}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2Icon className="size-3.5" />
              <span className="hidden sm:inline">
                {t.pickupLocations.actionDelete}
              </span>
            </Button>
          </div>
        ),
      },
    ],
    [roleTypeMap, parentMap, onEdit, onDelete],
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
  })

  const visibleColumns = columns.filter((c) => c.id !== 'created_at')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={t.pickupLocations.filterPlaceholder}
          className="max-w-sm"
          aria-label={t.pickupLocations.filterPlaceholder}
        />
        <div className="text-muted-foreground text-sm">
          {t.pickupLocations.matches(
            table.getFilteredRowModel().rows.length,
            rows.length,
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers
                  .filter((h) => h.id !== 'created_at')
                  .map((header) => {
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {t.pickupLocations.empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row
                    .getVisibleCells()
                    .filter((c) => c.column.id !== 'created_at')
                    .map((cell) => (
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
    </div>
  )
}
