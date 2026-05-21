// landr-c58d — Views sub-list in the app sidebar.
//
// Renders under the top-level "Views" nav item. Lists the user's
// accessible saved views with state-aware ordering:
//   1. Starred views first (★ prefix), then unstarred.
//   2. Inside each bucket: sort_order ASC, tiebreak name ASC.
//   3. Hidden views EXCLUDED by default; a "Show hidden views" toggle
//      at the bottom of the list adds them back at reduced opacity.
//
// Each row navigates to /views/:viewId. The overflow (⋯) menu exposes
// Star/Unstar + Hide/Unhide, calling PUT setViewUserState with
// optimistic cache patches mirrored from <StarButton>.
//
// Empty state: a small link to /views (the index with templates).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontalIcon, StarIcon } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { useOperator } from '@/lib/operator'
import {
  listSavedViews,
  setViewUserState,
  type SavedViewWithState,
} from '@/lib/saved-views'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { StarButton } from './StarButton'
import { sortViewsForSidebar } from './sidebar-sort'

type ViewRowProps = {
  view: SavedViewWithState
  operatorId: string
  // Dimmed appearance for hidden views surfaced via "Show hidden".
  dimmed: boolean
}

function ViewRow({ view, operatorId, dimmed }: ViewRowProps) {
  const qc = useQueryClient()
  const listKey = ['saved-views', operatorId] as const

  const hideMutation = useMutation({
    mutationFn: async (nextHidden: boolean) => {
      await setViewUserState(operatorId, view.id, { hidden: nextHidden })
      return nextHidden
    },
    onMutate: async (nextHidden) => {
      await qc.cancelQueries({ queryKey: listKey })
      const previous = qc.getQueryData<SavedViewWithState[]>(listKey)
      if (previous) {
        qc.setQueryData<SavedViewWithState[]>(
          listKey,
          previous.map((v) =>
            v.id === view.id
              ? { ...v, user_state: { ...v.user_state, hidden: nextHidden } }
              : v,
          ),
        )
      }
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(listKey, ctx.previous)
      }
      toast.error(t.viewsSidebar.hideError)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: listKey })
    },
  })

  const isHidden = view.user_state.hidden
  const isStarred = view.user_state.starred

  return (
    <SidebarMenuSubItem className={cn(dimmed && 'opacity-60')}>
      <div className="group/view-row relative flex w-full items-center">
        <SidebarMenuSubButton asChild className="pr-12">
          <Link to={`/views/${view.id}`}>
            {isStarred ? (
              <StarIcon
                className="size-3 shrink-0 fill-current text-amber-500"
                aria-hidden
              />
            ) : null}
            <span className="truncate">{view.name}</span>
          </Link>
        </SidebarMenuSubButton>
        {/* Row affordances: inline star + overflow menu. Both sit
            absolutely on the right; opacity-0 → opacity-100 on hover
            so they don't clutter the sidebar at rest. */}
        <div
          className={cn(
            'absolute top-1/2 right-1 -translate-y-1/2 flex items-center gap-0.5',
            'opacity-0 transition-opacity',
            'group-hover/view-row:opacity-100 group-focus-within/view-row:opacity-100',
            // Always show the star button when the view is starred so the
            // user can unstar via click without first hovering — mirrors
            // common UI conventions for "lit" star affordances.
            isStarred && 'opacity-100',
          )}
        >
          <StarButton
            viewId={view.id}
            starred={isStarred}
            operatorId={operatorId}
            size="sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t.viewsSidebar.rowMenuLabel(view.name)}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                className={cn(
                  'inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-md p-0.5',
                  'text-sidebar-foreground/70 transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
                )}
              >
                <MoreHorizontalIcon className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  hideMutation.mutate(!isHidden)
                }}
              >
                {isHidden
                  ? t.viewsSidebar.unhide
                  : t.viewsSidebar.hideFromSidebar}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </SidebarMenuSubItem>
  )
}

export function ViewsSidebar() {
  const { currentOperatorId } = useOperator()
  const [showHidden, setShowHidden] = useState(false)

  const query = useQuery({
    queryKey: ['saved-views', currentOperatorId ?? 'none'],
    queryFn: () => listSavedViews(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const views = query.data ?? []
  const visible = sortViewsForSidebar(views.filter((v) => !v.user_state.hidden))
  const hidden = sortViewsForSidebar(views.filter((v) => v.user_state.hidden))

  // Hide the sub-list entirely when there's no operator yet — the parent
  // sidebar still renders the top-level "Views" link itself.
  if (!currentOperatorId) {
    return null
  }

  const isEmpty = !query.isPending && visible.length === 0 && hidden.length === 0

  return (
    <SidebarMenuSub>
      {visible.map((view) => (
        <ViewRow
          key={view.id}
          view={view}
          operatorId={currentOperatorId}
          dimmed={false}
        />
      ))}

      {showHidden &&
        hidden.map((view) => (
          <ViewRow
            key={view.id}
            view={view}
            operatorId={currentOperatorId}
            dimmed
          />
        ))}

      {isEmpty ? (
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild className="text-muted-foreground italic">
            <Link to="/views">{t.viewsSidebar.emptyHint}</Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ) : null}

      {hidden.length > 0 ? (
        <SidebarMenuSubItem>
          <button
            type="button"
            aria-pressed={showHidden}
            onClick={() => setShowHidden((v) => !v)}
            className={cn(
              'flex h-6 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-xs',
              'text-sidebar-foreground/60 transition-colors',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
            )}
          >
            <span className="truncate">
              {showHidden
                ? t.viewsSidebar.hideHidden
                : t.viewsSidebar.showHidden}
            </span>
            <span className="ml-auto tabular-nums">({hidden.length})</span>
          </button>
        </SidebarMenuSubItem>
      ) : null}
    </SidebarMenuSub>
  )
}
