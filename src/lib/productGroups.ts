/**
 * Operator-scoped product-groups CRUD — surface used by the
 * EditTaxonomyButton pen icon next to the Product-group dropdown on
 * ProductForm (landr-19m).
 *
 * Backed by the FastAPI router at
 * `/api/staff/operators/{operator_id}/product-groups` (staff_product_groups.py).
 * The read helper `fetchProductGroups` already lives in `@/lib/products` and
 * hits Supabase directly for the form-level dropdown payload (id/name/slug).
 */
import { api } from '@/lib/api-client'

export type ProductGroup = {
  id: string
  operator_id: string
  slug: string
  name: string
  name_localized: Record<string, string> | null
  description: string | null
  description_localized: Record<string, string> | null
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type ProductGroupCreate = {
  slug: string
  name: string
  sort_order?: number
  active?: boolean
}

export type ProductGroupPatch = {
  name?: string
  sort_order?: number
  active?: boolean
}

export async function fetchProductGroupsFull(
  operatorId: string,
): Promise<ProductGroup[]> {
  return api<ProductGroup[]>(
    'GET',
    `/api/staff/operators/${operatorId}/product-groups`,
  )
}

export async function createProductGroup(
  operatorId: string,
  body: ProductGroupCreate,
): Promise<ProductGroup> {
  return api<ProductGroup>(
    'POST',
    `/api/staff/operators/${operatorId}/product-groups`,
    body,
  )
}

export async function updateProductGroup(
  operatorId: string,
  groupId: string,
  body: ProductGroupPatch,
): Promise<ProductGroup> {
  return api<ProductGroup>(
    'PATCH',
    `/api/staff/operators/${operatorId}/product-groups/${groupId}`,
    body,
  )
}

export async function deleteProductGroup(
  operatorId: string,
  groupId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/product-groups/${groupId}`,
  )
}
