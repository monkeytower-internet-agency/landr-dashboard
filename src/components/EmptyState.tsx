// landr-s1mr — Reusable empty-state card.
//
// Replaces ad-hoc "No X yet" lines across the dashboard with a friendly
// card: muted background, large Lucide icon, heading, optional sub-copy,
// and an optional CTA (button or anchor). Used on Bookings, Contacts,
// Products, Views, Calendar (no events), Recently-viewed sidebar, and
// the Approvals queue (celebratory "all caught up" variant via the
// `tone` prop).
//
// landr-hxnb.5 — illustration slot + per-section hue accent.
//   Pass `illustration` (a scene component) to replace the plain Lucide icon
//   with a full comic SVG illustration. The `accentHue` prop tints the card
//   border/background with the section's soft-bg token:
//     'bookings' | 'catalog' | 'finance' | 'people' | 'comms' | 'settings'
//   Entrance animation (fade + lift) respects prefers-reduced-motion via
//   the CSS media query on the @keyframes definition.
//
// Icons are Lucide only (no images / illustrations) so the surface stays
// in lockstep with the rest of the dashboard's iconography. The CTA is
// rendered as a Link when `action.href` is set and as a Button otherwise.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type EmptyStateAction = {
  label: string
  onClick?: () => void
  href?: string
}

// The six section hues from landr-hxnb.1 token system.
type SectionHue =
  | 'bookings'
  | 'catalog'
  | 'finance'
  | 'people'
  | 'comms'
  | 'settings'

// Tailwind classes for each hue's soft-bg and vivid border tint.
// These reference the CSS custom properties exposed by index.css.
const HUE_CLASSES: Record<
  SectionHue,
  { bg: string; border: string }
> = {
  bookings: {
    bg: 'bg-hue-bookings-soft-bg/60',
    border: 'border-hue-bookings-vivid/30',
  },
  catalog: {
    bg: 'bg-hue-catalog-soft-bg/60',
    border: 'border-hue-catalog-vivid/30',
  },
  finance: {
    bg: 'bg-hue-finance-soft-bg/60',
    border: 'border-hue-finance-vivid/30',
  },
  people: {
    bg: 'bg-hue-people-soft-bg/60',
    border: 'border-hue-people-vivid/30',
  },
  comms: {
    bg: 'bg-hue-comms-soft-bg/60',
    border: 'border-hue-comms-vivid/30',
  },
  settings: {
    bg: 'bg-hue-settings-soft-bg/60',
    border: 'border-hue-settings-vivid/30',
  },
}

export type EmptyStateProps = {
  // Plain Lucide icon — used when `illustration` is not provided,
  // or in compact mode where the full scene SVG would be too large.
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

  // landr-hxnb.5 additions ------------------------------------------------

  // Comic scene illustration (ReactNode). Rendered above the title in
  // 'card' size. Ignored in 'compact' mode — sidebars stay icon-only.
  // Typically one of the scene components from @/components/illustrations.
  illustration?: ReactNode

  // Per-section hue accent. When set, overrides the default muted bg with
  // the section's soft-bg tint and a matching border. Does NOT apply in
  // 'celebratory' tone (that already owns its own green tint).
  accentHue?: SectionHue
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
  illustration,
  accentHue,
}: EmptyStateProps) {
  const isCelebratory = tone === 'celebratory'
  const isCompact = size === 'compact'
  const showIllustration = illustration != null && !isCompact

  const hueClasses =
    !isCelebratory && accentHue ? HUE_CLASSES[accentHue] : null

  return (
    <div
      data-slot="empty-state"
      data-tone={tone}
      data-size={size}
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed text-center',
        // Animation: fade + lift on mount. The @keyframes in index.css are
        // wrapped in a prefers-reduced-motion: no-preference media query so
        // users who prefer reduced motion see no animation at all.
        !isCompact && 'animate-empty-state-in',
        isCompact ? 'gap-1.5 py-4 px-3' : 'gap-3 py-12 px-6',
        isCelebratory
          ? 'border-primary/30 bg-primary/5'
          : hueClasses
            ? cn(hueClasses.bg, hueClasses.border)
            : 'border-muted-foreground/20 bg-muted/30',
        className,
      )}
    >
      {showIllustration ? (
        // Illustration replaces the plain icon in card mode.
        <div className="mb-1 h-36 w-auto" aria-hidden>
          {illustration}
        </div>
      ) : (
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
      )}
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
