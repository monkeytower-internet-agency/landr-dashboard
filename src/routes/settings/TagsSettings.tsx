/**
 * Settings → Tags (landr-iz58).
 *
 * Operator-scoped CRUD over the operator_tags table. The page renders a
 * single TagsManager that handles list/create/rename/recolor/delete in
 * one surface (similar shape to the PickupLocations + LocationsTable
 * pair). Kept inline because v1 tag management is small enough that a
 * dedicated component split would just add indirection.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TagChip } from '@/components/tags/TagChip'
import {
  createTag,
  defaultColorFor,
  deleteTag,
  fetchTags,
  patchTag,
  TAG_PALETTE,
  type Tag,
} from '@/lib/tags'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function TagsSettings() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.tags },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.tags}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <p className="text-muted-foreground text-sm">
          {t.tagsSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <TagsManager operatorId={currentOperatorId} />
    </>
  )
}

type ManagerProps = {
  operatorId: string
}

export function TagsManager({ operatorId }: ManagerProps) {
  const queryClient = useQueryClient()
  const tagsQuery = useQuery<Tag[]>({
    queryKey: ['tags', operatorId],
    queryFn: () => fetchTags(operatorId),
  })

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(TAG_PALETTE[5])

  const createMutation = useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      createTag(operatorId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', operatorId] })
      setNewName('')
      toast.success(t.tagsSettings.toastCreated)
    },
    onError: (err: Error) => {
      toast.error(t.tagsSettings.toastCreateError, { description: err.message })
    },
  })

  const trimmed = newName.trim()
  const exact = (tagsQuery.data ?? []).find(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  )
  const canCreate = trimmed.length > 0 && !exact && !createMutation.isPending

  function handleCreate() {
    if (!canCreate) return
    createMutation.mutate({ name: trimmed, color: newColor })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---- New tag form ------------------------------------------- */}
      <section
        className="rounded-md border p-4"
        data-testid="tags-settings-create"
      >
        <h2 className="text-sm font-medium">{t.tagsSettings.createTitle}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="tag-new-name">
              {t.tagsSettings.fieldName}
            </label>
            <Input
              id="tag-new-name"
              type="text"
              value={newName}
              onChange={(e) => {
                const v = e.target.value
                setNewName(v)
                // Re-derive a deterministic default colour as the user types
                // (until they pick one explicitly). We accept this as the
                // initial nudge — they can still click a swatch to override.
                if (v.trim() && !exact) {
                  setNewColor(defaultColorFor(v.trim()))
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreate()
                }
              }}
              placeholder={t.tagsSettings.placeholderName}
              maxLength={64}
              className="h-8 text-sm"
              data-testid="tags-settings-create-name"
            />
          </div>

          <ColorPalette
            value={newColor}
            onChange={setNewColor}
            testId="tags-settings-create-color"
          />

          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={handleCreate}
            data-testid="tags-settings-create-submit"
          >
            {createMutation.isPending
              ? t.tagsSettings.creating
              : t.tagsSettings.create}
          </Button>
        </div>
        {exact ? (
          <p className="text-destructive mt-2 text-xs" role="alert">
            {t.tagsSettings.dupeName}
          </p>
        ) : null}
      </section>

      {/* ---- Existing tags ----------------------------------------- */}
      <section data-testid="tags-settings-list">
        <h2 className="text-sm font-medium">{t.tagsSettings.existingTitle}</h2>
        {tagsQuery.isPending ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t.tagsSettings.loading}
          </p>
        ) : tagsQuery.isError ? (
          <p className="text-destructive mt-2 text-sm" role="alert">
            {(tagsQuery.error as Error).message}
          </p>
        ) : (tagsQuery.data ?? []).length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t.tagsSettings.empty}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y rounded-md border">
            {(tagsQuery.data ?? []).map((tag) => (
              <TagRow key={tag.id} tag={tag} operatorId={operatorId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---- swatch palette --------------------------------------------------

type PaletteProps = {
  value: string
  onChange: (next: string) => void
  testId?: string
}

function ColorPalette({ value, onChange, testId }: PaletteProps) {
  return (
    <fieldset className="flex flex-col gap-1" data-testid={testId}>
      <legend className="text-xs font-medium">{t.tagsSettings.fieldColor}</legend>
      <div className="flex flex-wrap gap-1">
        {TAG_PALETTE.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={`h-6 w-6 rounded-full border ${selected ? 'border-foreground ring-2 ring-offset-1' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`Choose color ${c}`}
              aria-pressed={selected}
              data-testid={`${testId}-swatch-${c}`}
            />
          )
        })}
      </div>
    </fieldset>
  )
}

// ---- one tag row -----------------------------------------------------

type RowProps = {
  tag: Tag
  operatorId: string
}

function TagRow({ tag, operatorId }: RowProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patchMutation = useMutation({
    mutationFn: (patch: { name?: string; color?: string }) =>
      patchTag(operatorId, tag.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', operatorId] })
      toast.success(t.tagsSettings.toastUpdated)
      setEditing(false)
    },
    onError: (err: Error) => {
      toast.error(t.tagsSettings.toastUpdateError, { description: err.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTag(operatorId, tag.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', operatorId] })
      // Existing assignments stay in the audit trail but vanish from
      // chips + pickers. Invalidate the booking / contact query caches
      // so any sheets currently open re-fetch their tag lists.
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(t.tagsSettings.toastDeleted)
    },
    onError: (err: Error) => {
      toast.error(t.tagsSettings.toastDeleteError, { description: err.message })
    },
  })

  const dirty = name.trim() !== tag.name || color.toLowerCase() !== tag.color.toLowerCase()

  if (!editing) {
    return (
      <li className="flex items-center gap-3 p-3" data-testid={`tag-row-${tag.id}`}>
        <TagChip tag={tag} />
        <span className="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            data-testid={`tag-row-${tag.id}-edit`}
          >
            {t.tagsSettings.edit}
          </Button>
          {confirmDelete ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                data-testid={`tag-row-${tag.id}-confirm-delete`}
              >
                {deleteMutation.isPending
                  ? t.tagsSettings.deleting
                  : t.tagsSettings.confirmDelete}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                {t.tagsSettings.cancel}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              data-testid={`tag-row-${tag.id}-delete`}
            >
              {t.tagsSettings.delete}
            </Button>
          )}
        </span>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-end gap-3 p-3" data-testid={`tag-row-${tag.id}`}>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" htmlFor={`tag-${tag.id}-name`}>
          {t.tagsSettings.fieldName}
        </label>
        <Input
          id={`tag-${tag.id}-name`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          className="h-8 text-sm"
          data-testid={`tag-row-${tag.id}-name`}
        />
      </div>
      <ColorPalette
        value={color}
        onChange={setColor}
        testId={`tag-row-${tag.id}-color`}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || patchMutation.isPending}
          onClick={() => {
            const patch: { name?: string; color?: string } = {}
            if (name.trim() !== tag.name) patch.name = name.trim()
            if (color.toLowerCase() !== tag.color.toLowerCase()) patch.color = color
            patchMutation.mutate(patch)
          }}
          data-testid={`tag-row-${tag.id}-save`}
        >
          {patchMutation.isPending
            ? t.tagsSettings.saving
            : t.tagsSettings.save}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={patchMutation.isPending}
          onClick={() => {
            setName(tag.name)
            setColor(tag.color)
            setEditing(false)
          }}
        >
          {t.tagsSettings.cancel}
        </Button>
      </div>
    </li>
  )
}
