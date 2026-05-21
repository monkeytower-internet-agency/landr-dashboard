// landr-panu — quick-filter chip row for saved customer segments
// + the ad-hoc tag-filter trigger that feeds them.
//
// Layout (single horizontal row, between ContactsFilters and the table):
//
//   [Segments]  [VIP●] [Returning] [+ Save as segment…]  [⚙ Manage]
//   [Tags:] (Filter by tag) ['vip', 'returning' selected]  [Clear]
//
// Behaviour:
//   - Tag picker controls a transient `selectedTagIds` (lifted to the
//     route so the table can apply the AND filter to its rows).
//   - Clicking a saved-segment chip swaps the ad-hoc tag picker's
//     selection to that segment's tagIds. Clicking again deactivates.
//   - "Save as segment…" appears only when ≥1 tag is selected.
//   - "Manage segments" lives next to the segment chips when any exist;
//     it opens a list dialog with rename / delete affordances.
//
// We deliberately reuse the existing TagPicker (lib/tags.ts) for tag
// selection so the operator works with the same control they already
// know from the detail sheets.

import { useMemo, useState } from 'react'
import { Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagPicker } from '@/components/tags/TagPicker'
import { fetchTags, type Tag } from '@/lib/tags'
import {
  SEGMENT_PALETTE,
  createSegment,
  deleteSegment,
  findActiveSegment,
  readableTextOn,
  updateSegment,
  useSegments,
  type Segment,
} from '@/lib/segments'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string | null
  /** Current ad-hoc tag-filter selection (lifted to the route so the
   *  table can apply the AND-filter pre-render). */
  selectedTagIds: string[]
  onSelectedTagIdsChange: (next: string[]) => void
  testIdPrefix?: string
}

export function SegmentChips({
  operatorId,
  selectedTagIds,
  onSelectedTagIdsChange,
  testIdPrefix = 'segment-chips',
}: Props) {
  const segments = useSegments(operatorId)

  // landr-panu — pull the operator's tag set so saved-segment chips can
  // render with the real tag colors (which the segment doesn't store —
  // it stores tag ids only, so a recolor of a tag flows through here).
  // Same query key + staleTime as TagPicker keeps this off the wire.
  const tagsQuery = useQuery<Tag[]>({
    queryKey: ['tags', operatorId ?? 'none'],
    queryFn: () => fetchTags(operatorId as string),
    enabled: !!operatorId,
    staleTime: 30_000,
  })
  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>()
    for (const tag of tagsQuery.data ?? []) m.set(tag.id, tag)
    return m
  }, [tagsQuery.data])

  // Save dialog state — null = closed, otherwise either 'new' or the
  // segment being edited.
  const [saveTarget, setSaveTarget] = useState<Segment | 'new' | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  // Helper: which saved segment (if any) is currently "active" — i.e.
  // its tagIds exactly match the current ad-hoc selection (set-equal).
  const activeSegmentId = useMemo(
    () => findActiveSegment(segments, selectedTagIds),
    [segments, selectedTagIds],
  )

  function onChipClick(segment: Segment) {
    if (activeSegmentId === segment.id) {
      onSelectedTagIdsChange([])
    } else {
      onSelectedTagIdsChange([...segment.tagIds])
    }
  }

  // Don't render the row at all until we know the operator — the table
  // also waits on this, so showing chips before then is confusing.
  if (!operatorId) return null

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid={`${testIdPrefix}-bar`}
    >
      <span className="text-muted-foreground text-xs">
        {t.contacts.segments.label}
      </span>

      {segments.map((segment) => {
        const isActive = activeSegmentId === segment.id
        const fg = readableTextOn(segment.color)
        return (
          <button
            key={segment.id}
            type="button"
            onClick={() => onChipClick(segment)}
            aria-pressed={isActive}
            aria-label={
              isActive
                ? t.contacts.segments.ariaActive(segment.name)
                : t.contacts.segments.ariaApply(segment.name)
            }
            data-testid={`${testIdPrefix}-segment-${segment.id}`}
            className={`inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition ${
              isActive
                ? 'ring-2 ring-offset-1 ring-offset-background'
                : 'hover:opacity-90'
            }`}
            style={{
              backgroundColor: segment.color,
              color: fg,
              // Tailwind's ring-color uses the --tw-ring-color CSS var;
              // we set it inline so the ring matches the chip color even
              // for non-palette hex values.
              ['--tw-ring-color' as string]: segment.color,
            }}
            title={segmentTooltip(segment, tagsById)}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: fg }}
              aria-hidden="true"
            />
            <span className="truncate">{segment.name}</span>
            <span
              className="ml-1 opacity-70"
              aria-hidden="true"
            >{`(${segment.tagIds.length})`}</span>
          </button>
        )
      })}

      {segments.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setManageOpen(true)}
          className="text-muted-foreground h-7 px-2 text-xs"
          data-testid={`${testIdPrefix}-manage`}
          aria-label={t.contacts.segments.manageButton}
        >
          <Settings2 className="size-3" aria-hidden="true" />
          {t.contacts.segments.manageButton}
        </Button>
      ) : null}

      <span className="text-muted-foreground/40 hidden sm:inline" aria-hidden>
        |
      </span>

      <span className="text-muted-foreground text-xs">
        {t.contacts.segments.tagsLabel}
      </span>

      {/* TagPicker is the same control used on detail sheets — keeps
          the UX consistent. operatorId is non-null here (guarded above). */}
      <TagPicker
        operatorId={operatorId}
        selectedIds={selectedTagIds}
        onChange={onSelectedTagIdsChange}
        testIdPrefix={`${testIdPrefix}-tag-picker`}
      />

      {selectedTagIds.length > 0 ? (
        <>
          {!activeSegmentId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSaveTarget('new')}
              className="h-7 gap-1 px-2 text-xs"
              data-testid={`${testIdPrefix}-save`}
            >
              <Plus className="size-3" aria-hidden="true" />
              {t.contacts.segments.saveAsSegment}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onSelectedTagIdsChange([])}
            className="text-muted-foreground h-7 px-2 text-xs"
            data-testid={`${testIdPrefix}-clear`}
          >
            <X className="size-3" aria-hidden="true" />
            {t.contacts.segments.clearTagFilter}
          </Button>
        </>
      ) : null}

      {/* Remount the save dialog on every target switch (key changes)
          so the inner form state can be initialised from useState
          defaults rather than re-seeded via an effect — avoids the
          react-hooks/set-state-in-effect lint and keeps the form
          logic linear. */}
      {saveTarget !== null ? (
        <SegmentSaveDialog
          key={saveTarget === 'new' ? '__new__' : saveTarget.id}
          operatorId={operatorId}
          target={saveTarget}
          initialTagIds={selectedTagIds}
          tagsById={tagsById}
          onOpenChange={(open) => {
            if (!open) setSaveTarget(null)
          }}
          testIdPrefix={`${testIdPrefix}-save-dialog`}
        />
      ) : null}

      <SegmentManageDialog
        operatorId={operatorId}
        open={manageOpen}
        segments={segments}
        tagsById={tagsById}
        onOpenChange={setManageOpen}
        onEdit={(seg) => {
          setManageOpen(false)
          setSaveTarget(seg)
        }}
        testIdPrefix={`${testIdPrefix}-manage-dialog`}
      />
    </div>
  )
}

