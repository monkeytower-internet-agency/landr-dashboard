// landr-fx2i / landr-fnhz — renders the current page title (or
// breadcrumb) in the AppShell topbar, with an optional subtitle line
// below for at-a-glance context.
//
// Reads from PageTitleProvider context — each route declares its
// title/crumbs/subtitle via <PageTitle .../> from src/lib/page-title.
//
// Render modes (header is a column so title + subtitle stack):
//   - crumbs.length > 0  → breadcrumb (parents are <Link>, last segment
//                          is plain text)
//   - title              → plain title text
//   - neither            → render nothing (collapses gracefully on
//                          routes that haven't been wired yet)
// In any mode, a non-null `subtitle` renders as a muted text-xs line
// below. Subtitle alone (without title or crumbs) is intentionally not
// rendered — that's a misuse from the call site.
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { usePageTitle } from '@/lib/page-title'
import { cn } from '@/lib/utils'

export function PageTitleDisplay() {
  const { title, crumbs, subtitle, action } = usePageTitle()

  // Subtitle slot — rendered as the second row in the stack, only when
  // we have a title or breadcrumb above it to anchor it.
  const subtitleNode =
    subtitle && (crumbs.length > 0 || title) ? (
      <p
        className="text-muted-foreground truncate text-xs leading-tight"
        data-testid="page-title-subtitle"
      >
        {subtitle}
      </p>
    ) : null

  // landr-ar44 — primary-action slot. Rendered right-aligned in the page
  // header, opposite the title/breadcrumb. shrink-0 so a long title
  // truncates before the action does. Only shown when a title or
  // breadcrumb anchors the header (an action with no title is a misuse).
  //
  // landr-3qkr.1 — on phones (<md) the topbar title cluster stacks
  // vertically (see the outer flex-col below), so the action drops onto its
  // own row UNDER the title rather than competing for the cramped horizontal
  // space. There it goes full-width ([&>*]:w-full so the route's existing
  // <Button> fills the row → a comfortable ≥44px tap target) and left-aligns.
  // From md up it reverts to the desktop layout: shrink-0, auto width,
  // right-aligned opposite the title.
  const actionNode =
    action && (crumbs.length > 0 || title) ? (
      <div
        className="flex w-full items-center md:w-auto md:shrink-0 [&>*]:w-full md:[&>*]:w-auto"
        data-testid="page-title-action"
      >
        {action}
      </div>
    ) : null

  if (crumbs.length > 0) {
    return (
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
                      <li
                        aria-hidden="true"
                        className="text-muted-foreground/60"
                      >
                        <ChevronRight className="size-3.5" />
                      </li>
                    ) : null}
                  </Fragment>
                )
              })}
            </ol>
          </nav>
          {subtitleNode}
        </div>
        {actionNode}
      </div>
    )
  }

  if (title) {
    return (
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="truncate text-sm font-medium" aria-live="polite">
            {title}
          </h1>
          {subtitleNode}
        </div>
        {actionNode}
      </div>
    )
  }

  return null
}
