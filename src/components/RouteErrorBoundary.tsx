// landr-a99u — route-level ErrorBoundary.
//
// Wraps the <Suspense> inside AppShell so a single route's render crash
// never blacks out the whole dashboard. On error:
//   1. Captures the error into the error-log store (ErrorHistoryBell).
//   2. Renders a centred Card with the error message + a hint to use the bell.
//   3. Resets automatically when the user navigates to a different route
//      (the <RouteErrorBoundary> wrapper keys on pathname).
//
// Usage in App.tsx:
//   <AppShell>
//     <RouteErrorBoundary>
//       <Suspense fallback={<RouteFallback />}>
//         <Outlet />
//       </Suspense>
//     </RouteErrorBoundary>
//   </AppShell>

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { captureError } from '@/lib/notify'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ---- inner class boundary ---------------------------------------------------

interface BoundaryProps {
  children: ReactNode
  /** Pathname injected by the wrapper; changes cause a reset via `key`. */
  locationKey: string
}

interface BoundaryState {
  error: Error | null
}

class ErrorBoundaryInner extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const firstStackLine = error.stack?.split('\n')[0] ?? ''
    captureError(error.message, {
      detail: `${error.name} @ ${this.props.locationKey}: ${firstStackLine}`,
      context: this.props.locationKey,
    })
    // Log to console so the full stack is visible in DevTools.
    console.error('[RouteErrorBoundary]', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-md" data-testid="route-error-card">
          <CardHeader>
            <CardTitle
              className="text-destructive"
              data-testid="route-error-title"
            >
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p
              className="text-sm font-medium"
              data-testid="route-error-message"
            >
              {error.message}
            </p>
            <p
              className="text-muted-foreground text-xs"
              data-testid="route-error-hint"
            >
              The full error was captured in the bell — click it to copy or
              report.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => window.location.reload()}
              data-testid="route-error-reload"
            >
              Reload page
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
}

// ---- public wrapper (reads pathname, keys the boundary) --------------------

/**
 * Route-level error boundary. Keys on the current pathname so the boundary
 * resets automatically when the user navigates to a different route.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundaryInner key={pathname} locationKey={pathname}>
      {children}
    </ErrorBoundaryInner>
  )
}
