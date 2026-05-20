// landr-pugm — per-user sort preference for the Products list.
//
// Persisted under `landr.dashboard.productsSort.<userId>` so a reload
// picks up where the user left off and a different account on the same
// browser starts from its own preference (mirrors useContactsSort from
// landr-pqk).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'

/** Sort modes offered on the products list page. */
export type ProductsSort =
  | 'created_at_desc' // Recently added (default)
  | 'updated_at_desc' // Recently changed
  | 'name_asc' // Alphabetical (name ASC)

export const DEFAULT_PRODUCTS_SORT: ProductsSort = 'created_at_desc'

const VALID_SORTS: ReadonlyArray<ProductsSort> = [
  'created_at_desc',
  'updated_at_desc',
  'name_asc',
]

export function storageKey(userId: string): string {
  return `landr.dashboard.productsSort.${userId}`
}

function isProductsSort(v: unknown): v is ProductsSort {
  return (
    typeof v === 'string' && (VALID_SORTS as ReadonlyArray<string>).includes(v)
  )
}

function readStored(userId: string): ProductsSort {
  if (typeof window === 'undefined') return DEFAULT_PRODUCTS_SORT
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (isProductsSort(raw)) return raw
    return DEFAULT_PRODUCTS_SORT
  } catch {
    return DEFAULT_PRODUCTS_SORT
  }
}

function writeStored(userId: string, value: ProductsSort): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), value)
  } catch {
    /* quota / disabled storage — silently ignore. */
  }
}

export type UseProductsSort = {
  sort: ProductsSort
  setSort: (next: ProductsSort) => void
}

/**
 * Restore-and-persist the products sort per user. When no user is signed
 * in we use an in-memory fallback (no persist) so the dropdown still works
 * on the login screen edge case.
 */
export function useProductsSort(): UseProductsSort {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [sort, setSortState] = useState<ProductsSort>(() =>
    userId ? readStored(userId) : DEFAULT_PRODUCTS_SORT,
  )

  const lastUserRef = useRef<string | null>(userId)
  useEffect(() => {
    if (lastUserRef.current === userId) return
    lastUserRef.current = userId
    setSortState(userId ? readStored(userId) : DEFAULT_PRODUCTS_SORT)
  }, [userId])

  const setSort = useCallback(
    (next: ProductsSort) => {
      setSortState(next)
      if (userId) writeStored(userId, next)
    },
    [userId],
  )

  return useMemo(() => ({ sort, setSort }), [sort, setSort])
}
