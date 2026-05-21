// landr-v0xg / landr-8ou3 — Views index page.
//
// Two modes:
//   - User has 0 visible Views → empty-state with template cards.
//   - User has ≥1 visible View → responsive grid of <ViewCard>s (one per
//     visible view, hidden rows excluded — those stay reachable via the
//     sidebar's Hidden expander). Replaces the landr-v0xg "pick a view
//     from the sidebar" placeholder text.
//
// `+ New view` always creates an Untitled Personal View via
// /views/new (no ?from=...).
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayersIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { listSavedViews } from '@/lib/saved-views'
import { VIEW_TEMPLATES } from '@/lib/views-templates'
import { ViewCard } from '@/components/views/ViewCard'
import { t } from '@/lib/strings'

export function ViewsIndex() {
  const { currentOperatorId } = useOperator()
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: ['saved-views', currentOperatorId ?? 'none'],
    queryFn: () => listSavedViews(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const views = query.data ?? []
  const visibleViews = views.filter((v) => !v.user_state.hidden)
  const showEmptyState = !query.isPending && visibleViews.length === 0

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.viewsIndex.title} />
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.viewsIndex.title}</h1>
        <Button onClick={() => navigate('/views/new')}>
          {t.viewsIndex.newButton}
        </Button>
      </header>

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Failed to load views</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error instanceof Error ? query.error.message : ''}
            </p>
          </CardContent>
        </Card>
      ) : showEmptyState ? (
        <section className="flex flex-col gap-4">
          <EmptyState
            icon={LayersIcon}
            title={t.emptyStates.views.title}
            description={t.emptyStates.views.description}
            action={{
              label: t.emptyStates.views.cta,
              href: '/views/new',
            }}
            data-testid="views-empty-state"
          />

          <h2 className="text-sm font-medium text-muted-foreground">
            {t.viewsIndex.templateSectionTitle}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {VIEW_TEMPLATES.map((tpl) => (
              <Card
                key={tpl.key}
                className="cursor-pointer transition-shadow hover:shadow-md"
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(`/views/new?from=template:${tpl.key}`)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/views/new?from=template:${tpl.key}`)
                  }
                }}
              >
                <CardHeader>
                  <CardTitle>{tpl.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    {tpl.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <section
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="views-grid"
        >
          {visibleViews.map((view) => (
            <ViewCard
              key={view.id}
              view={view}
              operatorId={currentOperatorId as string}
            />
          ))}
        </section>
      )}
    </div>
  )
}
