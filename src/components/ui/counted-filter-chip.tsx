// landr-knz3 — reusable filter chip with a count badge.
//
// Renders as 'Label (N)'. When N=0:
//   - button is `disabled` (native attribute → click no-op, focus skipped)
//   - reduced opacity (via the Button variant's built-in disabled style)
//   - tooltip via native `title` attribute (no TooltipProvider needed)
//
// Designed for any filter surface in the dashboard. Today used by
// ContactsFilters (4 type chips) and BookingsFilters (per-option chips
// inside each dimension popover).

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type CountedFilterChipProps = {
  /** Visible label, e.g. 'Customer' or 'Tandem'. */
  label: string
  /** Match count; when 0 the chip is disabled. */
  count: number
  /** Selected (active filter) — controls visual state. */
  selected: boolean
  /** Toggle handler; not called when count=0. */
  onToggle: () => void
  /** Accessible name override (falls back to "{label} ({count})"). */
  ariaLabel?: string
  /** Tooltip shown when count=0 (defaults to 'No items of this type'). */
  disabledTooltip?: string
  /** Optional explanation surfaced as a shadcn Tooltip on hover / focus
   *  when the chip is enabled (landr-12ux). Use this for chips whose
   *  label is jargon — e.g. approval-branch buckets like "Operator
   *  review" — so the operator can hover for a one-line definition. */
  explanation?: string | null
  /** Test id forwarded to the underlying button. */
  testId?: string
  /** Extra classes merged onto the button. */
  className?: string
}

/**
 * A small chip-style filter button with a count badge.
 *
 * Pattern: every filter chip across the dashboard should render its match
 * count in the label and disable itself when nothing matches, so operators
 * can see at a glance which dimensions are empty rather than clicking and
 * discovering an empty list.
 */
export function CountedFilterChip({
  label,
  count,
  selected,
  onToggle,
  ariaLabel,
  disabledTooltip = 'No items of this type',
  explanation,
  testId,
  className,
}: CountedFilterChipProps) {
  const disabled = count === 0
  const display = `${label} (${count})`
  const computedAriaLabel = ariaLabel ?? display

  const button = (
    <Button
      type="button"
      size="sm"
      variant={selected ? 'default' : 'outline'}
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={computedAriaLabel}
      // landr-12ux — keep the disabled-state native title (existing
      // tests assert on it); enabled chips with an `explanation` also
      // get the same string as a native title so keyboard / a11y users
      // see it without the shadcn Tooltip's hover requirement.
      title={
        disabled
          ? disabledTooltip
          : explanation
            ? explanation
            : undefined
      }
      data-testid={testId}
      data-count={count}
      className={cn('h-7 px-2 text-xs', selected && 'shadow-sm', className)}
    >
      {display}
    </Button>
  )

  if (disabled || !explanation) return button

  // landr-12ux — wrap the button in an inline-flex span so Radix
  // Tooltip's `data-state` (open/closed) lands on the wrapper instead
  // of clobbering any data-* attributes future callers may attach
  // directly to the button.
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-balance">
          {explanation}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
