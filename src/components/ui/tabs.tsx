// landr-maat — shadcn Tabs primitive over Radix `react-tabs`.
//
// Why this exists: Schedule.tsx, BookingsCalendar.tsx, BookingDetailSheet.tsx,
// CustomerDetailSheet.tsx, LayoutSwitcher.tsx, and ViewFilterChips.tsx each
// hand-rolled `role="tablist"` / `role="tab"` markup with the same Tailwind
// recipe. This file consolidates the markup and accessibility (arrow-key
// navigation, focus management, roving tabindex) onto a single Radix
// primitive so future tab strips don't reinvent it.
//
// Variants:
//   - `default` (Radix-styled, full-width strip — used when tabs anchor a
//     panel of content; matches the muted background look from the shadcn
//     reference).
//   - `pill` (compact rounded-border strip — mirrors the inline look used
//     across the existing callsites, e.g. the Details/Timeline toggle on
//     BookingDetailSheet and the month/list toggle on Schedule).
//
// Children retain full control of `data-testid`, `aria-label`, and any extra
// classes via the standard radix `ComponentProps` passthrough.

import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

type TabsListVariant = 'default' | 'pill'

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: TabsListVariant
}) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        variant === 'pill'
          ? 'border-input bg-background inline-flex w-fit shrink-0 rounded-md border p-0.5'
          : 'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  variant?: TabsListVariant
}) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      className={cn(
        // Shared affordances — focus ring + disabled state — for both
        // variants. Keep these terse so the recipe per variant stays legible.
        'focus-visible:ring-ring focus-visible:outline-ring inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
        variant === 'pill'
          ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-sm px-3 py-1.5 text-xs'
          : 'data-[state=active]:bg-background data-[state=active]:text-foreground text-foreground dark:data-[state=active]:text-foreground dark:text-muted-foreground h-[calc(100%-1px)] flex-1 rounded-md border border-transparent px-2 py-1 text-sm data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
