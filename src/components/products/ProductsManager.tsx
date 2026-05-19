import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
import {
  createProduct,
  duplicateProduct,
  fetchPricingSchemes,
  fetchProductGroups,
  fetchProducts,
  softDeleteProduct,
  updateProduct,
  type PricingSchemeRef,
  type ProductGroupRef,
  type ProductRow,
} from '@/lib/products'
import {
  fetchLocationRoleTypes,
  fetchLocations,
  type Location,
  type LocationRoleType,
} from '@/lib/locations'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

const NEW_PRODUCT = 'new' as const
type Selection = typeof NEW_PRODUCT | string | null

type Props = {
  operatorId: string
  /** Hide the page-style header (title); used when rendered inside a Sheet that has its own header. */
  hideHeader?: boolean
}

export function ProductsManager({ operatorId, hideHeader = false }: Props) {
  const queryClient = useQueryClient()
  const [selection, setSelection] = useState<Selection>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const productsQuery = useRealtimeQuery<ProductRow[]>({
    queryKey: ['products', operatorId],
    queryFn: () => fetchProducts(operatorId),
    enabled: !!operatorId,
    realtime: {
      table: 'products',
      filter: `operator_id=eq.${operatorId}`,
    },
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

  // Resolve the active selection. If the user has not picked anything yet
  // (selection === null), fall back to the first row so the form has
  // content to edit by default. NEW_PRODUCT means "creating new".
  const resolvedSelection: Selection = useMemo(() => {
    if (selection !== null) return selection
    return rows[0]?.id ?? null
  }, [selection, rows])

  const selectedProduct = useMemo<ProductRow | null>(() => {
    if (resolvedSelection === null || resolvedSelection === NEW_PRODUCT) {
      return null
    }
    return rows.find((r) => r.id === resolvedSelection) ?? null
  }, [rows, resolvedSelection])

  const createMutation = useMutation({
    mutationFn: (payload: ProductFormSubmitValue) => {
      return createProduct({
        ...payload,
        operator_id: operatorId,
      })
    },
    onSuccess: (created) => {
      queryClient.setQueryData<ProductRow[]>(
        ['products', operatorId],
        (prev) => (prev ? [created, ...prev] : [created]),
      )
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
      const key = ['products', operatorId] as const
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ProductRow[]>(key)
      queryClient.setQueryData<ProductRow[]>(key, (rows) =>
        rows
          ? rows.map((r) => (r.id === id ? { ...r, ...payload } : r))
          : rows,
      )
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous)
    },
    onSuccess: (updated) => {
      const key = ['products', operatorId] as const
      queryClient.setQueryData<ProductRow[]>(key, (rows) =>
        rows ? rows.map((r) => (r.id === updated.id ? updated : r)) : rows,
      )
      setFeedback(t.products.toastUpdated)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteProduct(id, null),
    onMutate: async (id) => {
      const key = ['products', operatorId] as const
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ProductRow[]>(key)
      queryClient.setQueryData<ProductRow[]>(key, (rows) =>
        rows ? rows.filter((r) => r.id !== id) : rows,
      )
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous)
    },
    onSuccess: () => {
      setSelection(null)
      setFeedback(t.products.toastDeleted)
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateProduct(operatorId, id),
    onSuccess: (copy) => {
      queryClient.setQueryData<ProductRow[]>(
        ['products', operatorId],
        (prev) => (prev ? [copy, ...prev] : [copy]),
      )
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

  return (
    <div className="flex flex-col gap-6">
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
      ) : isLoading ? (
        <p className="text-muted-foreground text-sm">{t.products.loading}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ProductsList
            rows={rows}
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
          />
          <Card>
            <CardHeader>
              <CardTitle>
                {resolvedSelection === NEW_PRODUCT
                  ? t.products.headingNew
                  : selectedProduct
                    ? selectedProduct.name
                    : t.products.headingPick}
              </CardTitle>
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
        </div>
      )}
      {selectedProduct &&
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
