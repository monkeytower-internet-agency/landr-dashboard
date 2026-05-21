// landr-v0xg — per-view page stub.
//
// Phase 2 (landr-hgtv) replaces this with the real ViewPage shell
// (filter chip toolbar + ?layout= URL override + Save/Discard for
// Shared dirty state). For now we render the view name + ID so the
// /views/new redirect target has something visible to confirm
// materialisation worked end-to-end.
//
// landr-c58d — header gets a Star button + an overflow menu with
// Hide / Unhide. When hgtv lands the real shell, the Star + Hide
// affordances are reused from here (StarButton stays the reusable
// primitive; Hide is wired via setViewUserState).
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import {
  getSavedView,
  setViewUserState,
  type SavedViewWithState,
} from '@/lib/saved-views'
import { StarButton } from '@/components/views/StarButton'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

export function ViewPage() {
  const { viewId } = useParams<{ viewId: string }>()
  const { currentOperatorId } = useOperator()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['saved-view', currentOperatorId ?? 'none', viewId ?? 'none'],
    queryFn: () =>
      getSavedView(currentOperatorId as string, viewId as string),
    enabled: !!currentOperatorId && !!viewId,
  })

  const title = query.data?.name ?? t.viewsIndex.title

  // landr-c58d — Hide/Unhide mutation for the header overflow menu.
  // Optimistically patches BOTH the per-view cache key (the page's own
  // query) and the sidebar list key so the sidebar reflects immediately.
  const hideMutation = useMutation({
    mutationFn: async (nextHidden: boolean) => {
      if (!currentOperatorId || !viewId) return nextHidden
      await setViewUserState(currentOperatorId, viewId, { hidden: nextHidden })
      return nextHidden
    },
    onMutate: async (nextHidden) => {
      const detailKey = [
        'saved-view',
        currentOperatorId ?? 'none',
        viewId ?? 'none',
      ] as const
      const listKey = ['saved-views', currentOperatorId] as const
      await Promise.all([
        qc.cancelQueries({ queryKey: detailKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ])
      const previousDetail = qc.getQueryData<SavedViewWithState>(detailKey)
      const previousList = qc.getQueryData<SavedViewWithState[]>(listKey)
      if (previousDetail) {
        qc.setQueryData<SavedViewWithState>(detailKey, {
          ...previousDetail,
          user_state: { ...previousDetail.user_state, hidden: nextHidden },
        })
      }
      if (previousList && viewId) {
        qc.setQueryData<SavedViewWithState[]>(
          listKey,
          previousList.map((v) =>
            v.id === viewId
              ? { ...v, user_state: { ...v.user_state, hidden: nextHidden } }
              : v,
          ),
        )
      }
      return { previousDetail, previousList, detailKey, listKey }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previousDetail) qc.setQueryData(ctx.detailKey, ctx.previousDetail)
      if (ctx?.previousList) qc.setQueryData(ctx.listKey, ctx.previousList)
      toast.error(t.viewsSidebar.hideError)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['saved-view'] })
      void qc.invalidateQueries({ queryKey: ['saved-views'] })
    },
  })

  const view = query.data

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={title} />
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{title}</h1>
          {view && currentOperatorId ? (
            <StarButton
              viewId={view.id}
              starred={view.user_state.starred}
              operatorId={currentOperatorId}
              size="md"
            />
          ) : null}
        </div>
        {view && currentOperatorId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t.viewsSidebar.rowMenuLabel(view.name)}
                className={cn(
                  'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md',
                  'text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-foreground',
                  'focus-visible:outline-2 focus-visible:outline-ring',
                )}
              >
                <MoreHorizontalIcon className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  hideMutation.mutate(!view.user_state.hidden)
                }}
              >
                {view.user_state.hidden
                  ? t.viewsSidebar.unhide
                  : t.viewsSidebar.hideFromSidebar}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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
