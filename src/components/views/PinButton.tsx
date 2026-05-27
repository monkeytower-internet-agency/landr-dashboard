// landr-c58d / landr-45pb — reusable pin toggle for saved views.
//
// (Renamed from StarButton in landr-45pb to match the Gmail-style sidebar
// IA: pinned views live in the Primary bucket; unpinned views live under
// "More". Same data, sharper name — see migration
// 20260521090000_view_user_state_pinned_and_sort_order.sql.)
//
// Used by:
//   - <ViewsSidebar> rows (small inline pin prefix)
//   - <ViewPage> header (larger affordance)
//
// Behaviour:
//   - Renders a filled pin when pinned, outline pin otherwise.
//   - Click: optimistic flip + PUT setViewUserState({ pinned: !pinned }).
//   - On error: revert + toast.error.
//   - Cache: invalidates the `['saved-views', operatorId]` query so the
//     sidebar prefix + bucket placement reflect immediately. We also
//     patch the cache optimistically so the UI doesn't flash even before
//     the refetch resolves.
import { PinIcon } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  setViewUserState,
  type SavedViewWithState,
} from '@/lib/saved-views'
import { t } from '@/lib/strings'

export type PinButtonProps = {
  viewId: string
  pinned: boolean
  operatorId: string
  /** Visual size. `sm` for sidebar inline, `md` for page headers. */
  size?: 'sm' | 'md'
  /** Extra class on the button wrapper. */
  className?: string
}

export function PinButton({
  viewId,
  pinned,
  operatorId,
  size = 'sm',
  className,
}: PinButtonProps) {
  const qc = useQueryClient()
  const listKey = ['saved-views', operatorId] as const

  const mutation = useMutation({
    mutationFn: async (nextPinned: boolean) => {
      await setViewUserState(operatorId, viewId, { pinned: nextPinned })
      return nextPinned
    },
    onMutate: async (nextPinned) => {
      await qc.cancelQueries({ queryKey: listKey })
      const previous = qc.getQueryData<SavedViewWithState[]>(listKey)
      if (previous) {
        qc.setQueryData<SavedViewWithState[]>(
          listKey,
          previous.map((v) =>
            v.id === viewId
              ? { ...v, user_state: { ...v.user_state, pinned: nextPinned } }
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
      toast.error(t.viewsSidebar.pinError)
    },
    onSettled: () => {
      // Refetch to reconcile with server truth (e.g. updated_at).
      void qc.invalidateQueries({ queryKey: listKey })
    },
  })

  const next = !pinned
  const label = pinned ? t.viewsSidebar.unpinView : t.viewsSidebar.pinView

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pinned}
      title={label}
      onClick={(e) => {
        // When nested inside a Link/row, don't navigate on pin toggle.
        e.preventDefault()
        e.stopPropagation()
        mutation.mutate(next)
      }}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full',
        'text-sidebar-foreground/70 transition-colors',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
        size === 'sm' && 'h-5 w-5 p-0.5',
        size === 'md' && 'h-8 w-8 p-1',
        // landr-79f5 — brighter pinned state: amber icon + amber chip
        // background so pinned-ness is obvious at a glance (in the sidebar,
        // in /views index cards, anywhere PinButton is rendered).
        pinned && [
          'text-amber-500 hover:text-amber-500',
          'bg-amber-500/15 dark:bg-amber-500/20',
          'hover:bg-amber-500/25 dark:hover:bg-amber-500/30',
        ],
        className,
      )}
    >
      <PinIcon
        className={cn(
          size === 'sm' ? 'size-3.5' : 'size-5',
          pinned && 'fill-current',
        )}
        aria-hidden
      />
    </button>
  )
}
