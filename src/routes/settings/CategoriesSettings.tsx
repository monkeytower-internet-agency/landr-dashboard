/**
 * Settings → Categories (landr-up1b).
 *
 * Tree editor for the operator's nested product_groups hierarchy
 * (adjacency list, parent_id). Operators can:
 *   - add a category (optionally under a parent),
 *   - rename / activate / set sort_order (reuses the staff PATCH),
 *   - reparent ("move under") via the PATCH /{id}/parent endpoint,
 *   - delete (soft-delete; server reparents children to root),
 *   - copy the [landr_booking group="…"] shortcode for any node.
 *
 * The tree is built client-side from the flat /product-groups/tree
 * response. Reparenting offers only legal targets (the node's own
 * subtree is disabled to match the server-side cycle guard).
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CheckIcon,
  CopyIcon,
  CornerDownRightIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  buildGroupTree,
  createProductGroup,
  deleteProductGroup,
  descendantIds,
  fetchProductGroupTree,
  flattenTree,
  reparentProductGroup,
  updateProductGroup,
  type ProductGroup,
} from '@/lib/productGroups'
import { nameToSlug } from '@/lib/products'
import { buildShortcode, fetchWidgetToken } from '@/lib/shortcode'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function CategoriesSettings() {
  const { currentOperatorId, currentOperator } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.categories },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.categories}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header>
          <h1 className="text-xl font-semibold">{t.categoriesSettings.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.categoriesSettings.subtitle}
          </p>
        </header>
        <p className="text-muted-foreground text-sm">
          {t.categoriesSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <CategoryTreeManager
        operatorId={currentOperatorId}
        operatorSlug={currentOperator?.slug ?? ''}
      />
    </>
  )
}

type ManagerProps = {
  operatorId: string
  operatorSlug: string
}

export function CategoryTreeManager({ operatorId, operatorSlug: _operatorSlug }: ManagerProps) {
  const qc = useQueryClient()
  const query = useQuery<ProductGroup[]>({
    queryKey: ['product-group-tree', operatorId],
    queryFn: () => fetchProductGroupTree(operatorId),
  })

  // landr-il9f.3 — opaque widget token replaces the slug in shortcodes.
  const tokenQuery = useQuery<string | null>({
    queryKey: ['operator-widget-token', operatorId],
    queryFn: () => fetchWidgetToken(operatorId),
    enabled: !!operatorId,
  })
  const widgetToken = tokenQuery.data ?? null

  const groups = useMemo(() => query.data ?? [], [query.data])
  const flat = useMemo(() => flattenTree(buildGroupTree(groups)), [groups])

  const [draftName, setDraftName] = useState('')
  const [draftParent, setDraftParent] = useState<string>('')

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['product-group-tree', operatorId] })
    qc.invalidateQueries({ queryKey: ['product-groups', operatorId] })
    qc.invalidateQueries({ queryKey: ['product_groups', operatorId] })
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const name = draftName.trim()
      return createProductGroup(operatorId, {
        name,
        slug: nameToSlug(name) || name.toLowerCase(),
        parent_id: draftParent || null,
      })
    },
    onSuccess: () => {
      setDraftName('')
      setDraftParent('')
      invalidate()
      toast.success(t.categoriesSettings.toastCreated)
    },
    onError: (err: Error) =>
      toast.error(t.categoriesSettings.toastError, { description: err.message }),
  })

  const trimmed = draftName.trim()
  const dupe = groups.some(
    (g) => g.name.toLowerCase() === trimmed.toLowerCase(),
  )
  const canCreate = trimmed.length > 0 && !dupe && !createMutation.isPending

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t.categoriesSettings.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t.categoriesSettings.subtitle}
        </p>
      </header>

      {/* ---- Add category ------------------------------------------- */}
      <section className="rounded-md border p-4" data-testid="categories-create">
        <h2 className="text-sm font-medium">{t.categoriesSettings.createTitle}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="cat-new-name" className="text-xs">
              {t.categoriesSettings.fieldName}
            </Label>
            <Input
              id="cat-new-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (canCreate) createMutation.mutate()
                }
              }}
              placeholder={t.categoriesSettings.placeholderName}
              maxLength={200}
              className="h-8 text-sm"
              data-testid="categories-create-name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cat-new-parent" className="text-xs">
              {t.categoriesSettings.fieldParent}
            </Label>
            <select
              id="cat-new-parent"
              value={draftParent}
              onChange={(e) => setDraftParent(e.target.value)}
              className="border-input bg-background h-8 rounded-md border px-2 text-sm"
              data-testid="categories-create-parent"
            >
              <option value="">{t.categoriesSettings.parentRoot}</option>
              {flat.map((g) => (
                <option key={g.id} value={g.id}>
                  {' '.repeat(g.depth * 2)}
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={() => createMutation.mutate()}
            data-testid="categories-create-submit"
          >
            <PlusIcon className="size-4" />
            {createMutation.isPending
              ? t.categoriesSettings.creating
              : t.categoriesSettings.create}
          </Button>
        </div>
        {dupe ? (
          <p className="text-destructive mt-2 text-xs" role="alert">
            {t.categoriesSettings.dupeName}
          </p>
        ) : null}
      </section>

      {/* ---- Tree --------------------------------------------------- */}
      <section data-testid="categories-tree">
        {query.isPending ? (
          <p className="text-muted-foreground text-sm">
            {t.categoriesSettings.loading}
          </p>
        ) : query.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {(query.error as Error).message}
          </p>
        ) : flat.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {t.categoriesSettings.empty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {flat.map((node) => (
              <CategoryRow
                key={node.id}
                node={node}
                allGroups={groups}
                operatorId={operatorId}
                widgetToken={widgetToken}
                onChanged={invalidate}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type RowProps = {
  node: ProductGroup & { depth: number; children: unknown[] }
  allGroups: ProductGroup[]
  operatorId: string
  /** landr-il9f.3: opaque widget token, replaces operatorSlug in shortcodes. */
  widgetToken: string | null
  onChanged: () => void
}

function CategoryRow({
  node,
  allGroups,
  operatorId,
  widgetToken,
  onChanged,
}: RowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(node.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)

  const patchMutation = useMutation({
    mutationFn: (next: string) =>
      updateProductGroup(operatorId, node.id, { name: next.trim() }),
    onSuccess: () => {
      onChanged()
      toast.success(t.categoriesSettings.toastUpdated)
      setEditing(false)
    },
    onError: (err: Error) =>
      toast.error(t.categoriesSettings.toastError, { description: err.message }),
  })

  const reparentMutation = useMutation({
    mutationFn: (parentId: string | null) =>
      reparentProductGroup(operatorId, node.id, parentId),
    onSuccess: () => {
      onChanged()
      toast.success(t.categoriesSettings.toastMoved)
    },
    onError: (err: Error) => {
      // Server returns detail=cycle_detected on illegal moves; the
      // picker already disables those, but a concurrent edit could race.
      const cycle = /cycle/i.test(err.message)
      toast.error(
        cycle
          ? t.categoriesSettings.toastReparentCycle
          : t.categoriesSettings.toastError,
        { description: cycle ? undefined : err.message },
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProductGroup(operatorId, node.id),
    onSuccess: () => {
      onChanged()
      toast.success(t.categoriesSettings.toastDeleted)
    },
    onError: (err: Error) =>
      toast.error(t.categoriesSettings.toastError, { description: err.message }),
  })

  // Legal reparent targets: every group except the node itself and its
  // descendants (matches the server-side cycle guard).
  const forbidden = useMemo(
    () => descendantIds(allGroups, node.id),
    [allGroups, node.id],
  )
  const moveTargets = useMemo(
    () => allGroups.filter((g) => !forbidden.has(g.id)),
    [allGroups, forbidden],
  )

  async function copyShortcode() {
    // landr-il9f.3: emit token= (opaque widget_token), not operator= (slug).
    const code = buildShortcode({ token: widgetToken ?? '', group: node.slug })
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(t.categoriesSettings.toastCopied)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t.categoriesSettings.toastError)
    }
  }

  return (
    <li
      className="flex flex-wrap items-center gap-2 p-3"
      data-testid={`category-row-${node.id}`}
      style={{ paddingLeft: `${0.75 + node.depth * 1.25}rem` }}
    >
      {node.depth > 0 ? (
        <CornerDownRightIcon
          aria-hidden="true"
          className="text-muted-foreground size-3.5 shrink-0"
        />
      ) : null}

      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          aria-label={t.categoriesSettings.edit}
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) patchMutation.mutate(name)
          }}
        >
          <Input
            autoFocus
            aria-label={t.categoriesSettings.fieldName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
            data-testid={`category-row-${node.id}-name`}
          />
          <Button type="submit" size="sm" disabled={patchMutation.isPending}>
            {patchMutation.isPending
              ? t.categoriesSettings.saving
              : t.categoriesSettings.save}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setName(node.name)
              setEditing(false)
            }}
          >
            {t.categoriesSettings.cancel}
          </Button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">
            {node.name}{' '}
            <span className="text-muted-foreground text-xs">({node.slug})</span>
            {node.depth === 0 ? (
              <span className="text-muted-foreground ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {t.categoriesSettings.rootBadge}
              </span>
            ) : null}
            {!node.active ? (
              <span className="text-muted-foreground ml-2 text-[10px] uppercase tracking-wide">
                {t.categoriesSettings.inactiveBadge}
              </span>
            ) : null}
          </span>

          {/* Move-under picker */}
          <label className="sr-only" htmlFor={`cat-move-${node.id}`}>
            {t.categoriesSettings.moveAria(node.name)}
          </label>
          <select
            id={`cat-move-${node.id}`}
            className="border-input bg-background h-8 max-w-[10rem] rounded-md border px-2 text-xs"
            value={node.parent_id ?? ''}
            disabled={reparentMutation.isPending}
            onChange={(e) =>
              reparentMutation.mutate(e.target.value ? e.target.value : null)
            }
            data-testid={`category-row-${node.id}-move`}
            title={t.categoriesSettings.moveLabel}
          >
            <option value="">{t.categoriesSettings.parentRoot}</option>
            {moveTargets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t.categoriesSettings.copyShortcodeAria(node.name)}
            onClick={copyShortcode}
            data-testid={`category-row-${node.id}-copy`}
          >
            {copied ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t.categoriesSettings.edit}
            onClick={() => {
              setName(node.name)
              setEditing(true)
            }}
            data-testid={`category-row-${node.id}-edit`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          {confirmDelete ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                data-testid={`category-row-${node.id}-confirm-delete`}
              >
                {deleteMutation.isPending
                  ? t.categoriesSettings.deleting
                  : t.categoriesSettings.confirmDelete}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                {t.categoriesSettings.cancel}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t.categoriesSettings.delete}
              onClick={() => setConfirmDelete(true)}
              data-testid={`category-row-${node.id}-delete`}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          )}
        </>
      )}
    </li>
  )
}
