import { useCallback, useMemo, useState } from 'react'
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
import {
  CalendarIcon,
  ClockIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { BulkActionToolbar } from '@/components/BulkActionToolbar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ContactRowContextMenu } from '@/components/contacts/ContactRowContextMenu'
import { DataTable } from '@/components/DataTable'
import { selectColumn } from '@/components/data-table-select'
import { EmptyState } from '@/components/EmptyState'
import { EmptyContacts } from '@/components/illustrations'
import {
  contactBookingWindow,
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

// landr-6993 — booking-window indicator next to the contact name. Shared by
// the desktop name cell and the mobile card so the dot logic stays in one
// place.
function NextBookingIcon({ row }: { row: ContactRow }) {
  const window = contactBookingWindow(row)
  const dateLabel = row.next_booking_date
    ? contactDate(row.next_booking_date)
    : null
  const showIcon = window !== 'none' && !!dateLabel
  if (!showIcon) return null
  return (
    <span
      title={t.contacts.filters.iconNextBookingTooltip(dateLabel as string)}
      data-testid={`contacts-next-booking-${window}-${row.id}`}
      className="inline-flex shrink-0 items-center"
    >
      <CalendarIcon
        aria-label={
          window === 'today'
            ? t.contacts.filters.iconTodayAria
            : t.contacts.filters.iconFutureAria
        }
        className={
          window === 'today'
            ? 'size-3.5 text-emerald-600'
            : 'size-3.5 text-sky-600'
        }
      />
    </span>
  )
}

function ContactStatusBadge({ erased }: { erased: boolean }) {
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
}

function ContactRowActions({
  row,
  onErase,
  onAudit,
}: {
  row: ContactRow
  onErase: (row: ContactRow) => void
  onAudit: (row: ContactRow) => void
}) {
  const erased = contactIsErased(row)
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onAudit(row)
        }}
        aria-label={`${t.contacts.actionAudit} — ${contactNameDisplay(row)}`}
      >
        <ClockIcon className="size-3.5" />
        <span className="hidden sm:inline">{t.contacts.actionAudit}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={erased}
        onClick={(e) => {
          e.stopPropagation()
          onErase(row)
        }}
        aria-label={`${t.contacts.actionErase} — ${contactNameDisplay(row)}`}
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2Icon className="size-3.5" />
        <span className="hidden sm:inline">{t.contacts.actionEraseShort}</span>
      </Button>
    </div>
  )
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
      // landr-uqr2 / landr-3qkr.2 — leading select column via the shared
      // selectColumn factory (matches BookingsTable + GeneralApprovals).
      selectColumn<ContactRow>({
        selectedIds,
        setSelectedIds,
        testIdPrefix: 'contacts',
      }),
      {
        id: 'name',
        header: t.contacts.columnName,
        accessorFn: (row) => contactNameDisplay(row),
        cell: ({ row, getValue }) => (
          <span className="flex items-center gap-2">
            <NextBookingIcon row={row.original} />
            <span className="truncate font-medium">
              {highlightMatch(getValue<string>(), globalFilter)}
            </span>
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
        cell: ({ row }) => (
          <ContactStatusBadge erased={contactIsErased(row.original)} />
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className="sr-only">{t.contacts.columnActions}</span>
        ),
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <ContactRowActions
            row={row.original}
            onErase={onErase}
            onAudit={onAudit}
          />
        ),
      },
    ],
    [onErase, onAudit, globalFilter, selectedIds],
  )

  // TanStack Table's useReactTable() returns functions that cannot be
  // memoized safely; React Compiler skips memoization here by design.
  // eslint-disable-next-line react-hooks/incompatible-library
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
        illustration={<EmptyContacts className="h-full w-full" />}
        accentHue="people"
        title={t.emptyStates.contacts.title}
        description={t.emptyStates.contacts.description}
        data-testid="contacts-empty-state"
      />
    )
  }

  // landr-3qkr.2 — mobile card: select checkbox (bulk actions exist here) +
  // name with the next-booking dot + email/phone + status badge + the
  // audit/erase actions. Tapping the card body opens the contact editor.
  const renderCard = (row: Row<ContactRow>) => {
    const contact = row.original
    const checked = selectedIds.has(contact.id)
    return (
      <div className="surface-dense flex flex-col gap-2 rounded-lg border p-3 shadow-s">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={checked}
            onChange={(e) => {
              const next = new Set(selectedIds)
              if (e.currentTarget.checked) next.add(contact.id)
              else next.delete(contact.id)
              setSelectedIds(next)
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={t.bulkActions.selectRowAria(contact.id)}
            data-testid={`contacts-card-select-${contact.id}`}
            className="mt-1 size-5"
          />
          <button
            type="button"
            onClick={() => onEdit(contact)}
            className="min-w-0 flex-1 text-left"
            data-testid={`contacts-card-${contact.id}`}
          >
            <span className="flex items-center gap-2">
              <NextBookingIcon row={contact} />
              <span className="truncate font-medium">
                {highlightMatch(contactNameDisplay(contact), globalFilter)}
              </span>
            </span>
            <span className="text-muted-foreground block truncate text-sm">
              {contact.email
                ? highlightMatch(contact.email, globalFilter)
                : '—'}
            </span>
            {contact.phone ? (
              <span className="text-muted-foreground block truncate text-sm">
                {highlightMatch(contact.phone, globalFilter)}
              </span>
            ) : null}
          </button>
          <ContactStatusBadge erased={contactIsErased(contact)} />
        </div>
        {(contact.tags ?? []).length > 0 ? (
          <TagChipRow tags={contact.tags ?? []} />
        ) : null}
        <div className="flex justify-end">
          <ContactRowActions
            row={contact}
            onErase={onErase}
            onAudit={onAudit}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={t.contacts.empty}
        isLoading={isLoading}
        skeletonTestId="contacts-skeleton"
        search={{
          value: globalFilter,
          onChange: setGlobalFilter,
          placeholder: t.contacts.filterPlaceholder,
        }}
        matchCountNode={`${table.getFilteredRowModel().rows.length} / ${rows.length}`}
        onRowClick={(row) => onEdit(row.original)}
        rowTestId={(row) => `contacts-row-${row.original.id}`}
        rowProps={(_row, index) => nav.getRowProps(index)}
        renderCard={renderCard}
        rowWrapper={(row, rowNode) => (
          // landr-oxlk — right-click → quick actions (Open / Copy link /
          // Apply tag / Erase). Wraps the row/card so left-click → onEdit,
          // j/k focus, and the testid stay untouched.
          <ContactRowContextMenu
            key={row.id}
            row={row.original}
            operatorId={row.original.operator_id ?? null}
            onOpenDetail={(r) => onEdit(r)}
            onErase={(r) => onErase(r)}
            copyLinkPath={(r) => `/contacts?open=${r.id}`}
          >
            {rowNode}
          </ContactRowContextMenu>
        )}
      />

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
