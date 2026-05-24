// landr-wwhn.11 — /tickets kanban board route.
//
// Five columns: backlog → ready → in_progress → in_review → done.
//
// Drag semantics:
//   * Human-owned (backlog, ready): drag between these two columns is allowed.
//     Operators groom the left side; anything they drag to a bd-authoritative
//     column is rejected (the column is disabled as a drop target).
//   * bd-authoritative (in_progress, in_review, done): read-mostly.
//     The board reflects bd state; operators cannot drag INTO these columns.
//     "auto" label in the column header explains why.
//
// `blocked` = orthogonal badge on the card, NOT a separate column.
//
// Realtime: one subscription per tickets row — invalidates TanStack Query
// cache on any INSERT/UPDATE/DELETE so the board stays live.
//
// RLS:
//   * Operators: own-org tickets from `tickets` table.
//   * Staff (is_landr_staff): cross-tenant via `tickets_staff` view.
//     The query is still operator-scoped for staff (they pick an org from
//     the dropdown) UNLESS currentOperatorId is null (super-admin triage
//     flow, not yet surfaced in the UI — returns empty for now).

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

import { PageTitle } from '@/lib/page-title'
import { useOperator } from '@/lib/operator'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DRAGGABLE_STATUSES,
  TICKET_COLUMNS,
  fetchTickets,
  patchTicketStatus,
  type TicketRow,
  type TicketStatus,
} from '@/lib/tickets'
import { TicketBoardColumn } from '@/components/tickets/TicketBoardColumn'

// ---- drop resolution --------------------------------------------------------

/**
 * Pure drop resolver — extracted for testability.
 *
 * Returns null when the drop should be ignored (same column, no source item,
 * or the target column is not in DRAGGABLE_STATUSES — i.e. bd-authoritative).
 * Otherwise returns { ticketId, newStatus }.
 */
export function resolveTicketDrop(args: {
  activeId: string
  overId: string | null
  tickets: TicketRow[]
}): { ticketId: string; newStatus: TicketStatus } | null {
  const { activeId, overId, tickets } = args
  if (!overId) return null

  const dragged = tickets.find((t) => t.id === activeId)
  if (!dragged) return null

  // Resolve target column key from:
  //   - a column droppable id: `column:<status>`
  //   - a sortable card id: look up the card's current status
  let targetStatus: TicketStatus | null = null
  if (overId.startsWith('column:')) {
    const raw = overId.slice('column:'.length) as TicketStatus
    targetStatus = raw
  } else {
    const overTicket = tickets.find((t) => t.id === overId)
    targetStatus = overTicket?.status ?? null
  }

  if (!targetStatus) return null
  if (targetStatus === dragged.status) return null

  // Guard: only allow drops into human-owned (DRAGGABLE_STATUSES) columns.
  if (!DRAGGABLE_STATUSES.has(targetStatus)) return null

  // Guard: only allow drags FROM human-owned columns (shouldn't happen since
  // those cards have disabled:true on useSortable, but belt-and-suspenders).
  if (!DRAGGABLE_STATUSES.has(dragged.status)) return null

  return { ticketId: activeId, newStatus: targetStatus }
}

// ---- component --------------------------------------------------------------

export function TicketBoard() {
  const { currentOperatorId } = useOperator()

  const query = useRealtimeQuery<TicketRow[]>({
    queryKey: ['tickets', currentOperatorId ?? 'none'],
    queryFn: () => fetchTickets(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'tickets',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  const tickets = useMemo(() => query.data ?? [], [query.data])

  // Optimistic override map: ticketId → patched status. Clears when the
  // canonical refetch arrives with matching status (or on mutation failure).
  const [overrides, setOverrides] = useState<Record<string, TicketStatus>>({})

  // Drop stale overrides whose canonical status matches the optimistic one.
  const localTickets = useMemo<TicketRow[]>(() => {
    if (Object.keys(overrides).length === 0) return tickets
    return tickets.map((t) =>
      overrides[t.id] !== undefined ? { ...t, status: overrides[t.id] } : t,
    )
  }, [tickets, overrides])

  // Prune overrides once the canonical row catches up.
  useMemo(() => {
    for (const [id, status] of Object.entries(overrides)) {
      const canonical = tickets.find((t) => t.id === id)
      if (!canonical || canonical.status === status) {
        // prune via queueMicrotask to avoid setState-in-render
        queueMicrotask(() => {
          setOverrides((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        })
      }
    }
  }, [tickets, overrides])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const drop = resolveTicketDrop({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      tickets: localTickets,
    })
    if (!drop) return

    const { ticketId, newStatus } = drop

    // Optimistic update
    setOverrides((prev) => ({ ...prev, [ticketId]: newStatus }))

    void patchTicketStatus(ticketId, newStatus).catch((err: Error) => {
      // Revert optimistic override on failure
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[ticketId]
        return next
      })
      toast.error(`Could not update ticket: ${err.message}`)
    })
  }

  const columns = useMemo(() => {
    return TICKET_COLUMNS.map((col) => ({
      ...col,
      items: localTickets.filter((t) => t.status === col.key),
    }))
  }, [localTickets])

  // ---- render ----

  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle title="Tickets" />
        <header>
          <h1 className="text-xl font-semibold">Tickets</h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Failed to load tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error instanceof Error ? query.error.message : ''}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalCount = localTickets.length

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Tickets"
        subtitle={
          query.isPending
            ? undefined
            : `${totalCount} ticket${totalCount === 1 ? '' : 's'}`
        }
      />

      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Tickets</h1>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div
          data-testid="ticket-board"
          className="flex gap-3 overflow-x-auto pb-4"
        >
          {query.isPending ? (
            // Skeleton columns while loading
            TICKET_COLUMNS.map((col) => (
              <div
                key={col.key}
                data-testid={`ticket-board-column-skeleton-${col.key}`}
                className="bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-md p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-muted h-4 w-20 animate-pulse rounded" />
                  <span className="bg-muted h-3 w-4 animate-pulse rounded" />
                </div>
                <div className="flex min-h-16 flex-col gap-2">
                  {Array.from({ length: 2 }, (_, i) => (
                    <div
                      key={i}
                      className="bg-muted h-20 animate-pulse rounded-md"
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            columns.map((col) => (
              <TicketBoardColumn
                key={col.key}
                columnKey={col.key}
                label={col.label}
                items={col.items}
                onOpen={(_ticket) => {
                  // landr-wwhn.13 will mount a TicketDetailSheet here.
                  // No-op for now — the card is still clickable and
                  // focusable for accessibility; the detail sheet ships
                  // with the next slice.
                }}
                readMostly={col.readMostly}
              />
            ))
          )}
        </div>
      </DndContext>
    </div>
  )
}

export default TicketBoard
