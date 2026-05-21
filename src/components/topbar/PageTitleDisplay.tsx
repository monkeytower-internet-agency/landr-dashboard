// landr-fx2i — renders the current page title (or breadcrumb) in the
// AppShell topbar. Reads from PageTitleProvider context — each route is
// responsible for declaring its title via <PageTitle .../> from
// src/lib/page-title.tsx.
//
// Three render modes:
//   - crumbs.length > 0  → breadcrumb (parents are <Link>, last segment
//                          is plain text)
//   - title              → plain title text
//   - neither            → render nothing (collapses gracefully on
//                          routes that haven't been wired yet)
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { usePageTitle } from '@/lib/page-title'
import { cn } from '@/lib/utils'

export function PageTitleDisplay() {
  const { title, crumbs } = usePageTitle()

  if (crumbs.length > 0) {
    return (
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1 text-sm"
      >
        <ol className="flex min-w-0 items-center gap-1">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1
            return (
              <Fragment key={`${index}-${crumb.label}`}>
                <li className="min-w-0">
                  {crumb.to && !isLast ? (
                    <Link
                      to={crumb.to}
                      className={cn(
                        'truncate rounded px-1 py-0.5',
                        'text-muted-foreground hover:text-foreground',
                        'hover:underline underline-offset-2',
                      )}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        'truncate px-1 py-0.5',
                        isLast
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground',
                      )}
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
                {!isLast ? (
                  <li aria-hidden="true" className="text-muted-foreground/60">
                    <ChevronRight className="size-3.5" />
                  </li>
                ) : null}
              </Fragment>
            )
          })}
        </ol>
      </nav>
    )
  }

  if (title) {
    return (
      <h1 className="truncate text-sm font-medium" aria-live="polite">
        {title}
      </h1>
    )
  }

  return null
}
