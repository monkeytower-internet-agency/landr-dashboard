import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ProductForm } from '@/components/ProductForm'
import type { ProductFormSubmitValue } from '@/components/ProductForm'
import { ProductsList } from '@/components/ProductsList'
import { useOperator } from '@/lib/operator'
import {
  createProduct,
  fetchPricingSchemes,
  fetchProductGroups,
  fetchProducts,
  softDeleteProduct,
  updateProduct,
  type PricingSchemeRef,
  type ProductGroupRef,
  type ProductRow,
} from '@/lib/products'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

const NEW_PRODUCT = 'new' as const
type Selection = typeof NEW_PRODUCT | string | null

export function Products() {
  const { currentOperatorId } = useOperator()
  const queryClient = useQueryClient()
  const [selection, setSelection] = useState<Selection>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const productsQuery = useRealtimeQuery<ProductRow[]>({
    queryKey: ['products', currentOperatorId ?? 'none'],
    queryFn: () => fetchProducts(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'products',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  const pricingSchemesQuery = useQuery<PricingSchemeRef[]>({
    queryKey: ['pricing_schemes', currentOperatorId ?? 'none'],
    queryFn: () => fetchPricingSchemes(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const productGroupsQuery = useQuery<ProductGroupRef[]>({
    queryKey: ['product_groups', currentOperatorId ?? 'none'],
    queryFn: () => fetchProductGroups(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

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
      if (!currentOperatorId) throw new Error('No operator selected')
      return createProduct({
        ...payload,
        operator_id: currentOperatorId,
      })
    },
    onSuccess: (created) => {
      queryClient.setQueryData<ProductRow[]>(
        ['products', currentOperatorId ?? 'none'],
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
      const key = ['products', currentOperatorId ?? 'none'] as const
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
      const key = ['products', currentOperatorId ?? 'none'] as const
      queryClient.setQueryData<ProductRow[]>(key, (rows) =>
        rows ? rows.map((r) => (r.id === updated.id ? updated : r)) : rows,
      )
      setFeedback(t.products.toastUpdated)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteProduct(id, null),
    onMutate: async (id) => {
      const key = ['products', currentOperatorId ?? 'none'] as const
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
  const isLoading = productsQuery.isPending && !!currentOperatorId

  const mutationError =
    createMutation.error ?? updateMutation.error ?? deleteMutation.error
  const submitting =
    createMutation.isPending || updateMutation.isPending
  const deleting = deleteMutation.isPending

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.products.title}</h1>
      </header>

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
    </div>
  )
}
