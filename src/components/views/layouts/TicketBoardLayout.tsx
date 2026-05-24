// landr-wwhn.17 — Ticket board as a View layout.
//
// Slots into the ViewPage LayoutBody switch the same way BoardLayout /
// CalendarLayout do for bookings. Receives pre-fetched and pre-filtered
// TicketRow items; owns the DnD kanban rendering and optimistic status flips.
//
// The filter/fetch plumbing lives in ViewPage's TicketBoardLayoutBranch (same
// pattern as BoardLayoutBranch / TableLayoutBranch) so this component stays a
// pure renderer: props in, render out.
//
// Label/area filter bar appears above the columns when the view config has
// ticketConfig.labelAreas set or when the operator toggles it from the
// ViewTicketToolbar.

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
import {
  TICKET_COLUMNS,
  patchTicketStatus,
  resolveTicketDrop,
  type TicketRow,
  type TicketStatus,
} from '@/lib/tickets'
import { TicketBoardColumn } from '@/components/tickets/TicketBoardColumn'
import {
  TICKET_LABEL_AREAS,
  readTicketConfigLabelAreas,
  type TicketLabelArea,
} from '@/lib/tickets-views-data'
import type { SavedViewWithState } from '@/lib/saved-views'

type Props = {
  view: SavedViewWithState
  items: TicketRow[]
  onConfigChange: (config: Record<string, unknown>) => void
}

export function TicketBoardLayout({ view, items, onConfigChange }: Props) {
  // Optimistic override map: ticketId → patched TicketStatus.
  const [overrides, setOverrides] = useState<Record<string, TicketStatus>>({})

  // Apply optimistic overrides then drop stale entries.
  const localItems = useMemo<TicketRow[]>(() => {
    if (Object.keys(overrides).length === 0) return items
    return items.map((t) =>
      overrides[t.id] !== undefined ? { ...t, status: overrides[t.id] } : t,
    )
  }, [items, overrides])

  // Prune stale overrides when canonical row catches up.
  const staleIds = useMemo(() => {
    const out: string[] = []
    for (const [id, status] of Object.entries(overrides)) {
      const canonical = items.find((t) => t.id === id)
      if (!canonical || canonical.status === status) out.push(id)
    }
    return out
  }, [items, overrides])
  if (staleIds.length > 0) {
    queueMicrotask(() => {
      setOverrides((prev) => {
        const next = { ...prev }
        for (const id of staleIds) delete next[id]
        return next
      })
    })
  }

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
      tickets: localItems,
    })
    if (!drop) return
    const { ticketId, newStatus } = drop

    setOverrides((prev) => ({ ...prev, [ticketId]: newStatus }))

    void patchTicketStatus(ticketId, newStatus).catch((err: Error) => {
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[ticketId]
        return next
      })
      toast.error(`Could not update ticket: ${err.message}`)
    })
  }

  // ---- label / area filter bar -------------------------------------------

  const activeAreas = readTicketConfigLabelAreas(view.config)

  function toggleArea(area: TicketLabelArea) {
    const prev = activeAreas
    const next = prev.includes(area)
      ? prev.filter((a) => a !== area)
      : [...prev, area]
    const tc = ((view.config as { ticketConfig?: Record<string, unknown> }).ticketConfig) ?? {}
    onConfigChange({
      ...view.config,
      ticketConfig: { ...tc, labelAreas: next },
    })
  }

  // ---- column groups ---------------------------------------------------------

  const columns = useMemo(() => {
    return TICKET_COLUMNS.map((col) => ({
      ...col,
      items: localItems.filter((t) => t.status === col.key),
    }))
  }, [localItems])

  // ---- render ----------------------------------------------------------------

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="ticket-board-view-layout"
    >
      {/* Label / area filter chips */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="ticket-board-label-filter"
        aria-label="Filter by area"
      >
        <span className="text-muted-foreground text-xs">Area:</span>
        {TICKET_LABEL_AREAS.map((area) => {
          const active = activeAreas.includes(area)
          return (
            <button
              key={area}
              type="button"
              onClick={() => toggleArea(area)}
              data-testid={`ticket-area-filter-${area}`}
              data-active={active || undefined}
              aria-pressed={active}
              className={
                active
                  ? 'border-primary bg-primary text-primary-foreground rounded-full border px-2.5 py-0.5 text-xs font-medium'
                  : 'border-input text-muted-foreground hover:border-foreground/40 rounded-full border bg-transparent px-2.5 py-0.5 text-xs font-medium transition-colors'
              }
            >
              {area}
            </button>
          )
        })}
        {activeAreas.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              const tc = ((view.config as { ticketConfig?: Record<string, unknown> }).ticketConfig) ?? {}
              onConfigChange({
                ...view.config,
                ticketConfig: { ...tc, labelAreas: [] },
              })
            }}
            data-testid="ticket-area-filter-clear"
            className="text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div
          data-testid="ticket-board-view-columns"
          className="flex gap-3 overflow-x-auto pb-4"
        >
          {columns.map((col) => (
            <TicketBoardColumn
              key={col.key}
              columnKey={col.key}
              label={col.label}
              items={col.items}
              onOpen={() => {
                // landr-wwhn.13 will wire the detail sheet here.
              }}
              readMostly={col.readMostly}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
