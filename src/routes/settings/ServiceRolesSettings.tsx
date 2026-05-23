/**
 * Settings → Service roles (landr-1tqx).
 *
 * Operator-scoped CRUD over the service_roles table: the participant
 * roles (Pilot / Passenger / Diver…) the embedded booking widget renders.
 * Every operator is auto-seeded with one default role; this surface lets
 * them add bespoke ones, rename (label), reorder (sort_order swap),
 * and activate/deactivate.
 *
 * Mirrors the TagsSettings shape (single inline manager + per-row edit).
 * Two server-side guards surface as toasts here:
 *   - duplicate `code` → 409 service_role_code_taken
 *   - last active role → 409 last_active_role (delete + deactivate both)
 * The api-client unwraps FastAPI's `detail.error` into the thrown Error
 * message, so we map those codes to friendly copy.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createServiceRole,
  deleteServiceRole,
  fetchServiceRoles,
  labelToCode,
  updateServiceRole,
  type ServiceRole,
} from '@/lib/serviceRoles'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

const QK = (operatorId: string) => ['service-roles', operatorId]

/** Translate a known server error code into friendly copy; fall back to
 *  the raw message for anything unexpected. */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === 'service_role_code_taken') return t.serviceRolesSettings.dupeCode
  if (msg === 'last_active_role') return t.serviceRolesSettings.lastActiveRole
  return msg
}

export function ServiceRolesSettings() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.serviceRoles },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.serviceRoles}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header>
          <h1 className="text-xl font-semibold">
            {t.serviceRolesSettings.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t.serviceRolesSettings.subtitle}
          </p>
        </header>
        <p className="text-muted-foreground text-sm">
          {t.serviceRolesSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <ServiceRolesManager operatorId={currentOperatorId} />
    </>
  )
}

type ManagerProps = {
  operatorId: string
}

