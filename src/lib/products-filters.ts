// landr-pugm — per-user product_kind filter state for the Products list.
//
// Mirrors useContactsFilters (landr-pqk): single dimension (`kinds`)
// with chip-style multi-select, persisted under
// `landr.dashboard.productsFilters.<userId>` so reloads pick up where
// the user left off without leaking between accounts.
//
// product_kind is an enum on public.products (see ProductKind in
// @/lib/products): service / subscription / digital_good / physical_good /
// gift_card / hotel_room.
//
// Empty `kinds` array means "show everything". Selecting multiple values
// is OR-within-dimension (union) — see fetchProducts in @/lib/products.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import type { ProductKind } from '@/lib/products'

export const PRODUCT_KINDS: ReadonlyArray<ProductKind> = [
  'service',
  'subscription',
  'hotel_room',
  'physical_good',
  'digital_good',
  'gift_card',
]

export type ProductsFilters = {
  /** Subset of PRODUCT_KINDS; empty = match all. */
  kinds: ProductKind[]
}

export const EMPTY_FILTERS: ProductsFilters = {
  kinds: [],
}

export function storageKey(userId: string): string {
  return `landr.dashboard.productsFilters.${userId}`
}

export function isEmptyFilters(f: ProductsFilters): boolean {
  return f.kinds.length === 0
}

export function activeFilterCount(f: ProductsFilters): number {
  return f.kinds.length
}

function isProductKind(v: unknown): v is ProductKind {
  return (
    typeof v === 'string' &&
    (PRODUCT_KINDS as ReadonlyArray<string>).includes(v)
  )
}

function readStored(userId: string): ProductsFilters {
  if (typeof window === 'undefined') return EMPTY_FILTERS
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY_FILTERS
    const parsed = JSON.parse(raw) as Partial<ProductsFilters>
    const kinds = Array.isArray(parsed?.kinds)
      ? parsed.kinds.filter(isProductKind)
      : []
    return { kinds }
  } catch {
    return EMPTY_FILTERS
  }
}

function writeStored(userId: string, value: ProductsFilters): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(value))
  } catch {
    /* localStorage may be unavailable or full — fail silently. */
  }
}

export type UseProductsFilters = {
  filters: ProductsFilters
  setFilters: (next: ProductsFilters) => void
  toggleKind: (value: ProductKind) => void
  clearAll: () => void
}

/**
 * Per-user product-kind filter hook. Keyed on the auth user id so the
 * same browser distinguishes accounts; falls back to in-memory state
 * when no user is signed in.
 */
export function useProductsFilters(): UseProductsFilters {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [filters, setFiltersState] = useState<ProductsFilters>(() =>
    userId ? readStored(userId) : EMPTY_FILTERS,
  )

  const lastUserRef = useRef<string | null>(userId)
  useEffect(() => {
    if (lastUserRef.current === userId) return
    lastUserRef.current = userId
    setFiltersState(userId ? readStored(userId) : EMPTY_FILTERS)
  }, [userId])

  const setFilters = useCallback(
    (next: ProductsFilters) => {
      setFiltersState(next)
      if (userId) writeStored(userId, next)
    },
    [userId],
  )

  const toggleKind = useCallback(
    (value: ProductKind) => {
      setFiltersState((current) => {
        const exists = current.kinds.includes(value)
        const next: ProductsFilters = {
          ...current,
          kinds: exists
            ? current.kinds.filter((k) => k !== value)
            : [...current.kinds, value],
        }
        if (userId) writeStored(userId, next)
        return next
      })
    },
    [userId],
  )

  const clearAll = useCallback(() => {
    setFiltersState(EMPTY_FILTERS)
    if (userId) writeStored(userId, EMPTY_FILTERS)
  }, [userId])

  return useMemo(
    () => ({ filters, setFilters, toggleKind, clearAll }),
    [filters, setFilters, toggleKind, clearAll],
  )
}
