// landr-kjls — single Board column (droppable, holds N BoardCards).
//
// One column per enum value of the configured column-by field. Wrapped
// in a useDroppable so an empty column still accepts drops (the
// sortable items inside a non-empty column are themselves droppable
// targets, so cross-column moves work either way).

import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { ReactNode } from 'react'

import { StageChip } from '@/components/approvals/StageChip'
import type { BookingItem } from '@/lib/views-bookings-data'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

import { BoardCard } from './BoardCard'

type Props = {
  /** Column key — the enum value of the configured column-by field. */
  columnKey: string
  /** Visible label (enum-label fallback to humanised key). */
  label: string
  /** True if this column-by is the `current_stage` field — show StageChip. */
  showStageChip: boolean
  items: BookingItem[]
  onOpen: (item: BookingItem) => void
  /** Whether dropping onto this column is currently allowed. */
  disabled?: boolean
  /** Tooltip / aria hint when disabled. */
  disabledReason?: string | null
  emptyLabel?: string
  /** Slot for any custom column-header element. */
  headerExtra?: ReactNode
}

export function BoardColumn({
  columnKey,
  label,
  showStageChip,
  items,
  onOpen,
  disabled = false,
  disabledReason = null,
  emptyLabel,
  headerExtra,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${columnKey}`,
    data: { columnKey },
    disabled,
  })

  return (
    <div
      data-testid={`board-column-${columnKey}`}
      data-board-column={columnKey}
      data-board-column-disabled={disabled || undefined}
      className={cn(
        'bg-muted/40 flex w-72 shrink-0 flex-col gap-2 rounded-md p-3',
        isOver && !disabled && 'ring-primary/50 ring-2',
        disabled && 'opacity-60',
      )}
      title={disabled ? disabledReason ?? undefined : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {showStageChip ? (
            <StageChip code={columnKey} />
          ) : (
            <span className="truncate text-sm font-medium">{label}</span>
          )}
          <span className="text-muted-foreground text-xs">{items.length}</span>
        </div>
        {headerExtra}
      </div>

      <SortableContext
        items={items.map((it) => it.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="flex min-h-16 flex-col gap-2"
          data-testid={`board-column-drop-${columnKey}`}
        >
          {items.length === 0 ? (
            <p
              className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-xs"
              data-testid={`board-column-empty-${columnKey}`}
            >
              {emptyLabel ?? t.views.body.board.emptyColumn}
            </p>
          ) : (
            items.map((it) => (
              <BoardCard key={it.id} item={it} onOpen={onOpen} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
