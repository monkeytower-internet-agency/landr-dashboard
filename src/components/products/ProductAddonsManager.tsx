// landr-u34k — Add-ons management section rendered inside ProductForm
// when editing an existing product. Lists current product_addons rows for
// the parent and lets the operator add / configure / remove links.
//
// Editing model: we manage a local in-memory list keyed by the row id
// (or a temporary 'new-N' sentinel for unsaved rows). The Save button on
// each row commits via createProductAddon / patchProductAddon, and Delete
// commits immediately via deleteProductAddon. The cache invalidation on
// success is bounded to the addons query for this parent — the rest of
// the products grid is untouched.
//
// Per write-routing-convention, all CRUD goes DIRECT to supabase REST
// (no derived data, no email sends, no Holded sync).

import { useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  createProductAddon,
  deleteProductAddon,
  fetchProductAddons,
  patchProductAddon,
  type ProductAddon,
} from '@/lib/product-addons'
import type { ProductRow } from '@/lib/products'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  parentProduct: ProductRow
  allProducts: ProductRow[]
}

// A single editable row in the section's table. Mirrors the DB column
// shape but keeps numeric fields as strings while the user is typing.
type DraftRow = {
  /** Persisted id, or `new-N` sentinel for unsaved rows. */
  key: string
  /** Persisted id once saved; null for unsaved drafts. */
  id: string | null
  addon_product_id: string
  is_required: boolean
  min_qty: string
  max_qty: string
  sort_order: string
}

function fromServerRow(row: ProductAddon): DraftRow {
  return {
    key: row.id,
    id: row.id,
    addon_product_id: row.addon_product_id,
    is_required: row.is_required,
    min_qty: String(row.min_qty),
    max_qty: row.max_qty == null ? '' : String(row.max_qty),
    sort_order: String(row.sort_order),
  }
}

function emptyDraft(key: string): DraftRow {
  return {
    key,
    id: null,
    addon_product_id: '',
    is_required: false,
    min_qty: '0',
    max_qty: '',
    sort_order: '0',
  }
}

