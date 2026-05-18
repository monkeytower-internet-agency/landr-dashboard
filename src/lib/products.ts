import { supabase } from '@/lib/supabase'

// Mirrors the public.product_duration_kind enum from
// landr-api/supabase/migrations/20260512181622_products.sql.
export type ProductDurationKind = 'single_day' | 'date_range' | 'time_slot'

export type PricingSchemeRef = {
  id: string
  name: string
  currency: string
  active: boolean
}

export type ProductGroupRef = {
  id: string
  name: string
  slug: string
}

// A product row, projected with the joins we need for the dashboard
// (pricing scheme name + product group name shown in the list).
export type ProductRow = {
  id: string
  operator_id: string
  product_group_id: string | null
  slug: string
  name: string
  short_description: string | null
  description: string | null
  duration_kind: ProductDurationKind
  duration_minutes: number | null
  fixed_start_date: string | null
  fixed_end_date: string | null
  default_pricing_scheme_id: string | null
  needs_provider: boolean
  needs_pickup: boolean
  revenue_flows_through_operator: boolean
  is_publicly_listed: boolean
  active: boolean
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
  pricing_scheme: { id: string; name: string; currency: string } | null
  product_group: { id: string; name: string; slug: string } | null
}

const SELECT = `
  id,
  operator_id,
  product_group_id,
  slug,
  name,
  short_description,
  description,
  duration_kind,
  duration_minutes,
  fixed_start_date,
  fixed_end_date,
  default_pricing_scheme_id,
  needs_provider,
  needs_pickup,
  revenue_flows_through_operator,
  is_publicly_listed,
  active,
  sort_order,
  deleted_at,
  created_at,
  updated_at,
  pricing_scheme:pricing_schemes ( id, name, currency ),
  product_group:product_groups ( id, name, slug )
`

export async function fetchProducts(operatorId: string): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from('products')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductRow[]
}

export async function fetchPricingSchemes(
  operatorId: string,
): Promise<PricingSchemeRef[]> {
  const { data, error } = await supabase
    .from('pricing_schemes')
    .select('id, name, currency, active')
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as PricingSchemeRef[]
}

export async function fetchProductGroups(
  operatorId: string,
): Promise<ProductGroupRef[]> {
  const { data, error } = await supabase
    .from('product_groups')
    .select('id, name, slug')
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as ProductGroupRef[]
}

// ---- Create / Update / Delete ---------------------------------------------

export type ProductWritePayload = {
  operator_id: string
  product_group_id: string | null
  slug: string
  name: string
  short_description: string | null
  description: string | null
  duration_kind: ProductDurationKind
  duration_minutes: number | null
  fixed_start_date: string | null
  fixed_end_date: string | null
  default_pricing_scheme_id: string | null
  needs_provider: boolean
  needs_pickup: boolean
  revenue_flows_through_operator: boolean
  is_publicly_listed: boolean
  active: boolean
  sort_order: number
}

export async function createProduct(
  payload: ProductWritePayload,
): Promise<ProductRow> {
  const { data, error } = await supabase
    .from('products')
    .insert(payload)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ProductRow
}

export async function updateProduct(
  id: string,
  payload: Partial<ProductWritePayload>,
): Promise<ProductRow> {
  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ProductRow
}

// Soft-delete (Decision #69 — products has the deleted_at column).
export async function softDeleteProduct(
  id: string,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      deleted_at: new Date().toISOString(),
      deletion_reason: reason,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Display helpers -------------------------------------------------------

export function durationKindLabel(kind: ProductDurationKind): string {
  switch (kind) {
    case 'single_day':
      return 'Single day'
    case 'date_range':
      return 'Date range'
    case 'time_slot':
      return 'Time slot'
  }
}

export function productSummaryLine(row: ProductRow): string {
  const parts: string[] = [durationKindLabel(row.duration_kind)]
  if (row.duration_kind === 'time_slot' && row.duration_minutes) {
    parts.push(`${row.duration_minutes} min`)
  }
  if (row.product_group?.name) parts.push(row.product_group.name)
  if (row.pricing_scheme?.name) parts.push(row.pricing_scheme.name)
  return parts.join(' · ')
}

// Slug helper: convert a display name into a kebab-case slug. The DB enforces
// uniqueness via products_operator_slug_unique; the form pre-fills using this
// helper but the user can override.
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
