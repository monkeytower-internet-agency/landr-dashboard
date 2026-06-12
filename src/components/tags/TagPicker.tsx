/**
 * TagPicker — multiselect popover for assigning operator tags
 * to a booking or contact (landr-iz58).
 *
 * Behaviour:
 *   - Shows currently-selected tags as a removable-chip row up top.
 *   - Search field filters the operator's tag list by case-insensitive
 *     name substring.
 *   - When no match is found, a "Create '<query>'" affordance materialises
 *     the tag on the fly using defaultColorFor() so the operator does
 *     not have to leave the picker. The new tag immediately becomes
 *     selected.
 *   - Selection toggles inline (clicking a tag in the list adds/removes it).
 *
 * Caller wires the persisted set via `selectedIds` + `onChange(nextIds)`.
 * The picker itself is purely controlled — saving the assignment is the
 * caller's responsibility (BookingDetailSheet / CustomerDetailSheet do
 * a setBookingTags / setContactTags POST after dirty-state save).
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Tag as TagIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TagChip } from '@/components/tags/TagChip'
import {
  createTag,
  defaultColorFor,
  fetchTags,
  type Tag,
} from '@/lib/tags'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  selectedIds: string[]
  onChange: (nextIds: string[]) => void
  /** Optional label rendered above the trigger. */
  label?: string
  testIdPrefix?: string
  /** Disable interaction (e.g. while saving). */
  disabled?: boolean
}

export function TagPicker({
  operatorId,
  selectedIds,
  onChange,
  label,
  testIdPrefix = 'tag-picker',
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const queryClient = useQueryClient()

  const tagsQuery = useQuery<Tag[]>({
    queryKey: ['tags', operatorId],
    queryFn: () => fetchTags(operatorId),
    staleTime: 30_000,
  })

  // Defensive: useQuery can hand back undefined on first render and some
  // test harnesses return raw values that aren't arrays. Treat anything
  // non-array as empty.
  const allTags: Tag[] = Array.isArray(tagsQuery.data) ? tagsQuery.data : []
  const byId = useMemo(() => {
    const m = new Map<string, Tag>()
    for (const tag of allTags) m.set(tag.id, tag)
    return m
  }, [allTags])

  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((t): t is Tag => !!t)

  const trimmed = query.trim()
  const filtered = useMemo(() => {
    if (!trimmed) return allTags
    const needle = trimmed.toLowerCase()
    return allTags.filter((t) => t.name.toLowerCase().includes(needle))
  }, [allTags, trimmed])

  const exactMatch = useMemo(
    () => allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase()),
    [allTags, trimmed],
  )
  const canCreate = trimmed.length > 0 && !exactMatch

  const createMutation = useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      createTag(operatorId, input),
    onSuccess: (created) => {
      // Optimistic refresh: drop it into the cache so the list updates
      // immediately, then invalidate so a refetch reconciles.
      queryClient.setQueryData<Tag[]>(['tags', operatorId], (prev) => [
        ...(prev ?? []),
        created,
      ])
      queryClient.invalidateQueries({ queryKey: ['tags', operatorId] })
      onChange([...selectedIds, created.id])
      setQuery('')
    },
    onError: (err: Error) => {
      toast.error(t.tagsSettings.toastCreateError, {
        description: err.message,
      })
    },
  })

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  function handleCreate() {
    if (!canCreate || createMutation.isPending) return
    createMutation.mutate({
      name: trimmed,
      color: defaultColorFor(trimmed),
    })
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testIdPrefix}>
      {label ? (
        <label className="text-xs font-medium">{label}</label>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={disabled ? undefined : () => toggle(tag.id)}
            testId={`${testIdPrefix}-selected-${tag.id}`}
          />
        ))}

        <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              data-testid={`${testIdPrefix}-trigger`}
              disabled={disabled}
            >
              <TagIcon className="size-3" aria-hidden="true" />
              {selected.length === 0 ? 'Add tag' : 'Edit tags'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 p-2"
            data-testid={`${testIdPrefix}-popover`}
          >
            <Input
              autoFocus
              type="text"
              placeholder="Search or create…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) {
                  e.preventDefault()
                  handleCreate()
                }
              }}
              className="mb-2 h-8 text-sm"
              data-testid={`${testIdPrefix}-search`}
              aria-label="Search tags"
            />

            <div
              className="max-h-64 overflow-y-auto"
              data-testid={`${testIdPrefix}-list`}
            >
              {tagsQuery.isPending ? (
                <p className="text-muted-foreground py-2 text-center text-xs">
                  Loading…
                </p>
              ) : filtered.length === 0 && !canCreate ? (
                <p className="text-muted-foreground py-2 text-center text-xs">
                  No tags yet. Type to create one.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filtered.map((tag) => {
                    const isSel = selectedIds.includes(tag.id)
                    return (
                      <li key={tag.id}>
                        <button
                          type="button"
                          onClick={() => toggle(tag.id)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent ${
                            isSel ? 'bg-accent/50' : ''
                          }`}
                          data-testid={`${testIdPrefix}-option-${tag.id}`}
                          aria-pressed={isSel}
                        >
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                            aria-hidden="true"
                          />
                          <span className="flex-1 truncate">{tag.name}</span>
                          {isSel ? (
                            <span className="text-muted-foreground text-[10px]">
                              ✓
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {canCreate ? (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="hover:bg-accent mt-1 flex w-full items-center gap-2 rounded border-t px-2 py-1.5 text-left text-xs disabled:opacity-50"
                  data-testid={`${testIdPrefix}-create`}
                >
                  <Plus className="size-3" aria-hidden="true" />
                  <span>
                    {createMutation.isPending
                      ? 'Creating…'
                      : `Create "${trimmed}"`}
                  </span>
                  <span
                    className="ml-auto inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: defaultColorFor(trimmed) }}
                    aria-hidden="true"
                  />
                </button>
              ) : null}

              {createMutation.isError ? (
                <p
                  className="text-destructive mt-2 px-2 text-[10px]"
                  role="alert"
                >
                  {(createMutation.error as Error).message}
                </p>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
