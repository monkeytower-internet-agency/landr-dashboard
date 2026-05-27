// landr-u34k — product_addons CRUD client. Per write-routing-convention,
// plain row writes that RLS + the audit trigger already cover go DIRECT to
// Supabase REST. product_addons is exactly that shape: insert/update/delete
// of a single row with no derived data, no email sends, no Holded sync,
// no cross-table orchestration. The tenant RLS policies enforce operator
// scoping on every path; the standard audit_trigger captures the change.
//
// Schema (migration 20260520140000_product_addons.sql, ticket landr-ndtr):
//   parent_product_id  uuid NOT NULL  — the product the operator is editing
//   addon_product_id   uuid NOT NULL  — the product offered as an add-on
//   is_required        bool default false
//   min_qty            int  default 0   (>= 0)
//   max_qty            int  NULL       (NULL = unlimited, else >= min_qty)
//   sort_order         int  default 0
//
// CHECKs enforced at the DB layer:
//   parent_product_id <> addon_product_id     (no self-link)
//   max_qty IS NULL OR max_qty >= min_qty     (range sanity)
//   NOT is_required OR min_qty >= 1           (required → at least one)
//   UNIQUE (parent_product_id, addon_product_id)
//
// The form blocks the obvious invalid states client-side, but we never
// duplicate the DB CHECK logic here — the supabase error surfaces if a
// race slips through.

import { supabase } from '@/lib/supabase'

export type ProductAddon = {
  id: string
  operator_id: string
  parent_product_id: string
  addon_product_id: string
  is_required: boolean
  min_qty: number
  max_qty: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type ProductAddonCreate = {
  operator_id: string
  parent_product_id: string
  addon_product_id: string
  is_required?: boolean
  min_qty?: number
  max_qty?: number | null
  sort_order?: number
}

export type ProductAddonPatch = {
  addon_product_id?: string
  is_required?: boolean
  min_qty?: number
  max_qty?: number | null
  sort_order?: number
}

const SELECT = `
  id,
  operator_id,
  parent_product_id,
  addon_product_id,
  is_required,
  min_qty,
  max_qty,
  sort_order,
  created_at,
  updated_at
`

export async function fetchProductAddons(
  parentProductId: string,
): Promise<ProductAddon[]> {
  const { data, error } = await supabase
    .from('product_addons')
    .select(SELECT)
    .eq('parent_product_id', parentProductId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductAddon[]
}

export async function createProductAddon(
  payload: ProductAddonCreate,
): Promise<ProductAddon> {
  const { data, error } = await supabase
    .from('product_addons')
    .insert(payload)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ProductAddon
}

export async function patchProductAddon(
  id: string,
  payload: ProductAddonPatch,
): Promise<ProductAddon> {
  const { data, error } = await supabase
    .from('product_addons')
    .update(payload)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ProductAddon
}

export async function deleteProductAddon(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_addons')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}
