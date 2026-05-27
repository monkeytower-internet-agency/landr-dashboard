/**
 * LocationRoleTypeManager — list / add / rename / delete UI for the
 * per-operator `location_role_types` taxonomy (the "Type" dropdown
 * options on a pickup location).
 *
 * Rendered inside a Sheet that's opened by the pen icon next to the
 * Type select in LocationFormSheet. After a successful mutation the
 * `['location-role-types', operatorId]` query is invalidated so the
 * parent dropdown picks up the change without a manual reload.
 *
 * landr-ogf.
 */
import { useEffect, useState } from 'react'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  createLocationRoleType,
  deleteLocationRoleType,
  fetchLocationRoleTypes,
  updateLocationRoleType,
  type LocationRoleType,
} from '@/lib/locations'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
}

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code is required.')
    .max(64, 'Code too long.'),
  label: z
    .string()
    .trim()
    .min(1, 'Label is required.')
    .max(200, 'Label too long.'),
  sort_order: z.number().int().min(0),
})

type CreateValues = z.infer<typeof createSchema>

const editSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Label is required.')
    .max(200, 'Label too long.'),
  sort_order: z.number().int().min(0),
})

type EditValues = z.infer<typeof editSchema>

export function LocationRoleTypeManager({ operatorId }: Props) {
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<LocationRoleType | null>(null)

  const query = useQuery<LocationRoleType[]>({
    queryKey: ['location-role-types', operatorId],
    queryFn: () => fetchLocationRoleTypes(operatorId),
    enabled: !!operatorId,
  })

  const roleTypes = query.data ?? []

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { code: '', label: '', sort_order: 0 },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { label: '', sort_order: 0 },
  })

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: ['location-role-types', operatorId],
    })
  }

  const createMutation = useMutation({
    mutationFn: (values: CreateValues) =>
      createLocationRoleType(operatorId, values),
    onSuccess: () => {
      toast.success(t.pickupLocations.roleTypeManagerToastCreated)
      createForm.reset({ code: '', label: '', sort_order: 0 })
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.pickupLocations.roleTypeManagerToastError, {
        description: err.message,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string
      values: EditValues
    }) => updateLocationRoleType(operatorId, id, values),
    onSuccess: () => {
      toast.success(t.pickupLocations.roleTypeManagerToastUpdated)
      setEditTarget(null)
      editForm.reset({ label: '', sort_order: 0 })
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.pickupLocations.roleTypeManagerToastError, {
        description: err.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLocationRoleType(operatorId, id),
    onSuccess: () => {
      toast.success(t.pickupLocations.roleTypeManagerToastDeleted)
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.pickupLocations.roleTypeManagerToastError, {
        description: err.message,
      })
    },
  })

  // Sync the edit form with the currently selected target so when a row's
  // pencil is clicked the inputs reflect that row immediately.
  useEffect(() => {
    if (editTarget) {
      editForm.reset({ label: editTarget.label, sort_order: editTarget.sort_order })
    } else {
      editForm.reset({ label: '', sort_order: 0 })
    }
  }, [editTarget, editForm])

  function startEdit(row: LocationRoleType) {
    setEditTarget(row)
  }

  function cancelEdit() {
    setEditTarget(null)
  }

  function handleCreate(values: CreateValues) {
    createMutation.mutate(values)
  }

  function handleEdit(values: EditValues) {
    if (!editTarget) return
    updateMutation.mutate({ id: editTarget.id, values })
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
      <section aria-label="Existing types" className="flex flex-col gap-2">
        {query.isPending ? (
          <p className="text-muted-foreground text-sm">
            {t.pickupLocations.loading}
          </p>
        ) : query.isError ? (
          <p className="text-destructive text-sm">
            {t.pickupLocations.roleTypesError}
          </p>
        ) : roleTypes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.pickupLocations.roleTypeManagerEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {roleTypes.map((rt) => (
              <li
                key={rt.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{rt.label}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {rt.code}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.pickupLocations.roleTypeManagerEditAria(
                      rt.label,
                    )}
                    onClick={() => startEdit(rt)}
                    disabled={
                      deleteMutation.isPending || updateMutation.isPending
                    }
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.pickupLocations.roleTypeManagerDeleteAria(
                      rt.label,
                    )}
                    onClick={() => deleteMutation.mutate(rt.id)}
                    disabled={
                      deleteMutation.isPending || updateMutation.isPending
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editTarget ? (
        <Form {...editForm}>
          <form
            key={editTarget.id}
            onSubmit={editForm.handleSubmit(handleEdit)}
            aria-label={t.pickupLocations.roleTypeManagerEditTitle}
            className="flex flex-col gap-3 rounded-md border bg-background p-3"
          >
            <h3 className="text-sm font-semibold">
              {t.pickupLocations.roleTypeManagerEditTitle}
            </h3>
            <FormField
              control={editForm.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t.pickupLocations.roleTypeManagerLabelLabel}
                  </FormLabel>
                  <FormControl>
                    <Input
                      disabled={updateMutation.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={editForm.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t.pickupLocations.roleTypeManagerSortLabel}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      disabled={updateMutation.isPending}
                      value={field.value ?? 0}
                      onChange={(e) =>
                        field.onChange(Number(e.target.value || 0))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                disabled={updateMutation.isPending}
              >
                {t.pickupLocations.roleTypeManagerCancel}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {t.pickupLocations.roleTypeManagerSave}
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <Form {...createForm}>
          <form
            onSubmit={createForm.handleSubmit(handleCreate)}
            aria-label={t.pickupLocations.roleTypeManagerAddTitle}
            className="flex flex-col gap-3 rounded-md border bg-background p-3"
          >
            <h3 className="text-sm font-semibold">
              {t.pickupLocations.roleTypeManagerAddTitle}
            </h3>
            <FormField
              control={createForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t.pickupLocations.roleTypeManagerCodeLabel}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="port"
                      disabled={createMutation.isPending}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-muted-foreground text-xs">
                    {t.pickupLocations.roleTypeManagerCodeHint}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={createForm.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t.pickupLocations.roleTypeManagerLabelLabel}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Port"
                      disabled={createMutation.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={createForm.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t.pickupLocations.roleTypeManagerSortLabel}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      disabled={createMutation.isPending}
                      value={field.value ?? 0}
                      onChange={(e) =>
                        field.onChange(Number(e.target.value || 0))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                <PlusIcon />
                {t.pickupLocations.roleTypeManagerSave}
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  )
}
