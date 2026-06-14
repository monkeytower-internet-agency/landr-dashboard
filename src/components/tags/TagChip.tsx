/**
 * Small color chip rendering an operator tag (landr-iz58).
 *
 * hxnb.6 — Dense-ops restraint pass. The chip no longer fills with the
 * operator's color (which read as loud blobs in dense tables). Instead:
 *   • Calm neutral background (surface-dense-subtle) keeps tables quiet.
 *   • A 3px left border uses the tag color as an accent stripe — the color
 *     is still immediately visible and scannable.
 *   • A small color dot (aria-hidden) precedes the name in the 'md' size
 *     for quick color identification without full-fill saturation.
 *   • Text stays in foreground (not forced black/white on saturated hue).
 *
 * This approach works for any operator-chosen color and is dark-mode safe
 * because the background token flips automatically.
 *
 * Optional onRemove turns the chip into a removable pill (×) — used
 * inside the TagPicker's selected-set strip.
 */
import { X } from 'lucide-react'
import type { Tag } from '@/lib/tags'

type Props = {
  tag: Pick<Tag, 'id' | 'name' | 'color'>
  /** When set, the chip renders an inline × button that fires this callback. */
  onRemove?: () => void
  /** Used for stable test selectors. */
  testId?: string
  /** Slightly smaller variant for table cells where vertical room is tight. */
  size?: 'sm' | 'md'
}

export function TagChip({ tag, onRemove, testId, size = 'md' }: Props) {
  const padding = size === 'sm' ? 'px-1.5 py-0' : 'px-2 py-0.5'
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs'
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-sm font-medium ${padding} ${text} text-foreground`}
      style={{
        backgroundColor: 'var(--surface-dense-subtle)',
        borderLeft: `3px solid ${tag.color}`,
      }}
      data-testid={testId ?? `tag-chip-${tag.id}`}
      title={tag.name}
    >
      {size === 'md' ? (
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: tag.color }}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-foreground/10"
          aria-label={`Remove tag ${tag.name}`}
          data-testid={`${testId ?? `tag-chip-${tag.id}`}-remove`}
        >
          <X className="h-2.5 w-2.5" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

// ---- inline row helper -----------------------------------------------

type RowProps = {
  tags: ReadonlyArray<Pick<Tag, 'id' | 'name' | 'color'>>
  /** Truncate after N chips and show "+rest more". */
  maxVisible?: number
  size?: 'sm' | 'md'
  testIdPrefix?: string
}

/** Inline row of TagChips. Truncates at maxVisible (default 2) and shows
 *  a "+N more" muted token so list cells stay compact. */
export function TagChipRow({
  tags,
  maxVisible = 2,
  size = 'sm',
  testIdPrefix = 'tag-row',
}: RowProps) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  const visible = tags.slice(0, maxVisible)
  const rest = tags.length - visible.length
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={testIdPrefix}>
      {visible.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          size={size}
          testId={`${testIdPrefix}-${tag.id}`}
        />
      ))}
      {rest > 0 ? (
        <span
          className="text-muted-foreground text-[10px]"
          data-testid={`${testIdPrefix}-rest`}
        >
          +{rest} more
        </span>
      ) : null}
    </div>
  )
}
