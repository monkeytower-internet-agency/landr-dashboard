// landr-c58d — reusable star toggle for saved views.
//
// Used by:
//   - <ViewsSidebar> rows (small inline star prefix)
//   - <ViewPage> header (larger affordance; landr-hgtv wires this in)
//
// Behaviour:
//   - Renders a filled star when starred, outline star otherwise.
//   - Click: optimistic flip + PUT setViewUserState({ starred: !starred }).
//   - On error: revert + toast.error.
//   - Cache: invalidates the `['saved-views', operatorId]` query so the
//     sidebar prefix + ordering reflect immediately. We also patch the
//     cache optimistically so the UI doesn't flash even before the
//     refetch resolves.
import { StarIcon } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  setViewUserState,
  type SavedViewWithState,
} from '@/lib/saved-views'
import { t } from '@/lib/strings'

export type StarButtonProps = {
  viewId: string
  starred: boolean
  operatorId: string
  /** Visual size. `sm` for sidebar inline, `md` for page headers. */
  size?: 'sm' | 'md'
  /** Extra class on the button wrapper. */
  className?: string
}

export function StarButton({
  viewId,
  starred,
  operatorId,
  size = 'sm',
  className,
}: StarButtonProps) {
  const qc = useQueryClient()
  const listKey = ['saved-views', operatorId] as const

  const mutation = useMutation({
    mutationFn: async (nextStarred: boolean) => {
      await setViewUserState(operatorId, viewId, { starred: nextStarred })
      return nextStarred
    },
    onMutate: async (nextStarred) => {
      await qc.cancelQueries({ queryKey: listKey })
      const previous = qc.getQueryData<SavedViewWithState[]>(listKey)
      if (previous) {
        qc.setQueryData<SavedViewWithState[]>(
          listKey,
          previous.map((v) =>
            v.id === viewId
              ? { ...v, user_state: { ...v.user_state, starred: nextStarred } }
              : v,
          ),
        )
      }
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      // Revert optimistic patch.
      if (ctx?.previous) {
        qc.setQueryData(listKey, ctx.previous)
      }
      toast.error(t.viewsSidebar.starError)
    },
    onSettled: () => {
      // Refetch to reconcile with server truth (e.g. updated_at).
      void qc.invalidateQueries({ queryKey: listKey })
    },
  })

  const next = !starred
  const label = starred ? t.viewsSidebar.unstarView : t.viewsSidebar.starView

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={starred}
      title={label}
      onClick={(e) => {
        // When nested inside a Link/row, don't navigate on star toggle.
        e.preventDefault()
        e.stopPropagation()
        mutation.mutate(next)
      }}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md',
        'text-sidebar-foreground/70 transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
        size === 'sm' && 'h-5 w-5 p-0.5',
        size === 'md' && 'h-8 w-8 p-1',
        starred && 'text-amber-500 hover:text-amber-500',
        className,
      )}
    >
      <StarIcon
        className={cn(
          size === 'sm' ? 'size-3.5' : 'size-5',
          starred && 'fill-current',
        )}
        aria-hidden
      />
    </button>
  )
}
