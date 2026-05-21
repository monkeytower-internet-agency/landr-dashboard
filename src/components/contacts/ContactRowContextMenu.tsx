// landr-oxlk — right-click context menu on a Contacts table row. Mirror
// of BookingRowContextMenu (see that file for the full design rationale).
// The contacts surface trades the no-show / cancel destructive actions
// for the GDPR-erase wizard since the contact lifecycle is different.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LinkIcon,
  PencilIcon,
  TagIcon,
  Trash2Icon,
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
import { contactIsErased, type ContactRow } from '@/lib/contacts'
import { fetchTags, setContactTags, type Tag } from '@/lib/tags'
import { t } from '@/lib/strings'

type Props = {
  row: ContactRow
  operatorId: string | null
  onOpenDetail: (row: ContactRow) => void
  onErase: (row: ContactRow) => void
  copyLinkPath: (row: ContactRow) => string
  children: React.ReactNode
}

export function ContactRowContextMenu({
  row,
  operatorId,
  onOpenDetail,
  onErase,
  copyLinkPath,
  children,
}: Props) {
  const queryClient = useQueryClient()
  const [tagsSubOpen, setTagsSubOpen] = useState(false)
  const initialTagIds = useMemo(
    () => (row.tags ?? []).map((tag) => tag.id),
    [row.tags],
  )
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
      await setContactTags(operatorId, row.id, nextIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (err: Error) => {
      setSelectedIds(initialTagIds)
      toast.error(t.contacts.rowContextMenu.tagsToastError, {
        description: err.message,
      })
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

  const allTags: Tag[] = Array.isArray(tagsQuery.data) ? tagsQuery.data : []
  const erased = contactIsErased(row)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        data-testid={`contacts-row-context-menu-${row.id}`}
      >
        <ContextMenuItem
          onSelect={() => onOpenDetail(row)}
          data-testid="contacts-row-context-open"
        >
          <PencilIcon />
          {t.contacts.rowContextMenu.openDetail}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void onCopyLink()
          }}
          data-testid="contacts-row-context-copy-link"
        >
          <LinkIcon />
          {t.contacts.rowContextMenu.copyLink}
        </ContextMenuItem>
        <ContextMenuSub onOpenChange={setTagsSubOpen}>
          <ContextMenuSubTrigger
            data-testid="contacts-row-context-tag-sub"
            disabled={!operatorId || erased}
          >
            <TagIcon />
            {t.contacts.rowContextMenu.applyTag}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent
            data-testid="contacts-row-context-tag-sub-content"
          >
            {tagsQuery.isPending && tagsSubOpen ? (
              <ContextMenuLabel>
                {t.contacts.rowContextMenu.tagsLoading}
              </ContextMenuLabel>
            ) : allTags.length === 0 ? (
              <ContextMenuLabel>
                {t.contacts.rowContextMenu.tagsEmpty}
              </ContextMenuLabel>
            ) : (
              allTags.map((tag) => {
                const isSel = selectedIds.includes(tag.id)
                return (
                  <ContextMenuItem
                    key={tag.id}
                    onSelect={(e) => {
                      e.preventDefault()
                      toggleTag(tag.id)
                    }}
                    data-testid={`contacts-row-context-tag-${tag.id}`}
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
                        {t.contacts.rowContextMenu.tagSelectedMark}
                      </span>
                    ) : null}
                  </ContextMenuItem>
                )
              })
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={erased}
          onSelect={() => onErase(row)}
          data-testid="contacts-row-context-erase"
        >
          <Trash2Icon />
          {t.contacts.rowContextMenu.erase}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
