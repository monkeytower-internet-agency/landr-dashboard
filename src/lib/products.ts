import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { t } from '@/lib/strings'
import type { ProductsSort } from '@/lib/products-sort'
import type { Enums, Tables } from '@/types/database.gen'

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
//
// landr-52ik.5 — both are native Postgres enums; derived from the generated
// schema (database.gen.ts) so drift between the DB and the dashboard is
// caught by tsc instead of rotting silently. Single source of truth — other
// modules (e.g. lib/bookings.ts) re-export from here rather than
// re-declaring.
export type ProductKind = Enums<'product_kind'>

export type ServiceTimeShape = Enums<'service_time_shape'>

// landr-ssrx — drives whether the booking widget renders the accommodation
// step for a (service) product: none = hide, optional = show with skip,
// mandatory = show and require. Only meaningful on kind=service products
// (non-service rows are forced to 'none' by a DB CHECK).
export type HotelOffering = 'none' | 'optional' | 'mandatory'

export type PricingSchemeProductUsage = {
  id: string
  slug: string
  name: string
}

export type PricingSchemeRef = {
  id: string
  name: string
  currency: string
  active: boolean
  // landr-i018 — surface optional notes inline on the Pricing index card
  // (previously hidden until the detail editor sheet opened).
  notes: string | null
  // landr-i018 — products whose default_pricing_scheme_id points at this
  // scheme. PostgREST inverse-embed via the FK
  // products_default_pricing_scheme_id_fkey; we filter out soft-deleted
  // rows client-side because PostgREST embeds keep them by default.
  products: PricingSchemeProductUsage[]
}

export type ProductGroupRef = {
  id: string
  name: string
  slug: string
}

