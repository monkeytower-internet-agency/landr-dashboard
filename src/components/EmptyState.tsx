// landr-s1mr — Reusable empty-state card.
//
// Replaces ad-hoc "No X yet" lines across the dashboard with a friendly
// card: muted background, large Lucide icon, heading, optional sub-copy,
// and an optional CTA (button or anchor). Used on Bookings, Contacts,
// Products, Views, Calendar (no events), Recently-viewed sidebar, and
// the Approvals queue (celebratory "all caught up" variant via the
// `tone` prop).
//
// Icons are Lucide only (no images / illustrations) so the surface stays
// in lockstep with the rest of the dashboard's iconography. The CTA is
// rendered as a Link when `action.href` is set and as a Button otherwise.

import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EmptyStateAction = {
  label: string
  onClick?: () => void
  href?: string
}

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
  // 'default' = neutral muted card (most surfaces).
  // 'celebratory' = green-tinted "all caught up" variant for Approvals
  // and other "nothing to do" surfaces where empty is the *good* state.
  tone?: 'default' | 'celebratory'
  // 'card' = full empty-state card with 48px icon and generous padding
  // (default — main content surfaces).
  // 'compact' = inline variant for sidebars / sub-lists where the full
  // card would overwhelm. 24px icon, tighter padding, smaller heading.
  size?: 'card' | 'compact'
  className?: string
  // Optional test hook so callers can assert "the new EmptyState rendered"
  // without coupling to copy.
  'data-testid'?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'default',
  size = 'card',
  className,
  'data-testid': testId,
}: EmptyStateProps) {
  const isCelebratory = tone === 'celebratory'
  const isCompact = size === 'compact'
  return (
    <div
      data-slot="empty-state"
      data-tone={tone}
      data-size={size}
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed text-center',
        isCompact ? 'gap-1.5 py-4 px-3' : 'gap-3 py-12 px-6',
        isCelebratory
          ? 'border-primary/30 bg-primary/5'
          : 'border-muted-foreground/20 bg-muted/30',
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          isCompact ? 'mb-0' : 'mb-1',
          isCelebratory ? 'text-primary' : 'text-muted-foreground',
        )}
        // Card surfaces get a visible focal point (size 48); compact
        // sidebar usage shrinks to 24 so it doesn't dwarf the rail.
        size={isCompact ? 24 : 48}
        strokeWidth={1.5}
      />
      <h3
        className={cn('font-semibold', isCompact ? 'text-xs' : 'text-base')}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            'text-muted-foreground max-w-sm',
            isCompact ? 'text-xs' : 'text-sm',
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <EmptyStateCta action={action} /> : null}
    </div>
  )
}

function EmptyStateCta({ action }: { action: EmptyStateAction }) {
  // Internal href → Link (preserves SPA navigation). External href (http,
  // mailto, etc.) → plain anchor with rel for safety. Otherwise → Button.
  if (action.href) {
    const isExternal = /^(https?:|mailto:|tel:)/i.test(action.href)
    if (isExternal) {
      return (
        <Button asChild size="sm" className="mt-2">
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={action.onClick}
          >
            {action.label}
          </a>
        </Button>
      )
    }
    return (
      <Button asChild size="sm" className="mt-2">
        <Link to={action.href} onClick={action.onClick}>
          {action.label}
        </Link>
      </Button>
    )
  }
  return (
    <Button
      type="button"
      size="sm"
      className="mt-2"
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  )
}
