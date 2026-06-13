// landr-wwhn.11 — /tickets kanban board route.
// landr-wwhn.22 — assignee chips on cards; fetches assignable_users once.
// landr-wwhn.31 — staff-only operator filter chip.
// landr-7dya.5  — Trello-style tilt-on-drag via DragOverlay.
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
//   * landr-wwhn.31: staff can override the scoped operator via a filter chip
//     on the board. The chip persists as local state (session-only; for
//     persistent cross-operator views use the saved-views ticket board).
//
// landr-wwhn.15 — click-through from the notification bell: navigate to
// /tickets?open=<ticketId> to auto-open the detail sheet for that ticket.
// The board reads the `open` search param on mount, waits for the tickets
// query to settle, and calls setOpenTicket when the row is found.

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useQuery } from '@tanstack/react-query'

import { TicketIcon } from 'lucide-react'
import { PageTitle } from '@/lib/page-title'
import { useOperator } from '@/lib/operator'
import { useEntitlements } from '@/lib/entitlements'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { EmptyState } from '@/components/EmptyState'
import { EmptyTickets } from '@/components/illustrations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/lib/strings'
import {
  TICKET_COLUMNS,
  fetchAssignableUsers,
  fetchTickets,
  patchTicketStatus,
  resolveTicketDrop,
  type AssignableUser,
  type TicketRow,
  type TicketStatus,
} from '@/lib/tickets'
import { TicketBoardColumn } from '@/components/tickets/TicketBoardColumn'
import { TicketCard } from '@/components/tickets/TicketCard'
import type { OriginTier } from '@/components/tickets/CardVisuals'
import { TicketDetailSheet } from '@/components/tickets/TicketDetailSheet'
import { useTicketFilter } from '@/lib/ticket-filter-context'

// ---- component --------------------------------------------------------------

