import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '@/lib/auth'
import { trackView } from '@/lib/recently-viewed'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FixedDateWindowsTable } from '@/components/FixedDateWindowsTable'
import { ProductForm } from '@/components/ProductForm'
import type {
  HotelLocationRef,
  ProductFormSubmitValue,
} from '@/components/ProductForm'
import { ProductsList } from '@/components/ProductsList'
import { ProductsFilters } from '@/components/products/ProductsFilters'
import {
  createProduct,
  duplicateProduct,
  fetchPricingSchemes,
  fetchProductGroups,
  fetchProductKindCounts,
  fetchProducts,
  softDeleteProduct,
  updateProduct,
  type PricingSchemeRef,
  type ProductGroupRef,
  type ProductKindCounts,
  type ProductRow,
} from '@/lib/products'
import { useProductsFilters } from '@/lib/products-filters'
import { useProductsSort } from '@/lib/products-sort'
import { showDeleteUndoToast } from '@/lib/undo-toast'
import {
  fetchLocationRoleTypes,
  fetchLocations,
  type Location,
  type LocationRoleType,
} from '@/lib/locations'
import { PageTitle } from '@/lib/page-title'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { useOperator } from '@/lib/operator'
import { ProductShortcodeMenu } from '@/components/products/ProductShortcodeMenu'
import { fetchWidgetToken } from '@/lib/shortcode'
import { t } from '@/lib/strings'

const NEW_PRODUCT = 'new' as const
type Selection = typeof NEW_PRODUCT | string | null

type Props = {
  operatorId: string
  /** Hide the page-style header (title); used when rendered inside a Sheet that has its own header. */
  hideHeader?: boolean
  /**
   * landr-li8e — URL-driven selection. When the parent route owns the
   * selection via the URL (`/settings/products/:productId`), it passes the
   * current productId here ('new' is the sentinel for create mode) plus an
   * `onUrlSelect` callback to drive navigation. In that mode the manager
   * renders in two states: list-only (no selection) or detail-only / full
   * page (selection present, list hidden). When these props are absent
   * (e.g. the onboarding Step5 embed), the manager keeps the legacy
   * side-by-side list + auto-pick-first behaviour.
   */
  urlSelection?: Selection
  onUrlSelect?: (id: string | null) => void
}

