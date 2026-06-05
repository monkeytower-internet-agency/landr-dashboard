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

import { Fragment, useMemo, useState } from 'react'
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

// landr-4cwh — Secondary grouping (swimlanes). When set, the Board renders
// a 2D matrix: columns × swimlanes. Tolerates both string and null (the
// latter explicitly means "no swimlane"; same as missing key).
function readBoardConfigSwimlaneBy(
  config: Record<string, unknown>,
): string | null {
  const bc = (config as { boardConfig?: { swimlaneBy?: unknown } }).boardConfig
  const raw = bc?.swimlaneBy
  return typeof raw === 'string' ? raw : null
}

// landr-4cwh — Hard-cap distinct swimlane values pulled from `id`-typed
// fields so a pathological dataset (e.g. 200 distinct products) doesn't
// produce 200 swimlane rows. Enum fields always use their full enumValues.
const SWIMLANE_MAX_DISTINCT = 20

/** Read a swimlane group key off an item. Returns null when the value is
 *  missing (those items collect into a synthetic "no value" row). v1 only
 *  groups by current_stage / customer_id / product_id; other field keys
 *  fall through to null and the inline message in the layout warns. */
function readItemSwimlane(item: BookingItem, key: string): string | null {
  switch (key) {
    case 'current_stage':
      return stageCode(item)
    case 'current_semantic_state':
      return item.current_semantic_state ?? null
    case 'customer_id':
      return item.customer?.id ?? null
    case 'product_id': {
      const first = item.items[0]?.products?.id
      return typeof first === 'string' ? first : null
    }
    default:
      return null
  }
}

/** Derive a friendly label for a swimlane key. For enum fields we use the
 *  field registry's enumLabels; for id fields we fall back to the canonical
 *  display string read off the first matching item (customer name, product
 *  name, etc.). */
function swimlaneLabel(args: {
  entityType: string
  fieldKey: string
  swimlaneKey: string
  fieldType: string
  items: BookingItem[]
}): string {
  const { entityType, fieldKey, swimlaneKey, fieldType, items } = args
  if (fieldType === 'enum') {
    return valueLabel(entityType, fieldKey, swimlaneKey)
  }
  // id field — find an item whose grouping value matches, read its display.
  const match = items.find(
    (it) => readItemSwimlane(it, fieldKey) === swimlaneKey,
  )
  if (!match) return swimlaneKey
  switch (fieldKey) {
    case 'customer_id': {
      const c = match.customer
      if (!c) return swimlaneKey
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
      return name || c.email || swimlaneKey
    }
    case 'product_id': {
      const name = match.items[0]?.products?.name
      return typeof name === 'string' && name.length > 0 ? name : swimlaneKey
    }
    default:
      return swimlaneKey
  }
}