// ----- helpers --------------------------------------------------------

function segmentTooltip(
  segment: Segment,
  tagsById: Map<string, Tag>,
): string {
  const names = segment.tagIds
    .map((id) => tagsById.get(id)?.name ?? '?')
    .join(' + ')
  return names ? `${segment.name} — ${names}` : segment.name
}

// ----- save dialog ----------------------------------------------------

type SaveDialogProps = {
  operatorId: string
  /** Either the segment being edited or the string 'new' for create.
   *  Never null — the parent un-mounts on close so this component never
   *  has to render a hidden state. */
  target: Segment | 'new'
  initialTagIds: string[]
  tagsById: Map<string, Tag>
  onOpenChange: (open: boolean) => void
  testIdPrefix: string
}

function SegmentSaveDialog({
  operatorId,
  target,
  initialTagIds,
  tagsById,
  onOpenChange,
  testIdPrefix,
}: SaveDialogProps) {
  // `target` is stable for the lifetime of this component — the parent
  // remounts on switch via a key (see usage in SegmentChips). That lets
  // us derive initial form state straight from props without a sync
  // effect, dodging react-hooks/set-state-in-effect.
  const editing = target !== 'new'
  const initialName = editing ? target.name : ''
  const initialTags = editing ? target.tagIds : initialTagIds
  const initialColor = editing ? target.color : SEGMENT_PALETTE[0]

  const [name, setName] = useState(initialName)
  const [tagIds, setTagIds] = useState<string[]>(initialTags)
  const [color, setColor] = useState<string>(initialColor)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t.contacts.segments.saveValidationName)
      return
    }
    if (tagIds.length === 0) {
      setError(t.contacts.segments.saveValidationTags)
      return
    }
    if (editing) {
      const updated = updateSegment(operatorId, target.id, {
        name: trimmed,
        tagIds,
        color,
      })
      if (updated) toast.success(t.contacts.segments.toastUpdated(updated.name))
    } else {
      const created = createSegment(operatorId, {
        name: trimmed,
        tagIds,
        color,
      })
      if (created) toast.success(t.contacts.segments.toastCreated(created.name))
    }
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent data-testid={testIdPrefix}>
        <DialogHeader>
          <DialogTitle>{t.contacts.segments.saveDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.contacts.segments.saveDialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${testIdPrefix}-name`}>
              {t.contacts.segments.saveNameLabel}
            </Label>
            <Input
              id={`${testIdPrefix}-name`}
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder={t.contacts.segments.saveNamePlaceholder}
              data-testid={`${testIdPrefix}-name-input`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t.contacts.segments.saveTagsLabel}</Label>
            <TagPicker
              operatorId={operatorId}
              selectedIds={tagIds}
              onChange={(next) => {
                setTagIds(next)
                setError(null)
              }}
              testIdPrefix={`${testIdPrefix}-tag-picker`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t.contacts.segments.saveColorLabel}</Label>
            <div
              className="flex flex-wrap gap-1.5"
              data-testid={`${testIdPrefix}-color-row`}
            >
              {SEGMENT_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  aria-label={`Color ${c}`}
                  data-testid={`${testIdPrefix}-color-${c}`}
                  className={`h-6 w-6 rounded-full border-2 transition ${
                    color === c
                      ? 'border-foreground'
                      : 'border-transparent hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error ? (
            <p
              className="text-destructive text-xs"
              role="alert"
              data-testid={`${testIdPrefix}-error`}
            >
              {error}
            </p>
          ) : null}

          {/* Inline tag preview so the operator can sanity-check what
              they're saving without leaving the dialog. */}
          {tagIds.length > 0 ? (
            <p
              className="text-muted-foreground text-xs"
              data-testid={`${testIdPrefix}-tag-preview`}
            >
              {tagIds.map((id) => tagsById.get(id)?.name ?? '?').join(' + ')}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid={`${testIdPrefix}-cancel`}
          >
            {t.contacts.segments.saveCancel}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            data-testid={`${testIdPrefix}-submit`}
          >
            {t.contacts.segments.saveSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ----- manage dialog --------------------------------------------------

type ManageDialogProps = {
  operatorId: string
  open: boolean
  segments: Segment[]
  tagsById: Map<string, Tag>
  onOpenChange: (open: boolean) => void
  onEdit: (segment: Segment) => void
  testIdPrefix: string
}

function SegmentManageDialog({
  operatorId,
  open,
  segments,
  tagsById,
  onOpenChange,
  onEdit,
  testIdPrefix,
}: ManageDialogProps) {
  function handleDelete(segment: Segment) {
    // Use a native confirm — the dashboard uses native confirms for low-
    // stakes destructive actions on transient data (e.g. saved views,
    // localStorage prefs). Segments are localStorage-only so the user
    // can always re-create them.
    const ok = window.confirm(t.contacts.segments.ariaDeleteConfirm(segment.name))
    if (!ok) return
    const removed = deleteSegment(operatorId, segment.id)
    if (removed) toast.success(t.contacts.segments.toastDeleted(segment.name))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testIdPrefix}>
        <DialogHeader>
          <DialogTitle>{t.contacts.segments.manageDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.contacts.segments.manageDialogDescription}
          </DialogDescription>
        </DialogHeader>

        {segments.length === 0 ? (
          <p
            className="text-muted-foreground py-6 text-center text-xs"
            data-testid={`${testIdPrefix}-empty`}
          >
            {t.contacts.segments.manageEmpty}
          </p>
        ) : (
          <ul
            className="flex flex-col gap-2"
            data-testid={`${testIdPrefix}-list`}
          >
            {segments.map((segment) => (
              <li
                key={segment.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
                data-testid={`${testIdPrefix}-item-${segment.id}`}
              >
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {segment.name}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {segment.tagIds
                      .map((id) => tagsById.get(id)?.name ?? '?')
                      .join(' + ')}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit(segment)}
                  className="h-7 px-2 text-xs"
                  data-testid={`${testIdPrefix}-edit-${segment.id}`}
                  aria-label={`${t.contacts.segments.manageEdit} ${segment.name}`}
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  {t.contacts.segments.manageEdit}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(segment)}
                  className="text-destructive h-7 px-2 text-xs"
                  data-testid={`${testIdPrefix}-delete-${segment.id}`}
                  aria-label={`${t.contacts.segments.manageDelete} ${segment.name}`}
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                  {t.contacts.segments.manageDelete}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid={`${testIdPrefix}-close`}
          >
            {t.contacts.segments.manageClose}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
