/**
 * ProductGroupManager — list / add / rename / delete UI for the
 * per-operator `product_groups` taxonomy (the "Product group"
 * dropdown options on a product).
 *
 * Rendered inside a Sheet that's opened by the pen icon next to the
 * Product-group select in ProductForm. After a successful mutation the
 * `['product_groups', operatorId]` query is invalidated so the parent
 * dropdown picks up the change without a manual reload.
 *
 * landr-19m.
 */
import { useMemo, useState } from 'react'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nameToSlug } from '@/lib/products'
import {
  createProductGroup,
  deleteProductGroup,
  fetchProductGroupsFull,
  updateProductGroup,
  type ProductGroup,
} from '@/lib/productGroups'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
}

export function ProductGroupManager({ operatorId }: Props) {
  const qc = useQueryClient()
  const [draftName, setDraftName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const query = useQuery<ProductGroup[]>({
    queryKey: ['product-groups', operatorId],
    queryFn: () => fetchProductGroupsFull(operatorId),
    enabled: !!operatorId,
  })

  const groups = useMemo(() => query.data ?? [], [query.data])

  // Keep both query keys fresh: the manager uses ['product-groups', op] (full
  // rows incl. sort_order / active), while ProductForm + ProductsManager +
  // Step5Products consume the lighter ['product_groups', op] (id/name/slug)
  // fetched directly from Supabase. Both need to update after mutations.
  function invalidate() {
    qc.invalidateQueries({ queryKey: ['product-groups', operatorId] })
    qc.invalidateQueries({ queryKey: ['product_groups', operatorId] })
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const name = draftName.trim()
      const slug = nameToSlug(name)
      return createProductGroup(operatorId, {
        name,
        slug: slug || name.toLowerCase(),
      })
    },
    onSuccess: () => {
      setDraftName('')
      invalidate()
      toast.success(t.products.productGroupManagerToastCreated)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupManagerToastError, {
        description: err.message,
      }),
  })

  const patchMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      updateProductGroup(operatorId, vars.id, { name: vars.name.trim() }),
    onSuccess: () => {
      setEditingId(null)
      setEditingName('')
      invalidate()
      toast.success(t.products.productGroupManagerToastUpdated)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupManagerToastError, {
        description: err.message,
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProductGroup(operatorId, id),
    onSuccess: () => {
      invalidate()
      toast.success(t.products.productGroupManagerToastDeleted)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupManagerToastError, {
        description: err.message,
      }),
  })

  // Derive the active edit row from the live list — if the row vanishes
  // (deleted concurrently or filtered out by a refetch) we silently drop
  // back to the add form on the next render rather than calling setState
  // inside an effect.
  const activeEditId =
    editingId && groups.some((g) => g.id === editingId) ? editingId : null

  return (
    <div className="flex flex-col gap-4">
      {query.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : query.isError ? (
        <p className="text-destructive text-sm">
          {query.error instanceof Error
            ? query.error.message
            : 'Failed to load product groups'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.length === 0 ? (
            <li className="text-muted-foreground text-sm">
              {t.products.productGroupManagerEmpty}
            </li>
          ) : (
            groups.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                {activeEditId === g.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    aria-label={t.products.productGroupManagerEditTitle}
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (editingName.trim())
                        patchMutation.mutate({ id: g.id, name: editingName })
                    }}
                  >
                    <Input
                      autoFocus
                      aria-label={t.products.productGroupManagerNameLabel}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-8"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={patchMutation.isPending}
                    >
                      {t.products.productGroupManagerSave}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null)
                        setEditingName('')
                      }}
                    >
                      {t.products.productGroupManagerCancel}
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm">
                      {g.name}{' '}
                      <span className="text-muted-foreground text-xs">
                        ({g.slug})
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t.products.productGroupManagerEditAria(g.name)}
                      onClick={() => {
                        setEditingId(g.id)
                        setEditingName(g.name)
                      }}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t.products.productGroupManagerDeleteAria(
                        g.name,
                      )}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            t.products.productGroupManagerDeleteConfirm(g.name),
                          )
                        ) {
                          deleteMutation.mutate(g.id)
                        }
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 rounded-md border p-3"
        aria-label={t.products.productGroupManagerAddTitle}
        onSubmit={(e) => {
          e.preventDefault()
          if (draftName.trim()) createMutation.mutate()
        }}
      >
        <p className="text-sm font-medium">
          {t.products.productGroupManagerAddTitle}
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="pg-new-name" className="text-xs">
              {t.products.productGroupManagerNameLabel}
            </Label>
            <Input
              id="pg-new-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Courses"
            />
          </div>
          <Button
            type="submit"
            disabled={!draftName.trim() || createMutation.isPending}
          >
            <PlusIcon className="size-4" />
            {t.products.productGroupManagerSave}
          </Button>
        </div>
      </form>
    </div>
  )
}