export function BoardLayout({ view, items, onItemMutate }: Props) {
  const columnBy =
    readBoardConfigColumnBy(view.config) ?? 'current_stage'
  const swimlaneBy = readBoardConfigSwimlaneBy(view.config)

  const field = findField(view.entity_type, columnBy)
  const swimlaneField =
    swimlaneBy !== null ? findField(view.entity_type, swimlaneBy) : null

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

  // -------- swimlane derivation (landr-4cwh) --------
  //
  // For enum fields we honour the registry order (so empty swimlanes are
  // still rendered for completeness). For id fields we derive distinct
  // values from the actual data (sorted, capped at SWIMLANE_MAX_DISTINCT).
  // A synthetic null bucket appears when at least one item has no value.
  const swimlanes = useMemo<
    { key: string | null; label: string; items: BookingItem[] }[]
  >(() => {
    if (!swimlaneBy || !swimlaneField) return []
    if (swimlaneField.type === 'enum' && swimlaneField.enumValues) {
      const out: { key: string | null; label: string; items: BookingItem[] }[] =
        swimlaneField.enumValues.map((key) => ({
          key,
          label: valueLabel(view.entity_type, swimlaneBy, key),
          items: localItems.filter(
            (it) => readItemSwimlane(it, swimlaneBy) === key,
          ),
        }))
      const nullItems = localItems.filter(
        (it) => readItemSwimlane(it, swimlaneBy) === null,
      )
      if (nullItems.length > 0) {
        out.push({ key: null, label: t.views.body.board.swimlaneEmptyCell, items: nullItems })
      }
      return out
    }
    // id (or any non-enum groupable) — derive distinct keys from data.
    const distinct = new Set<string>()
    let hasNull = false
    for (const it of localItems) {
      const k = readItemSwimlane(it, swimlaneBy)
      if (k === null) {
        hasNull = true
      } else {
        distinct.add(k)
      }
    }
    const keys = Array.from(distinct).sort().slice(0, SWIMLANE_MAX_DISTINCT)
    const out: { key: string | null; label: string; items: BookingItem[] }[] =
      keys.map((key) => ({
        key,
        label: swimlaneLabel({
          entityType: view.entity_type,
          fieldKey: swimlaneBy,
          swimlaneKey: key,
          fieldType: swimlaneField.type,
          items: localItems,
        }),
        items: localItems.filter(
          (it) => readItemSwimlane(it, swimlaneBy) === key,
        ),
      }))
    if (hasNull) {
      out.push({
        key: null,
        label: t.views.body.board.swimlaneEmptyCell,
        items: localItems.filter(
          (it) => readItemSwimlane(it, swimlaneBy) === null,
        ),
      })
    }
    return out
  }, [swimlaneBy, swimlaneField, view, localItems])

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

  // -------- swimlane validation (landr-4cwh) --------
  //
  // Swimlane gating is non-fatal: render the flat board AND a small inline
  // notice so the operator sees why their secondary grouping was ignored.
  // We deliberately don't `return` placeholders here — that would hide the
  // working columns and feel broken.
  const swimlaneError: string | null = (() => {
    if (!swimlaneBy) return null
    if (!swimlaneField) return t.views.body.board.swimlaneUnknownField(swimlaneBy)
    // Only enum + id fields are groupable for swimlanes. Other types
    // (text / date / number / boolean) yield too many distinct values or
    // don't carry a natural display label.
    if (swimlaneField.type !== 'enum' && swimlaneField.type !== 'id') {
      return t.views.body.board.swimlaneMustBeGroupable
    }
    return null
  })()
  const renderAsMatrix = swimlaneBy !== null && swimlaneError === null

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
      {swimlaneError ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="board-swimlane-warning"
        >
          {swimlaneError}
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        {renderAsMatrix ? (
          // landr-4cwh — 2D matrix: header row of columns × left column of
          // swimlanes. Each cell is a BoardColumn keyed by `${col}::${lane}`
          // — that keeps DnD ids unique across the grid (drop targets like
          // `column:confirmed` would collide otherwise) while reusing the
          // same column chrome the flat board ships with.
          // landr-3qkr.5 — horizontal scroll with snap + edge-fade affordance.
          // mask-image fades the right edge so the user sees content continues.
          <div
            data-testid="board-layout"
            data-board-column-by={columnBy}
            data-board-swimlane-by={swimlaneBy ?? undefined}
            className="overflow-x-auto pb-2 snap-x snap-mandatory [mask-image:linear-gradient(to_right,black_85%,transparent_100%)]"
          >
            <div
              role="grid"
              className="inline-grid gap-3"
              style={{
                gridTemplateColumns: `minmax(8rem, max-content) repeat(${columns.length}, minmax(0, max-content))`,
              }}
            >
              {/* Header row: empty corner + one cell per column. */}
              <div role="columnheader" aria-hidden="true" />
              {columns.map((col) => (
                <div
                  key={`hdr-${col.key}`}
                  role="columnheader"
                  data-testid={`board-matrix-header-${col.key}`}
                  className="text-muted-foreground px-1 text-xs font-medium"
                >
                  {col.label}
                </div>
              ))}

              {/* Body rows: swimlane label + one BoardColumn per (col, lane). */}
              {swimlanes.map((lane) => {
                const laneKeyAttr = lane.key ?? '__null__'
                return (
                  <Fragment key={`lane-${laneKeyAttr}`}>
                    <div
                      role="rowheader"
                      data-testid={`board-swimlane-${laneKeyAttr}`}
                      className="text-muted-foreground self-start px-1 pt-3 text-xs font-medium"
                    >
                      {lane.label}
                    </div>
                    {columns.map((col) => {
                      const cellItems = col.items.filter((it) =>
                        lane.key === null
                          ? readItemSwimlane(it, swimlaneBy!) === null
                          : readItemSwimlane(it, swimlaneBy!) === lane.key,
                      )
                      const canBeATarget =
                        columnBy !== 'current_stage' ||
                        STAGE_TRANSITIONS.some((r) => r.to === col.key)
                      return (
                        <div
                          key={`cell-${col.key}-${laneKeyAttr}`}
                          role="gridcell"
                          data-testid={`board-cell-${col.key}-${laneKeyAttr}`}
                        >
                          <BoardColumn
                            columnKey={`${col.key}::${laneKeyAttr}`}
                            label={col.label}
                            showStageChip={false}
                            hideHeader
                            items={cellItems}
                            onOpen={(it) => setDetailRow(it)}
                            disabled={!canBeATarget}
                            disabledReason={
                              canBeATarget
                                ? null
                                : t.views.body.board.disallowedTarget
                            }
                          />
                        </div>
                      )
                    })}
                  </Fragment>
                )
              })}
            </div>
          </div>
        ) : (
          /* landr-3qkr.5 — horizontal scroll with snap + edge-fade affordance. */
          <div
            data-testid="board-layout"
            data-board-column-by={columnBy}
            className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory [mask-image:linear-gradient(to_right,black_85%,transparent_100%)]"
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
        )}
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
 *  inherit. Returns null if the target can't be classified.
 *
 *  landr-4cwh — in matrix (swimlane) mode cells use compound keys like
 *  `column:confirmed::__null__`; strip the `::<lane>` suffix so the column
 *  key alone is what feeds the transition gate. */
function resolveTargetColumn(
  overId: string,
  items: BookingItem[],
  columnBy: string,
): string | null {
  if (overId.startsWith('column:')) {
    const raw = overId.slice('column:'.length)
    const sepAt = raw.indexOf('::')
    return sepAt === -1 ? raw : raw.slice(0, sepAt)
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