export function ServiceRolesManager({ operatorId }: ManagerProps) {
  const queryClient = useQueryClient()
  const rolesQuery = useQuery<ServiceRole[]>({
    queryKey: QK(operatorId),
    queryFn: () => fetchServiceRoles(operatorId),
  })

  const roles = useMemo(
    () =>
      [...(rolesQuery.data ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
      ),
    [rolesQuery.data],
  )

  const [newLabel, setNewLabel] = useState('')

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QK(operatorId) })

  const createMutation = useMutation({
    mutationFn: (label: string) => {
      const trimmed = label.trim()
      const code = labelToCode(trimmed) || `role_${Date.now()}`
      // New role lands at the end of the current order.
      const nextSort =
        roles.length === 0
          ? 0
          : Math.max(...roles.map((r) => r.sort_order)) + 1
      return createServiceRole(operatorId, {
        code,
        label: trimmed,
        sort_order: nextSort,
      })
    },
    onSuccess: () => {
      setNewLabel('')
      invalidate()
      toast.success(t.serviceRolesSettings.toastCreated)
    },
    onError: (err: unknown) =>
      toast.error(t.serviceRolesSettings.toastCreateError, {
        description: friendlyError(err),
      }),
  })

  const trimmed = newLabel.trim()
  const dupeCode =
    trimmed.length > 0 &&
    roles.some((r) => r.code === (labelToCode(trimmed) || ''))
  const canCreate = trimmed.length > 0 && !dupeCode && !createMutation.isPending

  function handleCreate() {
    if (!canCreate) return
    createMutation.mutate(newLabel)
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">
          {t.serviceRolesSettings.title}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t.serviceRolesSettings.subtitle}
        </p>
      </header>

      {/* ---- New role form ----------------------------------------- */}
      <section
        className="rounded-md border p-4"
        data-testid="service-roles-create"
      >
        <h2 className="text-sm font-medium">
          {t.serviceRolesSettings.createTitle}
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" htmlFor="sr-new-label">
              {t.serviceRolesSettings.fieldLabel}
            </label>
            <Input
              id="sr-new-label"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreate()
                }
              }}
              placeholder={t.serviceRolesSettings.placeholderLabel}
              maxLength={200}
              className="h-8 text-sm"
              data-testid="service-roles-create-label"
            />
            {trimmed ? (
              <span className="text-muted-foreground text-xs">
                {t.serviceRolesSettings.fieldCode}:{' '}
                <code>{labelToCode(trimmed) || '—'}</code>
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">
                {t.serviceRolesSettings.codeHint}
              </span>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={handleCreate}
            data-testid="service-roles-create-submit"
          >
            {createMutation.isPending
              ? t.serviceRolesSettings.creating
              : t.serviceRolesSettings.create}
          </Button>
        </div>
        {dupeCode ? (
          <p className="text-destructive mt-2 text-xs" role="alert">
            {t.serviceRolesSettings.dupeCode}
          </p>
        ) : null}
      </section>

      {/* ---- Existing roles ---------------------------------------- */}
      <section data-testid="service-roles-list">
        <h2 className="text-sm font-medium">
          {t.serviceRolesSettings.existingTitle}
        </h2>
        {rolesQuery.isPending ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t.serviceRolesSettings.loading}
          </p>
        ) : rolesQuery.isError ? (
          <p className="text-destructive mt-2 text-sm" role="alert">
            {(rolesQuery.error as Error).message}
          </p>
        ) : roles.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t.serviceRolesSettings.empty}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y rounded-md border">
            {roles.map((role, idx) => (
              <ServiceRoleRow
                key={role.id}
                role={role}
                roles={roles}
                index={idx}
                operatorId={operatorId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type RowProps = {
  role: ServiceRole
  roles: ServiceRole[]
  index: number
  operatorId: string
}

function ServiceRoleRow({ role, roles, index, operatorId }: RowProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(role.label)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QK(operatorId) })

  const patchMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateServiceRole>[2]) =>
      updateServiceRole(operatorId, role.id, patch),
    onSuccess: () => {
      invalidate()
      setEditing(false)
      toast.success(t.serviceRolesSettings.toastUpdated)
    },
    onError: (err: unknown) =>
      toast.error(t.serviceRolesSettings.toastUpdateError, {
        description: friendlyError(err),
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteServiceRole(operatorId, role.id),
    onSuccess: () => {
      invalidate()
      toast.success(t.serviceRolesSettings.toastDeleted)
    },
    onError: (err: unknown) =>
      toast.error(t.serviceRolesSettings.toastDeleteError, {
        description: friendlyError(err),
      }),
  })

  // Reorder = swap sort_order with the adjacent row. Two PATCHes; the list
  // re-sorts on the invalidated refetch.
  const reorderMutation = useMutation({
    mutationFn: async (dir: 'up' | 'down') => {
      const swapWith = dir === 'up' ? roles[index - 1] : roles[index + 1]
      if (!swapWith) return
      await Promise.all([
        updateServiceRole(operatorId, role.id, {
          sort_order: swapWith.sort_order,
        }),
        updateServiceRole(operatorId, swapWith.id, {
          sort_order: role.sort_order,
        }),
      ])
    },
    onSuccess: () => invalidate(),
    onError: (err: unknown) =>
      toast.error(t.serviceRolesSettings.toastReorderError, {
        description: friendlyError(err),
      }),
  })

  const busy =
    patchMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending

  if (editing) {
    const dirty = label.trim() !== role.label
    return (
      <li
        className="flex flex-wrap items-end gap-3 p-3"
        data-testid={`service-role-row-${role.id}`}
      >
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium"
            htmlFor={`sr-${role.id}-label`}
          >
            {t.serviceRolesSettings.fieldLabel}
          </label>
          <Input
            id={`sr-${role.id}-label`}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
            className="h-8 text-sm"
            data-testid={`service-role-row-${role.id}-label`}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || patchMutation.isPending}
            onClick={() => patchMutation.mutate({ label: label.trim() })}
            data-testid={`service-role-row-${role.id}-save`}
          >
            {patchMutation.isPending
              ? t.serviceRolesSettings.saving
              : t.serviceRolesSettings.save}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={patchMutation.isPending}
            onClick={() => {
              setLabel(role.label)
              setEditing(false)
            }}
          >
            {t.serviceRolesSettings.cancel}
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li
      className="flex items-center gap-3 p-3"
      data-testid={`service-role-row-${role.id}`}
    >
      {/* reorder controls */}
      <span className="flex flex-col">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t.serviceRolesSettings.moveUp}
          disabled={index === 0 || busy}
          onClick={() => reorderMutation.mutate('up')}
          data-testid={`service-role-row-${role.id}-up`}
        >
          <ChevronUpIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t.serviceRolesSettings.moveDown}
          disabled={index === roles.length - 1 || busy}
          onClick={() => reorderMutation.mutate('down')}
          data-testid={`service-role-row-${role.id}-down`}
        >
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </span>

      <span className="flex flex-1 flex-col">
        <span className={`text-sm ${role.active ? '' : 'text-muted-foreground'}`}>
          {role.label}{' '}
          <span className="text-muted-foreground text-xs">
            {t.serviceRolesSettings.codeBadge(role.code)}
          </span>
          {!role.active ? (
            <span className="bg-muted text-muted-foreground ml-2 rounded px-1.5 py-0.5 text-xs">
              {t.serviceRolesSettings.inactiveBadge}
            </span>
          ) : null}
        </span>
      </span>

      <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setLabel(role.label)
            setEditing(true)
          }}
          data-testid={`service-role-row-${role.id}-edit`}
        >
          {t.serviceRolesSettings.edit}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => patchMutation.mutate({ active: !role.active })}
          data-testid={`service-role-row-${role.id}-toggle-active`}
        >
          {role.active
            ? t.serviceRolesSettings.deactivate
            : t.serviceRolesSettings.activate}
        </Button>
        {confirmDelete ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              data-testid={`service-role-row-${role.id}-confirm-delete`}
            >
              {deleteMutation.isPending
                ? t.serviceRolesSettings.deleting
                : t.serviceRolesSettings.confirmDelete}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
            >
              {t.serviceRolesSettings.cancel}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            data-testid={`service-role-row-${role.id}-delete`}
          >
            {t.serviceRolesSettings.delete}
          </Button>
        )}
      </span>
    </li>
  )
}
