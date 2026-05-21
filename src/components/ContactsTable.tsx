import { useCallback, useMemo, useState } from 'react'
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
  ClockIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { BulkActionToolbar } from '@/components/BulkActionToolbar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ContactRowContextMenu } from '@/components/contacts/ContactRowContextMenu'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { SkeletonTableRows } from '@/components/SkeletonTableRows'
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
import { TagChipRow } from '@/components/tags/TagChip'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'
import { bulkApplyTagsToContacts } from '@/lib/tags'
import { highlightMatch } from '@/lib/text-highlight'
import { useListKeyboardNav } from '@/lib/use-list-keyboard-nav'

type Props = {
  rows: ContactRow[]
  onEdit: (row: ContactRow) => void
  onErase: (row: ContactRow) => void
  onAudit: (row: ContactRow) => void
  // landr-sj2z — render skeleton placeholder rows while the parent's
  // query is still pending. Mirrors BookingsTable's loading-state prop.
  isLoading?: boolean
  /**
   * landr-j57l — when both are passed, the search input is controlled by
   * the parent so it can persist to the URL (`?q=…`). Omitting them keeps
   * the legacy uncontrolled behaviour.
   */
  globalFilter?: string
  onGlobalFilterChange?: (next: string) => void
}

export function ContactsTable({
  rows,
  onEdit,
  onErase,
  onAudit,
  isLoading = false,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])
  // landr-j57l — controlled-or-uncontrolled search. See BookingsTable for
  // the full rationale.
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
  // landr-uqr2 — bulk-select state (mirrors BookingsTable). Set<id> for
  // O(1) header / row checks; the toolbar opens a TagPicker that fans
  // tag-apply out across the selected rows.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const { currentOperatorId } = useOperator()

  const columns = useMemo<ColumnDef<ContactRow>[]>(
    () => [
      // landr-uqr2 — leading select column (matches BookingsTable +
      // GeneralApprovals). Header toggles every visible row; row click
      // stopPropagation so the checkbox does not trigger onEdit().
      {
        id: 'select',
        enableSorting: false,
        header: ({ table: t1 }) => {
          const visibleIds = t1
            .getRowModel()
            .rows.map((r) => (r.original as ContactRow).id)
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
              data-testid="contacts-select-all"
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
              data-testid={`contacts-select-${id}`}
            />
          )
        },
      },
      {
        id: 'name',
        header: t.contacts.columnName,
        accessorFn: (row) => contactNameDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate font-medium">
            {highlightMatch(getValue<string>(), globalFilter)}
          </span>
        ),
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: t.contacts.columnEmail,
        cell: ({ row }) => {
          const email = row.original.email
          return (
            <span className="text-muted-foreground truncate">
              {email ? highlightMatch(email, globalFilter) : '—'}
            </span>
          )
        },
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: t.contacts.columnPhone,
        cell: ({ row }) => {
          const phone = row.original.phone
          return (
            <span className="text-muted-foreground truncate">
              {phone ? highlightMatch(phone, globalFilter) : '—'}
            </span>
          )
        },
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: t.contacts.columnCreated,
        cell: ({ row }) => contactDate(row.original.created_at),
        sortingFn: 'datetime',
      },
      {
        // landr-iz58 — operator-applied tag chips.
        id: 'tags',
        header: t.contacts.columnTags,
        enableSorting: false,
        cell: ({ row }) => <TagChipRow tags={row.original.tags ?? []} />,
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
    [onEdit, onErase, onAudit, globalFilter, selectedIds],
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

  // landr-euta — vim-style j/k row navigation. landr-uqr2 wires 'x' to
  // toggle bulk-select on the focused row so contacts now share the same
  // toggle UX as BookingsTable + GeneralApprovals.
  const visibleRows = table.getRowModel().rows
  const nav = useListKeyboardNav({
    rowCount: visibleRows.length,
    onOpen: (index) => {
      const row = visibleRows[index]
      if (row) onEdit(row.original)
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

  // landr-uqr2 — bulk-apply tags handler. Reads each selected contact's
  // current tag ids off the in-memory row set, POSTs the UNION via
  // setContactTags per row, and toasts the partial-failure outcome.
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
      const { ok, failed } = await bulkApplyTagsToContacts(
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

  // landr-s1mr / landr-sj2z — When there are zero contacts AND the fetch
  // has settled, show the friendly empty-state card. During the loading
  // window we fall through so the skeleton placeholder takes over below,
  // preventing the empty-state from flashing before the real rows land.
  if (rows.length === 0 && !isLoading) {
    return (
      <EmptyState
        icon={UsersIcon}
        title={t.emptyStates.contacts.title}
        description={t.emptyStates.contacts.description}
        data-testid="contacts-empty-state"
      />
    )
  }

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
            {isLoading ? (
              // landr-sj2z — pulsing placeholder while the first fetch is
              // in flight. Column count matches the visible columns so the
              // real rows drop into the same grid.
              <SkeletonTableRows
                count={6}
                columnCount={columns.length}
                data-testid="contacts-skeleton"
              />
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {t.contacts.empty}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row, index) => {
                const rowProps = nav.getRowProps(index)
                // landr-oxlk — right-click → quick actions (Open / Copy
                // link / Apply tag / Erase). Wraps the existing TableRow
                // via asChild so left-click → onEdit, j/k focus, and the
                // testid stay untouched.
                return (
                  <ContactRowContextMenu
                    key={row.id}
                    row={row.original}
                    operatorId={row.original.operator_id ?? null}
                    onOpenDetail={(r) => onEdit(r)}
                    onErase={(r) => onErase(r)}
                    copyLinkPath={(r) => `/contacts?open=${r.id}`}
                  >
                    <TableRow
                      onClick={() => onEdit(row.original)}
                      className="cursor-pointer data-[focused]:bg-muted/60"
                      data-testid={`contacts-row-${row.original.id}`}
                      ref={rowProps.ref}
                      data-focused={rowProps['data-focused']}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  </ContactRowContextMenu>
                )
              })
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

      <BulkActionToolbar
        selectedIds={[...selectedIds]}
        onClear={() => setSelectedIds(new Set())}
        actions={['tag']}
        onApplyTags={(ids, tagIds) => runBulkApplyTags(ids, tagIds)}
        operatorId={currentOperatorId ?? undefined}
        busy={bulkBusy}
        testIdPrefix="contacts-bulk-toolbar"
      />
    </div>
  )
}
