// landr-kjls — single Board card (draggable, click-to-open-detail).
//
// Owns the @dnd-kit/sortable hook for one BookingItem (BookingRow). Compact
// rendering: customer name, product, total, date. Click opens the
// BookingDetailSheet via the parent's onOpen callback.
//
// We deliberately keep this presentation-only — no fetching, no mutation.
// The parent column dispatches reorders by listening to the surrounding
// DndContext's onDragEnd.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'

import {
  customerDisplay,
  priceDisplay,
  productDisplay,
  type BookingRow,
} from '@/lib/bookings'
import type { BookingItem } from '@/lib/views-bookings-data'
import { cn } from '@/lib/utils'

type Props = {
  item: BookingItem
  onOpen: (item: BookingItem) => void
}

const dateFormatter = new Intl.DateTimeFormat('en-IE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** Earliest item.date_range_start across a booking, or null. */
function earliestStart(row: BookingRow): string | null {
  let best: string | null = null
  for (const it of row.items) {
    const s = it.date_range_start
    if (!s) continue
    if (best === null || s < best) best = s
  }
  return best
}

function dateLine(item: BookingItem): string | null {
  const s = earliestStart(item)
  if (!s) return null
  // ISO YYYY-MM-DD — anchor at UTC noon so the weekday stays stable.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
    if (!Number.isNaN(date.getTime())) return dateFormatter.format(date)
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return dateFormatter.format(d)
}

export function BoardCard({ item, onOpen }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { itemId: item.id },
  })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  const date = dateLine(item)

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={() => onOpen(item)}
      data-testid={`board-card-${item.id}`}
      data-board-card="true"
      className={cn(
        'border-input bg-card text-card-foreground flex w-full flex-col gap-1 rounded-md border p-3 text-left text-xs shadow-sm transition-shadow',
        'hover:border-foreground/30 hover:shadow-md',
        'focus-visible:outline-2 focus-visible:outline-ring',
        isDragging && 'opacity-60 shadow-lg',
      )}
      {...attributes}
      {...listeners}
    >
      <span className="text-sm font-medium leading-tight">
        {customerDisplay(item)}
      </span>
      <span className="text-muted-foreground truncate">
        {productDisplay(item)}
      </span>
      <div className="text-muted-foreground mt-1 flex items-center justify-between gap-2">
        <span className="text-foreground font-medium">
          {priceDisplay(item)}
        </span>
        {date ? <span className="whitespace-nowrap">{date}</span> : null}
      </div>
    </button>
  )
}
