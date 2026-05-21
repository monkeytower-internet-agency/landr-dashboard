// landr-kjls — Board (kanban) Layout renderer for a saved View.
//
// One column per enum value of the configured `boardConfig.columnBy`
// field. v1 only supports column-by=`current_stage` (the only enum
// field that maps to a known mutation endpoint); other enum fields
// surface a "supported in v1.x" placeholder so the operator at least
// sees why no columns rendered.
//
// Items use the shared View-layer BookingItem = BookingRow alias from
// views-bookings-data.ts (landr-9kbl). Filter / sort have already been
// applied by ViewPage's branch wrapper before items reach this layout.
//
// Cards are draggable across columns via @dnd-kit/core + sortable. On a
// successful drop:
//   - Optimistically move the card in local state.
//   - Call the parent's onItemMutate(itemId, fieldKey, newValue).
//   - Revert local state on rejection (the parent toasts the failure).
//
// Permission to drop is gated by `STAGE_TRANSITIONS` — for current_stage
// only the wired-up transitions (awaiting_general/hotel → confirmed |
// cancelled) accept drops. Disallowed columns render greyed-out with a
// tooltip explaining why.

import { useMemo, useState } from 'react'
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

import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { findField, valueLabel } from '@/lib/views-entity-fields'
import type { SavedViewWithState } from '@/lib/saved-views'
import { stageCode, type BookingRow } from '@/lib/bookings'
import type { BookingItem } from '@/lib/views-bookings-data'
import { t } from '@/lib/strings'

import { BoardColumn } from './BoardColumn'

export type BoardItemMutate = (
  itemId: string,
  fieldKey: string,
  newValue: string,
) => Promise<void>

type Props = {
  view: SavedViewWithState
  items: BookingItem[]
  onItemMutate: BoardItemMutate
}

// v1: only current_stage is a wired column-by. Listing it explicitly keeps
// the "only Stage is supported" placeholder honest — adding priority /
// product_kind here in v1.x is a one-line change once their mutations land.
const SUPPORTED_COLUMN_BY: ReadonlySet<string> = new Set(['current_stage'])

/**
 * Which stage transitions the existing approval endpoints can express.
 * Source: postGeneralApprovalDecision and postHotelApprovalDecision in
 * src/lib/bookings.ts (branch=general covers awaiting_general_approval;
 * branch=secondary covers awaiting_hotel_approval).
 * awaiting_secondary_approval has no dedicated endpoint in v1 — we leave
 * it un-actionable until one ships.
 */
const STAGE_TRANSITIONS: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'awaiting_general_approval', to: 'confirmed' },
  { from: 'awaiting_general_approval', to: 'cancelled' },
  { from: 'awaiting_hotel_approval', to: 'confirmed' },
  { from: 'awaiting_hotel_approval', to: 'cancelled' },
]

// eslint-disable-next-line react-refresh/only-export-components
export function isStageTransitionAllowed(
  from: string | null,
  to: string,
): boolean {
  if (from === to) return false
  if (from === null) return false
  return STAGE_TRANSITIONS.some((r) => r.from === from && r.to === to)
}

