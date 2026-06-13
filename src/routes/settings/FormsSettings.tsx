/**
 * Settings → Forms (landr-71kz.5).
 *
 * Form library shell: list operator forms + create / rename / retire
 * (active=false) / restore. All writes go direct Supabase REST (RLS +
 * audit triggers cover these plain row ops; no FastAPI endpoint needed
 * per the hybrid write-routing convention).
 *
 * Gated behind the `form_builder` feature (see entitlements-map.ts).
 * The field-builder editor at /settings/forms/:id is sibling landr-71kz.6
 * — a routed stub is wired here so links don't 404.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PencilIcon,
  PlusIcon,
  WandSparklesIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createForm,
  fetchForms,
  nameToFormKey,
  patchForm,
  retireForm,
  restoreForm,
  type Form,
} from '@/lib/forms'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// ---- page shell -------------------------------------------------------

export function FormsSettings() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.forms },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.forms}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <p className="text-muted-foreground text-sm">
          {t.formsSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <FormsManager operatorId={currentOperatorId} />
    </>
  )
}

// ---- manager ----------------------------------------------------------

type ManagerProps = { operatorId: string }

function FormsManager({ operatorId }: ManagerProps) {
  const queryClient = useQueryClient()

  const formsQuery = useQuery<Form[]>({
    queryKey: ['forms', operatorId],
    queryFn: () => fetchForms(operatorId),
  })

  const [draftName, setDraftName] = useState('')
  const [draftKey, setDraftKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['forms', operatorId] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createForm(operatorId, {
        name: draftName.trim(),
        key: draftKey.trim() || nameToFormKey(draftName.trim()),
      }),
    onSuccess: () => {
      invalidate()
      setDraftName('')
      setDraftKey('')
      setKeyTouched(false)
      toast.success(t.formsSettings.toastCreated)
    },
    onError: (err: Error) => {
      toast.error(t.formsSettings.toastCreateError, { description: err.message })
    },
  })

  const trimmedName = draftName.trim()
  const trimmedKey = (draftKey.trim() || nameToFormKey(trimmedName)).slice(0, 64)
  const existingKeys = new Set((formsQuery.data ?? []).map((f) => f.key))
  const dupeKey = !!trimmedKey && existingKeys.has(trimmedKey)
  const canCreate =
    trimmedName.length > 0 &&
    trimmedKey.length > 0 &&
    !dupeKey &&
    !createMutation.isPending

  const forms = formsQuery.data ?? []
  const activeForms = forms.filter((f) => f.active)
  const retiredForms = forms.filter((f) => !f.active)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t.formsSettings.title}</h1>
        <p className="text-muted-foreground text-sm">{t.formsSettings.subtitle}</p>
      </header>

      {/* ---- Create form -------------------------------------------- */}
      <section
        className="rounded-md border p-4"
        data-testid="forms-settings-create"
      >
        <h2 className="text-sm font-medium">{t.formsSettings.createTitle}</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="form-new-name">
              {t.formsSettings.fieldName}
            </label>
            <Input
              id="form-new-name"
              type="text"
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value)
                if (!keyTouched) {
                  setDraftKey(nameToFormKey(e.target.value))
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (canCreate) createMutation.mutate()
                }
              }}
              placeholder={t.formsSettings.placeholderName}
              maxLength={200}
              className="h-8 text-sm sm:w-60"
              data-testid="forms-settings-create-name"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="form-new-key">
              {t.formsSettings.fieldKey}
            </label>
            <Input
              id="form-new-key"
              type="text"
              value={draftKey}
              onChange={(e) => {
                setKeyTouched(true)
                // Sanitise on the way in: lowercase + underscore only
                setDraftKey(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '_')
                    .replace(/^_+/, '')
                    .slice(0, 64),
                )
              }}
              placeholder={t.formsSettings.placeholderKey}
              maxLength={64}
              className="h-8 font-mono text-sm sm:w-48"
              data-testid="forms-settings-create-key"
            />
          </div>

          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={() => createMutation.mutate()}
            data-testid="forms-settings-create-submit"
          >
            <PlusIcon className="size-4" />
            {createMutation.isPending
              ? t.formsSettings.creating
              : t.formsSettings.create}
          </Button>
        </div>
        {dupeKey ? (
          <p className="text-destructive mt-2 text-xs" role="alert">
            {t.formsSettings.dupeKey}
          </p>
        ) : null}
      </section>

      {/* ---- Active forms list --------------------------------------- */}
      <section data-testid="forms-settings-active-list">
        <h2 className="text-sm font-medium">{t.formsSettings.activeTitle}</h2>
        {formsQuery.isPending ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t.formsSettings.loading}
          </p>
        ) : formsQuery.isError ? (
          <p className="text-destructive mt-2 text-sm" role="alert">
            {(formsQuery.error as Error).message}
          </p>
        ) : activeForms.length === 0 ? (
          <p className="text-muted-foreground mt-2 rounded-md border border-dashed p-4 text-center text-sm">
            {t.formsSettings.emptyActive}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y rounded-md border">
            {activeForms.map((form) => (
              <FormRow
                key={form.id}
                form={form}
                operatorId={operatorId}
                onChanged={invalidate}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Retired forms ------------------------------------------- */}
      {retiredForms.length > 0 && (
        <section data-testid="forms-settings-retired-list">
          <h2 className="text-sm font-medium">{t.formsSettings.retiredTitle}</h2>
          <ul className="mt-3 flex flex-col divide-y rounded-md border">
            {retiredForms.map((form) => (
              <FormRow
                key={form.id}
                form={form}
                operatorId={operatorId}
                onChanged={invalidate}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ---- one form row -----------------------------------------------------

type RowProps = {
  form: Form
  operatorId: string
  onChanged: () => void
}

function FormRow({ form, operatorId, onChanged }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(form.name)
  const [confirmRetire, setConfirmRetire] = useState(false)

  const renameMutation = useMutation({
    mutationFn: (next: string) =>
      patchForm(operatorId, form.id, { name: next.trim() }),
    onSuccess: () => {
      onChanged()
      toast.success(t.formsSettings.toastRenamed)
      setEditing(false)
    },
    onError: (err: Error) => {
      toast.error(t.formsSettings.toastRenameError, { description: err.message })
    },
  })

  const retireMutation = useMutation({
    mutationFn: () => retireForm(operatorId, form.id),
    onSuccess: () => {
      onChanged()
      toast.success(t.formsSettings.toastRetired)
      setConfirmRetire(false)
    },
    onError: (err: Error) => {
      toast.error(t.formsSettings.toastRetireError, { description: err.message })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: () => restoreForm(operatorId, form.id),
    onSuccess: () => {
      onChanged()
      toast.success(t.formsSettings.toastRestored)
    },
    onError: (err: Error) => {
      toast.error(t.formsSettings.toastRestoreError, { description: err.message })
    },
  })

  const dirty = name.trim() !== form.name

  if (editing) {
    return (
      <li
        className="flex flex-wrap items-center gap-2 p-3"
        data-testid={`form-row-${form.id}`}
      >
        <form
          className="flex flex-1 flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) renameMutation.mutate(name)
          }}
        >
          <Input
            autoFocus
            aria-label={t.formsSettings.fieldName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="h-8 min-w-40 flex-1 text-sm"
            data-testid={`form-row-${form.id}-name`}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!dirty || renameMutation.isPending}
          >
            {renameMutation.isPending
              ? t.formsSettings.saving
              : t.formsSettings.save}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={renameMutation.isPending}
            onClick={() => {
              setName(form.name)
              setEditing(false)
            }}
          >
            {t.formsSettings.cancel}
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li
      className="flex flex-wrap items-center gap-2 p-3"
      data-testid={`form-row-${form.id}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {form.name}
          {!form.active && (
            <span className="text-muted-foreground ml-2 text-[10px] uppercase tracking-wide">
              {t.formsSettings.retiredBadge}
            </span>
          )}
        </span>
        <span className="text-muted-foreground truncate font-mono text-xs">
          {form.key}
          <span className="ml-2">v{form.version}</span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {form.active ? (
          <>
            {/* Link to the field-builder editor (landr-71kz.6 stub) */}
            <Button
              asChild
              type="button"
              size="sm"
              variant="outline"
              data-testid={`form-row-${form.id}-edit-fields`}
            >
              <Link to={`/settings/forms/${form.id}`}>
                <WandSparklesIcon className="size-3.5" />
                {t.formsSettings.editFields}
              </Link>
            </Button>

            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t.formsSettings.rename}
              onClick={() => {
                setName(form.name)
                setEditing(true)
              }}
              data-testid={`form-row-${form.id}-rename`}
            >
              <PencilIcon className="size-3.5" />
            </Button>

            {confirmRetire ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={retireMutation.isPending}
                  onClick={() => retireMutation.mutate()}
                  data-testid={`form-row-${form.id}-confirm-retire`}
                >
                  {retireMutation.isPending
                    ? t.formsSettings.retiring
                    : t.formsSettings.confirmRetire}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRetire(false)}
                >
                  {t.formsSettings.cancel}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t.formsSettings.retire}
                onClick={() => setConfirmRetire(true)}
                data-testid={`form-row-${form.id}-retire`}
              >
                <ArchiveIcon className="size-3.5" />
              </Button>
            )}
          </>
        ) : (
          /* Retired row — restore only */
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={restoreMutation.isPending}
            onClick={() => restoreMutation.mutate()}
            data-testid={`form-row-${form.id}-restore`}
          >
            <ArchiveRestoreIcon className="size-3.5" />
            {restoreMutation.isPending
              ? t.formsSettings.restoring
              : t.formsSettings.restore}
          </Button>
        )}
      </div>
    </li>
  )
}