// A product row, projected with the joins we need for the dashboard
// (pricing scheme name + product group name shown in the list).
//
// landr-y3oj.3 — scalar field types below are indexed off the generated
// `Tables<'products'>` (database.gen.ts) — `Tables<'products'>['id']`
// etc. — instead of re-declared literals, so a migration that
// renames/retypes/drops a column is caught by tsc, while keeping the
// per-field domain comments a flat `Pick<>` can't carry. Three fields stay
// fully hand-typed because the generated schema is provably WIDER there
// (not a case of "don't force it" — these are genuine, narrower-is-correct
// overrides, not gaps to paper over):
//   - name_localized / short_description_localized: jsonb columns type as
//     the fully-recursive `Json` in the generated Row (Postgres jsonb
//     carries no static value-type info); this codebase's localized-jsonb
//     convention is always Record<locale, string>.
//   - hotel_offering: `text` + a CHECK constraint in Postgres, not a native
//     enum, so codegen can only emit `string`; `HotelOffering` is this
//     app's own narrower convention (kept in sync manually with the CHECK).
// pricing_scheme / product_group / hotel_location are PostgREST embeds
// (joins), not part of the base table Row, so they stay hand-declared.
export type ProductRow = {
  id: Tables<'products'>['id']
  operator_id: Tables<'products'>['operator_id']
  product_group_id: Tables<'products'>['product_group_id']
  slug: Tables<'products'>['slug']
  name: Tables<'products'>['name']
  // landr-14s4 — per-locale overrides ({ locale: text }) for name +
  // short_description. The widget renders exact locale → base-language →
  // base column (pickLocalized); an absent key inherits the base field.
  // NOTE: products.description has NO *_localized widget pick yet (the
  // column exists but no public RPC returns it) — see ProductForm + the
  // follow-up bead. We deliberately don't surface description_localized here.
  name_localized: Record<string, string> | null
  short_description: Tables<'products'>['short_description']
  short_description_localized: Record<string, string> | null
  description: Tables<'products'>['description']
  product_kind: ProductKind
  service_time_shape: ServiceTimeShape | null
  is_contiguous: Tables<'products'>['is_contiguous']
  duration_minutes: Tables<'products'>['duration_minutes']
  fixed_start_date: Tables<'products'>['fixed_start_date']
  fixed_end_date: Tables<'products'>['fixed_end_date']
  default_pricing_scheme_id: Tables<'products'>['default_pricing_scheme_id']
  needs_provider: Tables<'products'>['needs_provider']
  needs_pickup: Tables<'products'>['needs_pickup']
  revenue_flows_through_operator: Tables<'products'>['revenue_flows_through_operator']
  is_publicly_listed: Tables<'products'>['is_publicly_listed']
  active: Tables<'products'>['active']
  sort_order: Tables<'products'>['sort_order']
  // landr-ssrx — hotel-room columns. hotel_location_id is non-null iff
  // product_kind='hotel_room'. hotel_offering is 'none' for any non-service
  // kind (forced by DB CHECK); only kind='service' rows can carry
  // 'optional' or 'mandatory'.
  hotel_location_id: Tables<'products'>['hotel_location_id']
  hotel_offering: HotelOffering
  // landr-u34k — when true, the product is hidden from the main product
  // list and is only purchasable as an add-on of another product (via
  // product_addons.addon_product_id). Distinct from is_publicly_listed;
  // a row can be addon_only AND publicly_listed for the storefront widget.
  is_addon_only: Tables<'products'>['is_addon_only']
  // landr-fi68 / landr-knm0 — max people accommodated by one unit of this
  // product. Meaningful today for kind='hotel_room' (room sleeps N); NULL
  // elsewhere by convention. DB CHECK enforces NULL OR >= 1.
  capacity_per_unit: Tables<'products'>['capacity_per_unit']
  // landr-c53m.4 — whether a hotel_room product's rate includes breakfast.
  // Only meaningful for kind='hotel_room'; branches booking-confirmation
  // email content (landr-api booking_emails.py).
  includes_breakfast: Tables<'products'>['includes_breakfast']
  deleted_at: Tables<'products'>['deleted_at']
  created_at: Tables<'products'>['created_at']
  updated_at: Tables<'products'>['updated_at']
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
  name_localized,
  short_description,
  short_description_localized,
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
  is_addon_only,
  capacity_per_unit,
  includes_breakfast,
  deleted_at,
  created_at,
  updated_at,
  pricing_scheme:pricing_schemes ( id, name, currency ),
  product_group:product_groups ( id, name, slug ),
  hotel_location:locations!hotel_location_id ( id, name )
`

export type FetchProductsOptions = {
  /**
   * landr-pugm — sort mode applied via .order() at the API layer so the
   * 500-row limit still surfaces the most relevant rows first.
   * Defaults to the existing sort_order ASC / name ASC pair (the v0
   * behaviour that operators are used to from the manual list ordering).
   */
  sort?: ProductsSort
  /**
   * OR-within-dimension: rows whose product_kind is in the listed set.
   * Empty / undefined = all kinds.
   */
  kinds?: ProductKind[]
}

/**
 * landr-pugm — fetch the products list with optional sort + kind filter
 * applied server-side. When no opts are passed this falls back to the
 * original sort_order ASC / name ASC pair so existing callers (and the
 * legacy v0 manual-ordering UX) stay unchanged.
 */
export async function fetchProducts(
  operatorId: string,
  opts: FetchProductsOptions = {},
): Promise<ProductRow[]> {
  let query = supabase
    .from('products')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)

  if (opts.kinds && opts.kinds.length > 0) {
    query = query.in('product_kind', opts.kinds)
  }

  if (opts.sort === 'created_at_desc') {
    query = query.order('created_at', { ascending: false })
  } else if (opts.sort === 'updated_at_desc') {
    query = query.order('updated_at', { ascending: false })
  } else if (opts.sort === 'name_asc') {
    query = query.order('name', { ascending: true })
  } else {
    // No explicit sort — preserve the legacy ordering callers expect.
    query = query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
  }

  const { data, error } = await query.limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductRow[]
}

export type ProductKindCounts = Record<ProductKind, number>

/**
 * landr-pugm — counts of products per kind for an operator. Powers the
 * '(N)' badge on the ProductsFilters kind chips and the disabled-when-zero
 * behaviour from landr-knz3.
 *
 * Soft-deleted rows (`deleted_at NOT NULL`) are excluded so the counts
 * match the visible Products list. Client-side reduce is fine at Para42
 * scale (~few dozen products per operator); revisit if an operator's
 * catalogue grows past ~1000 rows.
 */
export async function fetchProductKindCounts(
  operatorId: string,
): Promise<ProductKindCounts> {
  const { data, error } = await supabase
    .from('products')
    .select('product_kind')
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .limit(5000)
  if (error) throw new Error(error.message)

  const counts: ProductKindCounts = {
    service: 0,
    subscription: 0,
    digital_good: 0,
    physical_good: 0,
    gift_card: 0,
    hotel_room: 0,
  }

  const rows = (data ?? []) as Array<{ product_kind: string | null }>
  for (const row of rows) {
    const kind = row.product_kind
    if (kind && kind in counts) {
      counts[kind as ProductKind] += 1
    }
  }
  return counts
}

export async function fetchPricingSchemes(
  operatorId: string,
): Promise<PricingSchemeRef[]> {
  // landr-i018 — inverse-embed products that link this scheme as their
  // default_pricing_scheme_id so the Pricing index can render the
  // 'Used by: <product>' line in a single round-trip. We pin the embed
  // to the foreign column name (products!default_pricing_scheme_id),
  // matching the convention used elsewhere in this file
  // (locations!hotel_location_id on the products SELECT).
  const { data, error } = await supabase
    .from('pricing_schemes')
    .select(
      'id, name, currency, active, notes, products:products!default_pricing_scheme_id ( id, slug, name, deleted_at )',
    )
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)

  type RawScheme = Omit<PricingSchemeRef, 'products'> & {
    products: Array<PricingSchemeProductUsage & { deleted_at: string | null }> | null
  }

  const rows = (data ?? []) as unknown as RawScheme[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    currency: row.currency,
    active: row.active,
    notes: row.notes ?? null,
    // Embedded rows include soft-deleted products; strip them so the
    // 'Used by' line only mentions products the operator can still see.
    products: (row.products ?? [])
      .filter((p) => p.deleted_at === null)
      .map(({ id, slug, name }) => ({ id, slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
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
  // landr-14s4 — per-locale overrides for name + short_description. Empty
  // overrides are stripped to absent keys before the write so the widget
  // fallback keeps working.
  name_localized: Record<string, string> | null
  short_description: string | null
  short_description_localized: Record<string, string> | null
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
  // landr-u34k — hide from the main product list, restrict purchase to
  // add-on flows. See ProductRow comment.
  is_addon_only: boolean
  // landr-fi68 / landr-knm0 — max people per unit (rooms today). NULL when
  // the operator hasn't set a value or the kind doesn't carry the semantic.
  capacity_per_unit: number | null
  // landr-c53m.4 — see ProductRow comment. Only meaningful on kind='hotel_room'.
  includes_breakfast: boolean
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

// landr-knm0 — suggest a sensible capacity_per_unit for hotel_room products
// from the display name (or slug). Mirrors the Para42 seed heuristic:
//
//   single  → 1
//   double  → 2
//   twin    → 2
//   triple  → 3
//   family  → 4
//
// Returns null when no token matches; callers should fall back to 1 only
// when actually creating a brand-new row (existing rows with NULL stay
// NULL until the operator edits the field).
export function suggestRoomCapacity(nameOrSlug: string): number | null {
  const haystack = nameOrSlug.toLowerCase()
  if (haystack.includes('family')) return 4
  if (haystack.includes('triple')) return 3
  if (haystack.includes('double') || haystack.includes('twin')) return 2
  if (haystack.includes('single')) return 1
  return null
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
