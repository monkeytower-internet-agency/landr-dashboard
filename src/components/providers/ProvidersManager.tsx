// landr-funh — Settings → Providers roster manager.
//
// Operator-scoped CRUD over the providers table (the operational delivery
// roster: instructors, pilots, drivers — NOT operator_memberships). Single
// surface that handles list / create / edit / activate-deactivate / delete,
// mirroring the TagsManager + LocationsTable shape.
//
// Reads + writes go through the staff_providers FastAPI router (lib/providers)
// so the whole surface sits behind one operator-membership auth gate.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PencilIcon, Trash2Icon, UserPlusIcon } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  createProvider,
  deleteProvider,
  fetchProviderRoleTypes,
  fetchProviderRoster,
  updateProvider,
  type Provider,
  type ProviderRoleType,
} from '@/lib/providers'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
}

const ROSTER_KEY = 'provider-roster'
const ROLE_TYPES_KEY = 'provider-role-types'

export function ProvidersManager({ operatorId }: Props) {
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<Provider | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const rosterQuery = useQuery<Provider[]>({
    queryKey: [ROSTER_KEY, operatorId],
    queryFn: () => fetchProviderRoster(operatorId),
    enabled: !!operatorId,
  })

  const roleTypesQuery = useQuery<ProviderRoleType[]>({
    queryKey: [ROLE_TYPES_KEY, operatorId],
    queryFn: () => fetchProviderRoleTypes(operatorId),
    enabled: !!operatorId,
  })

  const providers = rosterQuery.data ?? []
  const roleTypes = roleTypesQuery.data ?? []
  const roleLabel = (id: string | null): string => {
    if (!id) return t.providers.roleNone
    return roleTypes.find((r) => r.id === id)?.label ?? t.providers.roleNone
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [ROSTER_KEY, operatorId] })
  }

  const toggleActiveMutation = useMutation({
    mutationFn: (p: Provider) =>
      updateProvider(operatorId, p.id, { active: !p.active }),
    onSuccess: () => {
      toast.success(t.providers.toastUpdated)
      invalidate()
    },
    onError: (err: Error) =>
      toast.error(t.providers.toastError, { description: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: (p: Provider) => deleteProvider(operatorId, p.id),
    onSuccess: () => {
      toast.success(t.providers.toastDeleted)
      setDeleteTarget(null)
      invalidate()
    },
    onError: (err: Error) =>
      toast.error(t.providers.toastError, { description: err.message }),
  })

  function openCreate() {
    setEditTarget(null)
    setFormOpen(true)
  }

  function openEdit(p: Provider) {
    setEditTarget(p)
    setFormOpen(true)
  }

  const busy = toggleActiveMutation.isPending || deleteMutation.isPending

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t.providers.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.providers.subtitle}
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <UserPlusIcon className="size-4" />
          {t.providers.addProvider}
        </Button>
      </header>

      {rosterQuery.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {rosterQuery.error?.message ?? t.providers.error}
        </p>
      ) : rosterQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t.providers.loading}</p>
      ) : providers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.providers.empty}</p>
      ) : (
        // landr-3qkr.6 — overflow-x-auto so the 4-column providers roster
        // scrolls inside its box on a 360px phone instead of being clipped.
        <div className="overflow-x-auto rounded-md border">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.providers.columnName}</TableHead>
              <TableHead>{t.providers.columnRole}</TableHead>
              <TableHead>{t.providers.columnStatus}</TableHead>
              <TableHead className="text-right">
                {t.providers.columnActions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.id} data-testid={`provider-row-${p.id}`}>
                <TableCell className="font-medium">{p.display_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {roleLabel(p.default_role_id)}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      p.active
                        ? 'text-foreground text-xs'
                        : 'text-muted-foreground text-xs italic'
                    }
                  >
                    {p.active
                      ? t.providers.statusActive
                      : t.providers.statusInactive}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActiveMutation.mutate(p)}
                      disabled={busy}
                    >
                      {p.active
                        ? t.providers.actionDeactivate
                        : t.providers.actionActivate}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(p)}
                      disabled={busy}
                      aria-label={t.providers.actionEdit}
                      title={t.providers.actionEdit}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(p)}
                      disabled={busy}
                      aria-label={t.providers.actionDelete}
                      title={t.providers.actionDelete}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
      )}

      {/* Keyed remount so the draft state seeds fresh per open/target — no
          render-phase setState needed. */}
      {formOpen ? (
        <ProviderFormDialog
          key={editTarget?.id ?? 'new'}
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditTarget(null)
          }}
          operatorId={operatorId}
          roleTypes={roleTypes}
          editTarget={editTarget}
          onSaved={invalidate}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (deleteMutation.isPending) return
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.providers.deleteDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.providers.deleteDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t.providers.deleteDialogCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget)
              }}
            >
              {deleteMutation.isPending
                ? t.providers.deleteDialogDeleting
                : t.providers.deleteDialogConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---- create/edit dialog ---------------------------------------------------

type FormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  operatorId: string
  roleTypes: ProviderRoleType[]
  editTarget: Provider | null
  onSaved: () => void
}

function ProviderFormDialog({
  open,
  onOpenChange,
  operatorId,
  roleTypes,
  editTarget,
  onSaved,
}: FormProps) {
  const isEdit = editTarget !== null
  // Seeded once at mount — the parent keys this component by target id so a
  // new instance mounts (with fresh seed) each time the dialog opens.
  const [name, setName] = useState(editTarget?.display_name ?? '')
  const [roleId, setRoleId] = useState<string>(editTarget?.default_role_id ?? '')

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim()
      const role = roleId || null
      if (isEdit && editTarget) {
        return updateProvider(operatorId, editTarget.id, {
          display_name: trimmed,
          default_role_id: role,
        })
      }
      return createProvider(operatorId, {
        display_name: trimmed,
        default_role_id: role,
      })
    },
    onSuccess: () => {
      toast.success(isEdit ? t.providers.toastUpdated : t.providers.toastCreated)
      onSaved()
      onOpenChange(false)
    },
    onError: (err: Error) =>
      toast.error(t.providers.toastError, { description: err.message }),
  })

  const ready = name.trim().length > 0

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isEdit ? t.providers.formEditTitle : t.providers.formCreateTitle}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider-name">{t.providers.fieldName}</Label>
            <Input
              id="provider-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.providers.fieldNamePlaceholder}
              disabled={mutation.isPending}
              data-testid="provider-name-input"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider-role">{t.providers.fieldRole}</Label>
            <NativeSelect
              id="provider-role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={mutation.isPending}
              data-testid="provider-role-select"
            >
              <option value="">{t.providers.fieldRoleNone}</option>
              {roleTypes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t.providers.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready || mutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (ready) mutation.mutate()
            }}
            data-testid="provider-save-btn"
          >
            {mutation.isPending
              ? isEdit
                ? t.providers.saving
                : t.providers.creating
              : isEdit
                ? t.providers.save
                : t.providers.create}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
