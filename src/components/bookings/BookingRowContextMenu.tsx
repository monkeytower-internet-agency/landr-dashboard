// landr-oxlk — right-click context menu on a Bookings table row. Wraps
// the row's children in a Radix ContextMenu trigger so the operator's
// native right-click yields quick actions (Open detail, Copy link, Apply
// tag, Mark as no-show, Cancel booking) without forcing a sheet round-
// trip for the common case.
//
// Design notes
// ------------
//   - The trigger is a `<tr asChild>` so the existing table row markup
//     (and its left-click → open-sheet handler) is preserved verbatim.
//     Right-click is the only gesture that opens this menu.
//   - "Apply tag" is a `ContextMenuSub` populated from the operator's
//     active tag set. Toggling a tag fires setBookingTags() with the
//     full next id list (replace-all semantics matching the API). The
//     menu closes on toggle so the operator sees the new chip in the
//     row immediately — re-open the menu to toggle another.
//   - "Mark as no-show" and "Cancel booking" are gated by the same
//     eligibility helpers BookingDetailSheet uses (canMarkAsNoShow,
//     `current_semantic_state !== 'cancelled'`) so the menu never
//     surfaces an action the server would reject.
//   - The destructive actions don't reuse the AlertDialog wizards from
//     BookingDetailSheet (those collect reason / charge-fee inputs).
//     For the quick-action surface we open the detail sheet pre-focused
//     so the existing confirmation flow runs unchanged. Keeps the menu
//     small and avoids duplicating modal state machines.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BanIcon,
  LinkIcon,
  PencilIcon,
  TagIcon,
  UserXIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  canMarkAsNoShow,
  invalidateBookingCaches,
  type BookingRow,
} from '@/lib/bookings'
import { fetchTags, setBookingTags, type Tag } from '@/lib/tags'
import { t } from '@/lib/strings'

type Props = {
  row: BookingRow
  operatorId: string | null
  onOpenDetail: (row: BookingRow) => void
  /** Caller passes the deep-link path used by CopyLinkButton on the
   *  detail sheet (origin + path is what gets copied). */
  copyLinkPath: (row: BookingRow) => string
  children: React.ReactNode
}

export function BookingRowContextMenu({
  row,
  operatorId,
  onOpenDetail,
  copyLinkPath,
  children,
}: Props) {
  const queryClient = useQueryClient()
  // Tag set on this booking — derived from row.tags so we don't refetch.
  // The tags submenu opens lazily; we only fetch the operator's full tag
  // catalogue when the operator actually expands the submenu.
  const [tagsSubOpen, setTagsSubOpen] = useState(false)
  const initialTagIds = useMemo(
    () => (row.tags ?? []).map((tag) => tag.id),
    [row.tags],
  )
  // Local override so toggling feels instant even before the next list
  // refetch lands. Reset whenever the row's projected tag set changes
  // (refetch reconciliation).
  const [selectedIds, setSelectedIds] = useState<string[]>(initialTagIds)
  const [selectedRowId, setSelectedRowId] = useState<string>(row.id)
  if (selectedRowId !== row.id) {
    setSelectedRowId(row.id)
    setSelectedIds(initialTagIds)
  }

  const tagsQuery = useQuery<Tag[]>({
    queryKey: ['tags', operatorId ?? 'none'],
    queryFn: () => fetchTags(operatorId as string),
    enabled: !!operatorId && tagsSubOpen,
    staleTime: 30_000,
  })

  const tagMutation = useMutation({
    mutationFn: async (nextIds: string[]) => {
      if (!operatorId) throw new Error('No operator selected.')
      await setBookingTags(operatorId, row.id, nextIds)
    },
    onSuccess: () => {
      void invalidateBookingCaches(queryClient)
    },
    onError: (err: Error, _vars, _ctx) => {
      // Revert the optimistic toggle so the menu reflects truth on
      // re-open. Toast surfaces the server reason for the operator.
      setSelectedIds(initialTagIds)
      toast.error(t.bookings.detail.tagsToastError, { description: err.message })
    },
  })

  function toggleTag(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setSelectedIds(next)
    tagMutation.mutate(next)
  }

  async function onCopyLink() {
    const url = window.location.origin + copyLinkPath(row)
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t.copyLink.toastSuccess)
    } catch {
      toast.error(t.copyLink.toastError)
    }
  }

  const showNoShow = canMarkAsNoShow(row)
  const showCancel = row.current_semantic_state !== 'cancelled'
  const allTags: Tag[] = Array.isArray(tagsQuery.data) ? tagsQuery.data : []

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        data-testid={`bookings-row-context-menu-${row.id}`}
      >
        <ContextMenuItem
          onSelect={() => onOpenDetail(row)}
          data-testid="bookings-row-context-open"
        >
          <PencilIcon />
          {t.bookings.rowContextMenu.openDetail}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void onCopyLink()
          }}
          data-testid="bookings-row-context-copy-link"
        >
          <LinkIcon />
          {t.bookings.rowContextMenu.copyLink}
        </ContextMenuItem>
        <ContextMenuSub onOpenChange={setTagsSubOpen}>
          <ContextMenuSubTrigger
            data-testid="bookings-row-context-tag-sub"
            disabled={!operatorId}
          >
            <TagIcon />
            {t.bookings.rowContextMenu.applyTag}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent
            data-testid="bookings-row-context-tag-sub-content"
          >
            {tagsQuery.isPending && tagsSubOpen ? (
              <ContextMenuLabel>
                {t.bookings.rowContextMenu.tagsLoading}
              </ContextMenuLabel>
            ) : allTags.length === 0 ? (
              <ContextMenuLabel>
                {t.bookings.rowContextMenu.tagsEmpty}
              </ContextMenuLabel>
            ) : (
              allTags.map((tag) => {
                const isSel = selectedIds.includes(tag.id)
                return (
                  <ContextMenuItem
                    key={tag.id}
                    onSelect={(e) => {
                      // Stop the menu closing so the operator can toggle
                      // multiple tags without re-right-clicking.
                      e.preventDefault()
                      toggleTag(tag.id)
                    }}
                    data-testid={`bookings-row-context-tag-${tag.id}`}
                    aria-pressed={isSel}
                  >
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {isSel ? (
                      <span className="text-muted-foreground text-[10px]">
                        {t.bookings.rowContextMenu.tagSelectedMark}
                      </span>
                    ) : null}
                  </ContextMenuItem>
                )
              })
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
        {showNoShow || showCancel ? <ContextMenuSeparator /> : null}
        {showNoShow ? (
          <ContextMenuItem
            onSelect={() => onOpenDetail(row)}
            data-testid="bookings-row-context-no-show"
          >
            <UserXIcon />
            {t.bookings.rowContextMenu.markNoShow}
          </ContextMenuItem>
        ) : null}
        {showCancel ? (
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onOpenDetail(row)}
            data-testid="bookings-row-context-cancel"
          >
            <BanIcon />
            {t.bookings.rowContextMenu.cancelBooking}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}
