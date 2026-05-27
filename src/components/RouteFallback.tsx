// landr-mhhq — Suspense fallback for lazy-loaded route chunks.
//
// Lives inside <AppShell>, so it renders inside the topbar/sidebar
// chrome while the route's JS chunk streams in. Intentionally minimal:
// a pulsing skeleton block that takes the available space, so the
// switch is unobtrusive even on a fast network (chunk lands in <100ms
// from cache, so we don't want a flashy spinner).

import { Skeleton } from '@/components/ui/skeleton'

export function RouteFallback() {
  return (
    <div className="p-6" data-testid="route-fallback">
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