/** Coerce a numeric string field into an int; empty → fallback. */
function toInt(value: string, fallback: number): number {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const n = Number(trimmed)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/** max_qty is nullable in the DB; empty string → null (= unlimited). */
function toMaxQty(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function ProductAddonsManager({
  operatorId,
  parentProduct,
  allProducts,
}: Props) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ['product_addons', parentProduct.id] as const,
    [parentProduct.id],
  )

  const addonsQuery = useQuery<ProductAddon[]>({
    queryKey,
    queryFn: () => fetchProductAddons(parentProduct.id),
  })

  // Local working copy keyed by parent product id so swapping parents
  // resets the drafts cleanly (StrictMode-safe — the useEffect below
  // hydrates from the latest server snapshot).
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({})

  // Hydrate drafts from the server snapshot on first successful fetch for
  // this parent. Subsequent server snapshots (e.g. realtime) re-hydrate
  // only if the user has no pending unsaved rows — otherwise we'd clobber
  // their in-progress edits.
  if (addonsQuery.data && hydratedFor !== parentProduct.id) {
    const hasUnsaved = drafts.some((d) => d.id === null)
    if (!hasUnsaved) {
      setDrafts(addonsQuery.data.map(fromServerRow))
      setHydratedFor(parentProduct.id)
      setErrorByKey({})
    }
  }

  // Build the addon-product picker option list: every product on the
  // operator EXCEPT the parent itself (no self-link, enforced by DB
  // CHECK product_addons_no_self_link).
  const addonOptions = useMemo(() => {
    return allProducts
      .filter((p) => p.id !== parentProduct.id)
      .map((p) => ({ id: p.id, name: p.name }))
  }, [allProducts, parentProduct.id])

  const createMut = useMutation({
    mutationFn: async (draft: DraftRow) => {
      return createProductAddon({
        operator_id: operatorId,
        parent_product_id: parentProduct.id,
        addon_product_id: draft.addon_product_id,
        is_required: draft.is_required,
        min_qty: toInt(draft.min_qty, 0),
        max_qty: toMaxQty(draft.max_qty),
        sort_order: toInt(draft.sort_order, 0),
      })
    },
    onSuccess: (saved, draft) => {
      setDrafts((prev) =>
        prev.map((d) => (d.key === draft.key ? fromServerRow(saved) : d)),
      )
      setErrorByKey((prev) => {
        const next = { ...prev }
        delete next[draft.key]
        return next
      })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err, draft) => {
      setErrorByKey((prev) => ({
        ...prev,
        [draft.key]: err instanceof Error ? err.message : String(err),
      }))
    },
  })

  const patchMut = useMutation({
    mutationFn: async (draft: DraftRow) => {
      if (!draft.id) throw new Error('cannot patch unsaved row')
      return patchProductAddon(draft.id, {
        addon_product_id: draft.addon_product_id,
        is_required: draft.is_required,
        min_qty: toInt(draft.min_qty, 0),
        max_qty: toMaxQty(draft.max_qty),
        sort_order: toInt(draft.sort_order, 0),
      })
    },
    onSuccess: (saved, draft) => {
      setDrafts((prev) =>
        prev.map((d) => (d.key === draft.key ? fromServerRow(saved) : d)),
      )
      setErrorByKey((prev) => {
        const next = { ...prev }
        delete next[draft.key]
        return next
      })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err, draft) => {
      setErrorByKey((prev) => ({
        ...prev,
        [draft.key]: err instanceof Error ? err.message : String(err),
      }))
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (draft: DraftRow) => {
      if (!draft.id) {
        // Unsaved draft — local-only removal, no server call.
        return null
      }
      await deleteProductAddon(draft.id)
      return null
    },
    onSuccess: (_void, draft) => {
      setDrafts((prev) => prev.filter((d) => d.key !== draft.key))
      setErrorByKey((prev) => {
        const next = { ...prev }
        delete next[draft.key]
        return next
      })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (err, draft) => {
      setErrorByKey((prev) => ({
        ...prev,
        [draft.key]: err instanceof Error ? err.message : String(err),
      }))
    },
  })

  function updateDraft(key: string, patch: Partial<DraftRow>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    )
  }

  function addNewRow() {
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setDrafts((prev) => [...prev, emptyDraft(key)])
  }

  async function saveRow(draft: DraftRow) {
    if (!draft.addon_product_id) {
      setErrorByKey((prev) => ({
        ...prev,
        [draft.key]: t.products.addonsErrorPickProduct,
      }))
      return
    }
    if (draft.id == null) {
      await createMut.mutateAsync(draft)
    } else {
      await patchMut.mutateAsync(draft)
    }
  }

  async function removeRow(draft: DraftRow) {
    await deleteMut.mutateAsync(draft)
  }

  const loading = addonsQuery.isPending
  const loadError = addonsQuery.error?.message ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.products.addonsSectionTitle}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {t.products.addonsSectionBody}
        </p>

        {loadError ? (
          <p role="alert" className="text-destructive text-sm">
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <p className="text-muted-foreground text-sm">
            {t.products.addonsLoading}
          </p>
        ) : drafts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.products.addonsEmpty}
          </p>
        ) : (
          <ul
            aria-label={t.products.addonsListAriaLabel}
            className="flex flex-col gap-3"
          >
            {drafts.map((d) => {
              const rowErr = errorByKey[d.key]
              const saving =
                (createMut.isPending && createMut.variables?.key === d.key) ||
                (patchMut.isPending && patchMut.variables?.key === d.key)
              const removing =
                deleteMut.isPending && deleteMut.variables?.key === d.key
              return (
                <li
                  key={d.key}
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">
                      {t.products.addonsFieldAddon}
                    </span>
                    <NativeSelect
                      value={d.addon_product_id}
                      onChange={(e) =>
                        updateDraft(d.key, { addon_product_id: e.target.value })
                      }
                      aria-label={t.products.addonsFieldAddon}
                    >
                      <option value="">{t.products.addonsPickProduct}</option>
                      {addonOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>

                  <label className="flex flex-col items-start gap-1">
                    <span className="text-xs font-medium">
                      {t.products.addonsFieldRequired}
                    </span>
                    <Checkbox
                      checked={d.is_required}
                      onChange={(e) =>
                        updateDraft(d.key, { is_required: e.target.checked })
                      }
                      aria-label={t.products.addonsFieldRequired}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">
                      {t.products.addonsFieldMinQty}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={d.min_qty}
                      onChange={(e) =>
                        updateDraft(d.key, { min_qty: e.target.value })
                      }
                      aria-label={t.products.addonsFieldMinQty}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">
                      {t.products.addonsFieldMaxQty}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={d.max_qty}
                      onChange={(e) =>
                        updateDraft(d.key, { max_qty: e.target.value })
                      }
                      placeholder={t.products.addonsFieldMaxQtyPlaceholder}
                      aria-label={t.products.addonsFieldMaxQty}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">
                      {t.products.addonsFieldSortOrder}
                    </span>
                    <Input
                      type="number"
                      step={1}
                      value={d.sort_order}
                      onChange={(e) =>
                        updateDraft(d.key, { sort_order: e.target.value })
                      }
                      aria-label={t.products.addonsFieldSortOrder}
                    />
                  </label>

                  <div className="flex items-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveRow(d)}
                      disabled={saving || removing}
                    >
                      {saving
                        ? t.products.addonsSaving
                        : d.id
                          ? t.products.addonsSave
                          : t.products.addonsAdd}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void removeRow(d)}
                      disabled={removing || saving}
                      aria-label={t.products.addonsDelete}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>

                  {rowErr ? (
                    <p
                      role="alert"
                      className="text-destructive text-xs sm:col-span-6"
                    >
                      {rowErr}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addNewRow}
            disabled={addonOptions.length === 0}
            title={
              addonOptions.length === 0
                ? t.products.addonsNoOtherProducts
                : undefined
            }
          >
            <PlusIcon className="size-4" />
            {t.products.addonsAddNew}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
