import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { t } from '@/lib/strings'

// Mirrors public.product_kind + public.service_time_shape after the
// landr-glx refactor that replaced the single product_duration_kind enum.
//
//   product_kind        — what the operator sells. Drives the booking flow
//                         shape and the dashboard ProductForm.
//   service_time_shape  — only meaningful for product_kind='service'. NULL
//                         for non-service kinds.
//   is_contiguous       — only meaningful when service_time_shape='days_range'
//                         (whole-week vs pick-individual-days semantics).
//
// DB CHECK: (product_kind='service') = (service_time_shape IS NOT NULL).
//
// landr-ssrx — hotel_room is a kind that represents a bookable hotel room
// product tied to a specific hotel-role location. Two further constraints
// from migration 20260520100100_products_hotel_room_columns.sql:
//   (product_kind='hotel_room') = (hotel_location_id IS NOT NULL)
//   product_kind='service' OR hotel_offering='none'
export type ProductKind =
  | 'service'
  | 'subscription'
  | 'digital_good'
  | 'physical_good'
  | 'gift_card'
  | 'hotel_room'

export type ServiceTimeShape =
  | 'single_date'
  | 'days_range'
  | 'fixed_window'
  | 'time_slot'

// landr-ssrx — drives whether the booking widget renders the accommodation
// step for a (service) product: none = hide, optional = show with skip,
// mandatory = show and require. Only meaningful on kind=service products
// (non-service rows are forced to 'none' by a DB CHECK).
export type HotelOffering = 'none' | 'optional' | 'mandatory'

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
  product_kind: ProductKind
  service_time_shape: ServiceTimeShape | null
  is_contiguous: boolean
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
  // landr-ssrx — hotel-room columns. hotel_location_id is non-null iff
  // product_kind='hotel_room'. hotel_offering is 'none' for any non-service
  // kind (forced by DB CHECK); only kind='service' rows can carry
  // 'optional' or 'mandatory'.
  hotel_location_id: string | null
  hotel_offering: HotelOffering
  deleted_at: string | null
  created_at: string
  updated_at: string
  pricing_scheme: { id: string; name: string; currency: string } | null
  product_group: { id: string; name: string; slug: string } | null
  // landr-ssrx — joined hotel name for the list-grouping header on
  // kind='hotel_room' rows. Null for any non-hotel_room product.
  hotel_location: { id: string; name: string } | null
}

const SELECT = `
  id,
  operator_id,
  product_group_id,
  slug,
  name,
  short_description,
  description,
  product_kind,
  service_time_shape,
  is_contiguous,
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
  hotel_location_id,
  hotel_offering,
  deleted_at,
  created_at,
  updated_at,
  pricing_scheme:pricing_schemes ( id, name, currency ),
  product_group:product_groups ( id, name, slug ),
  hotel_location:locations!hotel_location_id ( id, name )
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
  product_kind: ProductKind
  service_time_shape: ServiceTimeShape | null
  is_contiguous: boolean
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
  // landr-ssrx — see ProductRow comment. hotel_location_id is NOT NULL
  // when kind='hotel_room' and NULL otherwise; hotel_offering carries
  // 'optional' / 'mandatory' only on kind='service' rows.
  hotel_location_id: string | null
  hotel_offering: HotelOffering
}

// Recognise both the FastAPI api()-wrapper error code and the raw Postgres
// unique-violation that supabase-js surfaces when the products_operator_slug
// unique index trips. We toast a friendly message and re-throw so the
// mutation's onError + form error state still fire.
//
// landr-m17 — replaces the prior raw-message surface ("duplicate key value
// violates unique constraint products_operator_slug_unique") with a clear
// "pick a different slug" toast.
function isSlugCollisionError(error: {
  message?: string | null
  code?: string | null
}): boolean {
  const msg = (error.message ?? '').toLowerCase()
  if (msg === 'insert_failed_or_duplicate_slug') return true
  if (error.code === '23505' && msg.includes('products_operator_slug')) {
    return true
  }
  if (msg.includes('products_operator_slug_unique')) return true
  return false
}

function reportSlugCollision(): void {
  toast.error(t.products.slugCollisionTitle, {
    description: t.products.slugCollisionBody,
  })
}

export async function createProduct(
  payload: ProductWritePayload,
): Promise<ProductRow> {
  const { data, error } = await supabase
    .from('products')
    .insert(payload)
    .select(SELECT)
    .single()
  if (error) {
    if (isSlugCollisionError(error)) reportSlugCollision()
    throw new Error(error.message)
  }
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
  if (error) {
    if (isSlugCollisionError(error)) reportSlugCollision()
    throw new Error(error.message)
  }
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

export function productKindLabel(kind: ProductKind): string {
  switch (kind) {
    case 'service':
      return 'Service'
    case 'subscription':
      return 'Subscription'
    case 'digital_good':
      return 'Digital good'
    case 'physical_good':
      return 'Physical good'
    case 'gift_card':
      return 'Gift card'
    case 'hotel_room':
      return 'Hotel room'
  }
}

export function serviceTimeShapeLabel(shape: ServiceTimeShape): string {
  switch (shape) {
    case 'single_date':
      return 'Single date'
    case 'days_range':
      return 'Day picker'
    case 'fixed_window':
      return 'Course window'
    case 'time_slot':
      return 'Time slot'
  }
}

export function productSummaryLine(row: ProductRow): string {
  const parts: string[] = [productKindLabel(row.product_kind)]
  if (row.product_kind === 'service' && row.service_time_shape) {
    parts.push(serviceTimeShapeLabel(row.service_time_shape))
  }
  if (row.service_time_shape === 'time_slot' && row.duration_minutes) {
    parts.push(`${row.duration_minutes} min`)
  }
  // landr-ssrx — surface the offering flag on service products so operators
  // can see at a glance which services trigger the accommodation step.
  if (row.product_kind === 'service' && row.hotel_offering !== 'none') {
    parts.push(`hotel ${row.hotel_offering}`)
  }
  if (row.product_group?.name) parts.push(row.product_group.name)
  if (row.pricing_scheme?.name) parts.push(row.pricing_scheme.name)
  return parts.join(' · ')
}

export async function duplicateProduct(
  operatorId: string,
  productId: string,
): Promise<ProductRow> {
  const res = await fetch(
    `/api/staff/operators/${operatorId}/products/${productId}/duplicate`,
    { method: 'POST' },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail ?? 'duplicate_failed')
  }
  return res.json() as Promise<ProductRow>
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