/**
 * Pure DnD drop resolver — extracted so tests can exercise the branching
 * without driving dnd-kit's pointer pipeline (which jsdom struggles with).
 *
 * Returns null when the drop should be ignored (no change, no source,
 * disallowed transition). Otherwise returns the mutate payload.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveBoardDrop(args: {
  activeId: string
  overId: string | null
  items: BookingItem[]
  columnBy: string
}): { itemId: string; fieldKey: string; newValue: string } | null {
  const { activeId, overId, items, columnBy } = args
  if (!overId) return null

  const dragged = items.find((it) => it.id === activeId)
  if (!dragged) return null

  const targetColumn = resolveTargetColumn(overId, items, columnBy)
  if (!targetColumn) return null

  const fromStage = readItemField(dragged, columnBy)
  if (fromStage === targetColumn) return null

  if (columnBy === 'current_stage') {
    if (!isStageTransitionAllowed(fromStage, targetColumn)) return null
  }

  return {
    itemId: activeId,
    fieldKey: columnBy,
    newValue: targetColumn,
  }
}

function readBoardConfigColumnBy(
  config: Record<string, unknown>,
): string | null {
  const bc = (config as { boardConfig?: { columnBy?: unknown } }).boardConfig
  const raw = bc?.columnBy
  return typeof raw === 'string' ? raw : null
}

export function BoardLayout({ view, items, onItemMutate }: Props) {
  const columnBy =
    readBoardConfigColumnBy(view.config) ?? 'current_stage'

  const field = findField(view.entity_type, columnBy)

  // Optimistic override map: itemId → patched BookingRow. Survives until a
  // refetched `items` arrives with the same stage (then we drop the entry
  // so the canonical row wins) or the mutate rejects (we drop it to
  // revert). Derived state pattern — no useEffect, no cascading renders.
  const [overrides, setOverrides] = useState<Record<string, BookingItem>>({})

  const localItems = useMemo<BookingItem[]>(() => {
    if (Object.keys(overrides).length === 0) return items
    return items.map((it) => overrides[it.id] ?? it)
  }, [items, overrides])

  // Drop stale overrides whose canonical value already matches.
  const stale = useMemo(() => {
    const out: string[] = []
    for (const [id, patched] of Object.entries(overrides)) {
      const canonical = items.find((it) => it.id === id)
      if (!canonical) {
        out.push(id) // item dropped from list
        continue
      }
      if (
        readItemField(canonical, columnBy) === readItemField(patched, columnBy)
      ) {
        out.push(id)
      }
    }
    return out
  }, [overrides, items, columnBy])
  if (stale.length > 0) {
    queueMicrotask(() => {
      setOverrides((prev) => {
        const next = { ...prev }
        for (const id of stale) delete next[id]
        return next
      })
    })
  }

  const [detailRow, setDetailRow] = useState<BookingRow | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // -------- column derivation --------
  //
  // Always use the field registry's enumValues as the canonical column
  // order — that way an empty stage still gets a column, and the order is
  // deterministic regardless of which stages currently have items.
  const columns = useMemo(() => {
    if (!field || field.type !== 'enum' || !field.enumValues) return []
    return field.enumValues.map((key) => ({
      key,
      label: valueLabel(view.entity_type, columnBy, key),
      items: localItems.filter(
        (it) => readItemField(it, columnBy) === key,
      ),
    }))
  }, [field, view.entity_type, columnBy, localItems])

  // -------- gating placeholders --------

  if (!field) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="board-layout-placeholder"
      >
        {t.views.body.board.unknownField(columnBy)}
      </p>
    )
  }

  if (field.type !== 'enum') {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="board-layout-placeholder"
      >
        {t.views.body.board.mustBeEnum}
      </p>
    )
  }

  if (!SUPPORTED_COLUMN_BY.has(columnBy)) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="board-layout-placeholder"
      >
        {t.views.body.board.unsupportedField(field.label)}
      </p>
    )
  }

  // -------- drag handling --------

  function handleDragEnd(event: DragEndEvent) {
    const drop = resolveBoardDrop({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      items: localItems,
      columnBy,
    })
    if (!drop) return

    const dragged = localItems.find((it) => it.id === drop.itemId)
    if (!dragged) return

    // Optimistic flip via overrides map; reverts cleanly on rejection.
    const patched = patchStage(dragged, drop.fieldKey, drop.newValue)
    setOverrides((prev) => ({ ...prev, [drop.itemId]: patched }))

    void onItemMutate(drop.itemId, drop.fieldKey, drop.newValue).catch(() => {
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[drop.itemId]
        return next
      })
    })
  }

  // -------- render --------

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div
          data-testid="board-layout"
          data-board-column-by={columnBy}
          className="flex gap-3 overflow-x-auto pb-2"
        >
          {columns.map((col) => {
            // For current_stage, decide whether THIS column is a valid drop
            // target. Without an active drag we can't know the source, so we
            // mark a column "potentially-disabled" only if NO source stage
            // can reach it — i.e. nothing in STAGE_TRANSITIONS lists it as
            // a `to`. That keeps the chrome accurate at rest while the real
            // per-drag gating runs in handleDragEnd.
            const canBeATarget =
              columnBy !== 'current_stage' ||
              STAGE_TRANSITIONS.some((r) => r.to === col.key)
            return (
              <BoardColumn
                key={col.key}
                columnKey={col.key}
                label={col.label}
                showStageChip={columnBy === 'current_stage'}
                items={col.items}
                onOpen={(it) => setDetailRow(it)}
                disabled={!canBeATarget}
                disabledReason={
                  canBeATarget ? null : t.views.body.board.disallowedTarget
                }
              />
            )
          })}
        </div>
      </DndContext>

      <BookingDetailSheet
        row={detailRow}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null)
        }}
      />
    </>
  )
}

// ---- internal helpers (no 'use' prefix per widget-no-use-prefix-on-helpers) -

/** Read a flat field off a BookingRow. Only handles the keys the Board
 *  layout actually column-by's on; everything else returns null so the
 *  caller can decide whether to bail or proceed. */
function readItemField(item: BookingItem, key: string): string | null {
  switch (key) {
    case 'current_stage':
      return stageCode(item)
    default:
      return null
  }
}

/** Resolve which column an over-id refers to — either a column droppable
 *  (`column:<key>`) or another sortable card whose current column we
 *  inherit. Returns null if the target can't be classified. */
function resolveTargetColumn(
  overId: string,
  items: BookingItem[],
  columnBy: string,
): string | null {
  if (overId.startsWith('column:')) {
    return overId.slice('column:'.length)
  }
  const overItem = items.find((it) => it.id === overId)
  return overItem ? readItemField(overItem, columnBy) : null
}

/** Apply an optimistic stage flip to a BookingRow. For now only
 *  current_stage is wired; other fields fall through unchanged. */
function patchStage(
  item: BookingItem,
  key: string,
  value: string,
): BookingItem {
  if (key === 'current_stage') {
    return { ...item, current_stage: { code: value } }
  }
  return item
}
