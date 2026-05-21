/**
 * Small color chip rendering an operator tag (landr-iz58).
 *
 * The chip uses the tag's stored hex color as background and picks
 * black/white text via WCAG luminance so it stays readable on any hue.
 * Optional onRemove turns the chip into a removable pill (×) — used
 * inside the TagPicker's selected-set strip.
 */
import { X } from 'lucide-react'
import type { Tag } from '@/lib/tags'
import { readableTextOn } from '@/lib/tags'

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
  const fg = readableTextOn(tag.color)
  const padding = size === 'sm' ? 'px-1.5 py-0' : 'px-2 py-0.5'
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs'
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-medium ${padding} ${text}`}
      style={{ backgroundColor: tag.color, color: fg }}
      data-testid={testId ?? `tag-chip-${tag.id}`}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-black/15"
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
