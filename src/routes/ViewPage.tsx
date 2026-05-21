// landr-v0xg — per-view page stub.
//
// Phase 2 (landr-hgtv) replaces this with the real ViewPage shell
// (filter chip toolbar + ?layout= URL override + Save/Discard for
// Shared dirty state). For now we render the view name + ID so the
// /views/new redirect target has something visible to confirm
// materialisation worked end-to-end.
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { getSavedView } from '@/lib/saved-views'
import { t } from '@/lib/strings'

export function ViewPage() {
  const { viewId } = useParams<{ viewId: string }>()
  const { currentOperatorId } = useOperator()

  const query = useQuery({
    queryKey: ['saved-view', currentOperatorId ?? 'none', viewId ?? 'none'],
    queryFn: () =>
      getSavedView(currentOperatorId as string, viewId as string),
    enabled: !!currentOperatorId && !!viewId,
  })

  const title = query.data?.name ?? t.viewsIndex.title

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={title} />
      <header>
        <h1 className="text-xl font-semibold">{title}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>View page for ID: {viewId}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {query.isPending ? (
            <p className="text-muted-foreground text-sm">Loading view…</p>
          ) : query.isError ? (
            <p className="text-muted-foreground text-sm">
              {query.error instanceof Error ? query.error.message : ''}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                Phase 2 (landr-hgtv) replaces this stub with the real
                ViewPage shell.
              </p>
              <p className="text-muted-foreground text-sm">
                Name: {query.data?.name}
              </p>
              <p className="text-muted-foreground text-sm">
                Entity: {query.data?.entity_type} · Visibility:{' '}
                {query.data?.visibility}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