export function ProductsManager({
  operatorId,
  hideHeader = false,
  urlSelection,
  onUrlSelect,
}: Props) {
  const queryClient = useQueryClient()
  // landr-up1b — operator slug feeds the per-product copy-shortcode menus
  // (list rows + detail breadcrumb). The manager is always rendered for
  // the current operator, so the context slug matches operatorId here.
  const { currentOperator } = useOperator()
  const operatorSlug = currentOperator?.slug ?? ''
  // landr-il9f.3 — opaque widget token replaces the slug in shortcode output.
  const tokenQuery = useQuery<string | null>({
    queryKey: ['operator-widget-token', operatorId],
    queryFn: () => fetchWidgetToken(operatorId),
    enabled: !!operatorId,
  })
  const widgetToken = tokenQuery.data ?? null
  const routed = onUrlSelect !== undefined
  // In routed mode the URL is the source of truth; otherwise we keep local
  // selection state (legacy onboarding embed).
  const [localSelection, setLocalSelection] = useState<Selection>(null)
  const selection: Selection = routed ? (urlSelection ?? null) : localSelection
  const setSelection = (next: Selection) => {
    if (routed) {
      onUrlSelect(next === NEW_PRODUCT ? NEW_PRODUCT : next)
    } else {
      setLocalSelection(next)
    }
  }
  const [feedback, setFeedback] = useState<string | null>(null)

  // landr-pugm — per-user sort + product_kind filter applied at the API
  // layer so the 500-row limit still surfaces the most relevant products
  // first. State is keyed into the query so a change re-runs the fetch
  // with the new ORDER BY / .in('product_kind', …) constraints.
  const sortApi = useProductsSort()
  const filtersApi = useProductsFilters()
  const { sort } = sortApi
  const { filters } = filtersApi
  const kindsKey = filters.kinds.slice().sort().join(',') || 'all'

  const productsQuery = useRealtimeQuery<ProductRow[]>({
    queryKey: ['products', operatorId, sort, kindsKey],
    queryFn: () =>
      fetchProducts(operatorId, { sort, kinds: filters.kinds }),
    enabled: !!operatorId,
    realtime: {
      table: 'products',
      filter: `operator_id=eq.${operatorId}`,
    },
  })

  // landr-pugm + landr-knz3 — per-kind counts power the '(N)' chip badges
  // and the disabled-when-zero behaviour. Separate from the main list
  // query because the counts are independent of the current filter
  // selection (they always reflect operator-wide totals across kinds).
  const kindCountsQuery = useQuery<ProductKindCounts>({
    queryKey: ['product-kind-counts', operatorId],
    queryFn: () => fetchProductKindCounts(operatorId),
    enabled: !!operatorId,
    staleTime: 30_000,
  })

  const pricingSchemesQuery = useQuery<PricingSchemeRef[]>({
    queryKey: ['pricing_schemes', operatorId],
    queryFn: () => fetchPricingSchemes(operatorId),
    enabled: !!operatorId,
  })

  const productGroupsQuery = useQuery<ProductGroupRef[]>({
    queryKey: ['product_groups', operatorId],
    queryFn: () => fetchProductGroups(operatorId),
    enabled: !!operatorId,
  })

  // landr-ssrx — hotel-role locations feed the kind='hotel_room' picker. We
  // join locations × role_types client-side because the locations endpoint
  // only carries role_type_id, and the per-operator role-type taxonomy is
  // small enough that a second query is cheaper than widening the locations
  // shape. Both queries are already cached for the Pickup locations page.
  const locationsQuery = useQuery<Location[]>({
    queryKey: ['locations', operatorId],
    queryFn: () => fetchLocations(operatorId),
    enabled: !!operatorId,
  })
  const roleTypesQuery = useQuery<LocationRoleType[]>({
    queryKey: ['location-role-types', operatorId],
    queryFn: () => fetchLocationRoleTypes(operatorId),
    enabled: !!operatorId,
  })

  const hotelLocations = useMemo<HotelLocationRef[]>(() => {
    const locs = locationsQuery.data ?? []
    const types = roleTypesQuery.data ?? []
    const hotelRoleIds = new Set(
      types.filter((rt) => rt.code === 'hotel').map((rt) => rt.id),
    )
    if (hotelRoleIds.size === 0) return []
    return locs
      .filter((l) => l.role_type_id && hotelRoleIds.has(l.role_type_id))
      .map((l) => ({ id: l.id, name: l.name }))
  }, [locationsQuery.data, roleTypesQuery.data])

  const rows = useMemo(() => productsQuery.data ?? [], [productsQuery.data])

  // Resolve the active selection. In routed mode (landr-li8e), no selection
  // means "list view" — we do NOT auto-pick a row, because that would force
  // an immediate navigation to the detail page. In legacy (onboarding) mode
  // we fall back to the first row so the form has content by default.
  // NEW_PRODUCT means "creating new".
  const resolvedSelection: Selection = useMemo(() => {
    if (selection !== null) return selection
    if (routed) return null
    return rows[0]?.id ?? null
  }, [selection, rows, routed])

  const selectedProduct = useMemo<ProductRow | null>(() => {
    if (resolvedSelection === null || resolvedSelection === NEW_PRODUCT) {
      return null
    }
    return rows.find((r) => r.id === resolvedSelection) ?? null
  }, [rows, resolvedSelection])

  // landr-ne58 — record this open in the sidebar "Recently viewed" trail.
  // Only fire in routed mode (the URL-driven /settings/products/:id page);
  // the onboarding embed (legacy mode, side-by-side list + auto-pick-first)
  // is a wizard step and shouldn't pollute history with the auto-selected
  // first row. trackView() de-duplicates by (type, id), so navigating
  // around within the products page does not flood the trail.
  const { user } = useAuth()
  const trackedProductId = selectedProduct?.id ?? null
  const trackedProductName = selectedProduct?.name ?? null
  useEffect(() => {
    if (!routed) return
    if (!trackedProductId || !trackedProductName) return
    trackView(
      user?.id ?? null,
      'product',
      trackedProductId,
      trackedProductName,
      `/settings/products/${trackedProductId}`,
    )
  }, [routed, user?.id, trackedProductId, trackedProductName])

  // landr-pugm — query key now includes sort + kinds, so per-key writes
  // (setQueryData(['products', operatorId], …)) would miss the active cache
  // entry. setQueriesData with a partial-key filter patches every variant.
  const PRODUCTS_KEY_PREFIX = ['products', operatorId] as const

  const createMutation = useMutation({
    mutationFn: (payload: ProductFormSubmitValue) => {
      return createProduct({
        ...payload,
        operator_id: operatorId,
      })
    },
    onSuccess: (created) => {
      queryClient.setQueriesData<ProductRow[]>(
        { queryKey: PRODUCTS_KEY_PREFIX },
        (prev) => (prev ? [created, ...prev] : [created]),
      )
      // Invalidate the kind-count query so the chip badge picks up the
      // new product without waiting for the 30s staleTime.
      queryClient.invalidateQueries({
        queryKey: ['product-kind-counts', operatorId],
      })
      setSelection(created.id)
      setFeedback(t.products.toastCreated)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: ProductFormSubmitValue
    }) => updateProduct(id, payload),
    onMutate: async ({ id, payload }) => {
      // Optimistic update — the matching realtime UPDATE event will
      // refetch and reconcile if the server-side value disagrees.
      await queryClient.cancelQueries({ queryKey: PRODUCTS_KEY_PREFIX })
      const previous = queryClient.getQueriesData<ProductRow[]>({
        queryKey: PRODUCTS_KEY_PREFIX,
      })
      queryClient.setQueriesData<ProductRow[]>(
        { queryKey: PRODUCTS_KEY_PREFIX },
        (rows) =>
          rows
            ? rows.map((r) => (r.id === id ? { ...r, ...payload } : r))
            : rows,
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueriesData<ProductRow[]>(
        { queryKey: PRODUCTS_KEY_PREFIX },
        (rows) =>
          rows ? rows.map((r) => (r.id === updated.id ? updated : r)) : rows,
      )
      // product_kind may have changed; refresh the chip badge counts.
      queryClient.invalidateQueries({
        queryKey: ['product-kind-counts', operatorId],
      })
      setFeedback(t.products.toastUpdated)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteProduct(id, null),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: PRODUCTS_KEY_PREFIX })
      const previous = queryClient.getQueriesData<ProductRow[]>({
        queryKey: PRODUCTS_KEY_PREFIX,
      })
      // Snapshot the product label BEFORE the optimistic filter strips the
      // row from cache, so the undo toast can show its name after the
      // server confirms the delete.
      const flat = previous.flatMap(([, rows]) => rows ?? [])
      const label =
        flat.find((r) => r.id === id)?.name ?? t.products.deletedFallbackLabel
      queryClient.setQueriesData<ProductRow[]>(
        { queryKey: PRODUCTS_KEY_PREFIX },
        (rows) => (rows ? rows.filter((r) => r.id !== id) : rows),
      )
      return { previous, label }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSuccess: (_data, id, ctx) => {
      queryClient.invalidateQueries({
        queryKey: ['product-kind-counts', operatorId],
      })
      setSelection(null)
      setFeedback(t.products.toastDeleted)
      // landr-v6aq — fire the undo toast (5s window). Undo calls the
      // staff_trash restore router, which flips deleted_at back to NULL.
      // The restored row reappears via the PRODUCTS_KEY_PREFIX invalidate
      // inside the helper.
      showDeleteUndoToast({
        operatorId,
        kind: 'products',
        rowId: id,
        message: t.undo.deletedProduct(
          ctx?.label ?? t.products.deletedFallbackLabel,
        ),
        queryClient,
        invalidateQueryKeys: [
          PRODUCTS_KEY_PREFIX,
          ['product-kind-counts', operatorId],
        ],
      })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateProduct(operatorId, id),
    onSuccess: (copy) => {
      queryClient.setQueriesData<ProductRow[]>(
        { queryKey: PRODUCTS_KEY_PREFIX },
        (prev) => (prev ? [copy, ...prev] : [copy]),
      )
      queryClient.invalidateQueries({
        queryKey: ['product-kind-counts', operatorId],
      })
      setSelection(copy.id)
      setFeedback(t.products.toastDuplicated)
    },
  })

  async function handleSubmit(values: ProductFormSubmitValue) {
    setFeedback(null)
    if (resolvedSelection === NEW_PRODUCT || selectedProduct === null) {
      await createMutation.mutateAsync(values)
      return
    }
    await updateMutation.mutateAsync({
      id: selectedProduct.id,
      payload: values,
    })
  }

  async function handleDelete() {
    if (!selectedProduct) return
    const ok = window.confirm(t.products.confirmDelete)
    if (!ok) return
    await deleteMutation.mutateAsync(selectedProduct.id)
  }

  const isError = productsQuery.isError
  const isLoading = productsQuery.isPending && !!operatorId

  const mutationError =
    createMutation.error ?? updateMutation.error ?? deleteMutation.error ?? duplicateMutation.error
  const submitting =
    createMutation.isPending || updateMutation.isPending
  const deleting = deleteMutation.isPending
  const duplicatingId = duplicateMutation.isPending ? (duplicateMutation.variables ?? null) : null

  // landr-li8e — in routed mode, hide the list when a selection is active
  // (full-page detail) and hide the detail when there's no selection
  // (list-only). Legacy mode (no router wiring, e.g. Onboarding Step5)
  // keeps the side-by-side layout.
  const isFullPageDetail =
    routed &&
    (resolvedSelection === NEW_PRODUCT || resolvedSelection !== null)
  const showList = !routed || !isFullPageDetail
  const showDetail = !routed || isFullPageDetail

  const detailHeading =
    resolvedSelection === NEW_PRODUCT
      ? t.products.headingNew
      : selectedProduct
        ? selectedProduct.name
        : t.products.headingPick

  const detailCard = (
    <Card>
      <CardHeader
        className={
          routed
            ? 'flex flex-row items-center gap-3 space-y-0'
            : undefined
        }
      >
        {routed ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelection(null)
              setFeedback(null)
            }}
            className="-ml-2 gap-1"
          >
            <ArrowLeft className="size-4" />
            {t.products.backToList}
          </Button>
        ) : null}
        <CardTitle>{detailHeading}</CardTitle>
        {/* landr-up1b — per-product shortcode menu: copy the single-product
            embed, or copy a shortcode for any category level in this
            product's breadcrumb (walks parent_id to the root). Only shown
            for a saved product with a known operator slug. */}
        {selectedProduct &&
        resolvedSelection !== NEW_PRODUCT &&
        operatorSlug ? (
          <div className="ml-auto">
            <ProductShortcodeMenu
              operatorId={operatorId}
              operatorSlug={operatorSlug}
              widgetToken={widgetToken}
              productSlug={selectedProduct.slug}
              productGroupId={selectedProduct.product_group_id}
              variant="detail"
            />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {resolvedSelection === NEW_PRODUCT || selectedProduct ? (
          <>
            <ProductForm
              product={
                resolvedSelection === NEW_PRODUCT
                  ? null
                  : selectedProduct
              }
              pricingSchemes={pricingSchemesQuery.data ?? []}
              productGroups={productGroupsQuery.data ?? []}
              operatorId={operatorId}
              hotelLocations={hotelLocations}
              // landr-u34k — pass the full product roster so the
              // Add-ons section can populate its addon-product
              // picker. We pass `rows` (not `rows.filter(...)`)
              // because the Add-ons section already filters out
              // the parent itself; addon_only candidates are
              // explicitly allowed (Breakfast linked to Rooms).
              allProducts={rows}
              onSubmit={handleSubmit}
              onDelete={
                resolvedSelection !== NEW_PRODUCT && selectedProduct
                  ? handleDelete
                  : undefined
              }
              submitting={submitting}
              deleting={deleting}
            />
            {mutationError ? (
              <p
                role="alert"
                className="text-destructive mt-4 text-sm"
              >
                {mutationError.message}
              </p>
            ) : null}
            {feedback ? (
              <p
                role="status"
                className="text-muted-foreground mt-4 text-sm"
              >
                {feedback}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t.products.pickHint}
          </p>
        )}
      </CardContent>
    </Card>
  )

  const listColumn = (
    <div className="flex flex-col gap-3">
      <ProductsFilters
        sortApi={sortApi}
        filtersApi={filtersApi}
        kindCounts={kindCountsQuery.data}
      />
      <ProductsList
        rows={rows}
        operatorId={operatorId}
        operatorSlug={operatorSlug || undefined}
        widgetToken={widgetToken}
        selectedId={
          resolvedSelection === NEW_PRODUCT
            ? null
            : (resolvedSelection ?? null)
        }
        onSelect={(row) => {
          setSelection(row.id)
          setFeedback(null)
        }}
        onCreate={() => {
          setSelection(NEW_PRODUCT)
          setFeedback(null)
        }}
        onDuplicate={(row) => {
          setFeedback(null)
          duplicateMutation.mutate(row.id)
        }}
        duplicatingId={duplicatingId}
        // landr-sj2z — paint skeleton chips during the first fetch so the
        // filter + new-product header stays visible above them.
        isLoading={isLoading}
      />
    </div>
  )

  // landr-fx2i — drive the topbar breadcrumb from the active selection.
  // Three states: list (Settings › Products), new (… › New product),
  // detail (… › <productName>). Onboarding embed (hideHeader=true,
  // routed=false) does NOT push a breadcrumb because it's inside a
  // multi-step wizard that owns its own header.
  const pageCrumbs = routed
    ? resolvedSelection === NEW_PRODUCT
      ? [
          { label: t.app.settings, to: '/settings' },
          { label: t.products.title, to: '/settings/products' },
          { label: t.products.headingNew },
        ]
      : selectedProduct
        ? [
            { label: t.app.settings, to: '/settings' },
            { label: t.products.title, to: '/settings/products' },
            { label: selectedProduct.name },
          ]
        : [
            { label: t.app.settings, to: '/settings' },
            { label: t.products.title },
          ]
    : null

  return (
    <div className="flex flex-col gap-6">
      {pageCrumbs ? <PageTitle crumbs={pageCrumbs} /> : null}
      {hideHeader ? null : (
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{t.products.title}</h1>
        </header>
      )}

      {isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.products.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {productsQuery.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : routed ? (
        /* landr-sj2z — no more top-level "Loading…" line. The
           ProductsList renders its own skeleton chips during the first
           fetch so the filter chrome stays visible. */
        /* landr-li8e — routed mode: list view OR full-page detail, never
           both. Switching is driven by the URL via the Products route. */
        showList ? listColumn : detailCard
      ) : (
        /* landr-sydf — legacy side-by-side layout for the onboarding embed.
           List column gets a guaranteed 320px minimum (chip text + dual-
           action header fit without overflow) while keeping the 1fr / 2fr
           ratio for the detail panel on wide viewports. Items stretch via
           items-start so the list grows with the page rather than being
           capped by the detail-card height. */
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
          {listColumn}
          {detailCard}
        </div>
      )}
      {showDetail &&
      selectedProduct &&
      selectedProduct.product_kind === 'service' &&
      selectedProduct.service_time_shape === 'fixed_window' ? (
        <FixedDateWindowsTable
          operatorId={operatorId}
          productId={selectedProduct.id}
        />
      ) : null}
    </div>
  )
}