export function TicketBoard() {
  const { currentOperatorId, staffOperators } = useOperator()
  const { effectiveIsStaff } = useEntitlements()
  const [searchParams, setSearchParams] = useSearchParams()

  // landr-7dya.11 — shell-level shared filter. When this board is rendered
  // INSIDE the ticket-system app-view, useTicketFilter() returns the live
  // shell filter; when rendered standalone (operator-chrome /tickets) it
  // returns a no-op fallback whose `matches` passes everything.
  const { matches: filterMatches } = useTicketFilter()

  // landr-wwhn.31 — staff-only operator filter (local, session state).
  // null = use currentOperatorId (default). Set to a specific operator ID to
  // scope the board to that operator's tickets. This state is cleared when the
  // component unmounts; for persistent cross-operator views use saved views.
  const [filterOperatorId, setFilterOperatorId] = useState<string | null>(null)

  // Resolve the effective operator ID: staff can override via the picker;
  // everyone else (and staff with no override) uses currentOperatorId.
  const effectiveQueryOperatorId =
    effectiveIsStaff && filterOperatorId !== null
      ? filterOperatorId
      : currentOperatorId

  // landr-wwhn.13 — detail sheet state
  const [openTicket, setOpenTicket] = useState<TicketRow | null>(null)

  // landr-7dya.5 — track the active (dragged) ticket so the DragOverlay can
  // render a tilted clone.  Cleared in handleDragEnd (covers both drop and
  // cancel paths since dnd-kit always fires dragEnd).
  const [activeTicket, setActiveTicket] = useState<TicketRow | null>(null)

  const query = useRealtimeQuery<TicketRow[]>({
    queryKey: ['tickets', effectiveQueryOperatorId ?? 'none'],
    queryFn: () => fetchTickets(effectiveQueryOperatorId as string),
    enabled: !!effectiveQueryOperatorId,
    realtime: effectiveQueryOperatorId
      ? {
          table: 'tickets',
          filter: `operator_id=eq.${effectiveQueryOperatorId}`,
        }
      : null,
  })

  // landr-wwhn.22 — fetch assignable users once for card chips.
  // Stale for 5 min; error is silently ignored (chips just won't render).
  const assignableQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000,
  })
  // Build a lookup map: users.id → AssignableUser for O(1) card-level access.
  const assigneeMap = useMemo<Map<string, AssignableUser>>(() => {
    const map = new Map<string, AssignableUser>()
    for (const u of assignableQuery.data ?? []) {
      map.set(u.id, u)
    }
    return map
  }, [assignableQuery.data])

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

  // landr-wwhn.15 — auto-open the detail sheet when arriving via
  // /tickets?open=<ticketId> (clicked from the notification bell).
  // We wait until the tickets query has settled so we can find the row.
  // After opening, strip the param to keep the URL clean. The setState
  // calls go through queueMicrotask so the effect body stays side-effect-free
  // per the react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const ticketId = searchParams.get('open')
    if (!ticketId || query.isPending) return
    const found = tickets.find((t) => t.id === ticketId)
    if (!found) return
    queueMicrotask(() => {
      setOpenTicket(found)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('open')
          return next
        },
        { replace: true },
      )
    })
  }, [searchParams, setSearchParams, tickets, query.isPending])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // landr-7dya.5 — set activeTicket so the DragOverlay knows what to render.
  function handleDragStart(event: DragStartEvent) {
    const ticket = localTickets.find((t) => t.id === String(event.active.id))
    setActiveTicket(ticket ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    // landr-7dya.5 — clear overlay regardless of whether the drop was valid.
    setActiveTicket(null)

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

  // landr-7dya.11 — apply the shared shell filter to the board rows. The board
  // loads the PUBLIC tickets row (no severity / origin_tier); the predicate
  // skips facets whose field the row doesn't carry, so a severity/tier filter
  // never wrongly empties the board.
  const visibleTickets = useMemo(
    () => localTickets.filter((t) => filterMatches(t)),
    [localTickets, filterMatches],
  )

  const columns = useMemo(() => {
    return TICKET_COLUMNS.map((col) => ({
      ...col,
      items: visibleTickets.filter((t) => t.status === col.key),
    }))
  }, [visibleTickets])

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

  const totalCount = visibleTickets.length

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

      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Tickets</h1>
        </div>
        {/* Operator filter chips — staff-only (landr-wwhn.31) */}
        {effectiveIsStaff && staffOperators.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="ticket-board-operator-filter"
            aria-label="Filter by operator"
          >
            <span className="text-muted-foreground text-xs">Operator:</span>
            {staffOperators.map((op) => {
              const active = filterOperatorId === op.id
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() =>
                    setFilterOperatorId(active ? null : op.id)
                  }
                  data-testid={`ticket-operator-filter-${op.id}`}
                  data-active={active || undefined}
                  aria-pressed={active}
                  className={
                    active
                      ? 'border-primary bg-primary text-primary-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium'
                      : 'border-input text-muted-foreground hover:border-foreground/40 rounded-full border bg-transparent px-2.5 py-0.5 text-xs font-medium transition-colors'
                  }
                >
                  {op.name ?? op.slug}
                </button>
              )
            })}
            {filterOperatorId !== null ? (
              <button
                type="button"
                onClick={() => setFilterOperatorId(null)}
                data-testid="ticket-operator-filter-clear"
                className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* landr-hxnb.5 — comic empty state when no tickets exist at all. */}
      {!query.isPending && localTickets.length === 0 ? (
        <EmptyState
          icon={TicketIcon}
          illustration={<EmptyTickets className="h-full w-full" />}
          accentHue="comms"
          title={t.emptyStates.tickets.title}
          description={t.emptyStates.tickets.description}
          data-testid="tickets-empty-state"
        />
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
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
                onOpen={(ticket) => setOpenTicket(ticket)}
                readMostly={col.readMostly}
                assigneeMap={assigneeMap}
              />
            ))
          )}
        </div>

        {/* landr-7dya.5 — DragOverlay renders a floating tilted clone of the
            dragged card. The tilt/scale/shadow are applied inside TicketCard
            when isDragOverlay=true (and suppressed by useReducedMotion). */}
        <DragOverlay>
          {activeTicket ? (
            <TicketCard
              ticket={activeTicket}
              onOpen={() => {
                /* overlay clone is non-interactive */
              }}
              assignee={
                activeTicket.assignee_id
                  ? (assigneeMap.get(activeTicket.assignee_id) ?? null)
                  : null
              }
              originTier={
                activeTicket.origin_tier as OriginTier | undefined
              }
              originOperatorLabel={activeTicket.origin_operator_label}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* landr-wwhn.13 — detail sheet, opened on card click */}
      <TicketDetailSheet
        ticket={openTicket}
        onOpenChange={(open) => {
          if (!open) setOpenTicket(null)
        }}
      />
    </div>
  )
}

export default TicketBoard
