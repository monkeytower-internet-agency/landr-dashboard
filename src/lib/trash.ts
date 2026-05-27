/**
 * Recently-deleted ("trash") bin — fetchers + restore actions (landr-4pn1).
 *
 * The trash surface is gated by RLS the same way every other operator-scoped
 * query is: the standard apply_tenant_rls() helper auto-filters out rows
 * where `deleted_at IS NOT NULL` on both SELECT and UPDATE policies, which
 * means a direct Supabase REST call cannot see soft-deleted rows OR flip
 * `deleted_at` back to NULL. We funnel through the FastAPI staff_trash
 * router instead — it runs as the service role after verifying the caller's
 * operator_memberships row.
 *
 * Five kinds are supported (matching the briefing for landr-4pn1):
 *   - bookings
 *   - contacts
 *   - products
 *   - operator_tags
 *   - pricing_schemes
 *
 * Each kind picks a stable display projection on the server. The dashboard
 * normalises every kind down to {id, deletedAt, label, sublabel?} via
 * trashRowLabel() so a single TrashTable renders all five tabs.
 */

import { api } from '@/lib/api-client'

export const TRASH_KINDS = [
  'bookings',
  'contacts',
  'products',
  'operator_tags',
  'pricing_schemes',
] as const

export type TrashKind = (typeof TRASH_KINDS)[number]

// ---- per-kind row shapes ---------------------------------------------------
//
// Match the server-side projection in staff_trash._KIND_CONFIG so the type
// system catches drift between server and client.

type BaseTrashRow = {
  id: string
  deleted_at: string
}

export type BookingTrashRow = BaseTrashRow & {
  created_at: string
  currency: string | null
  gross_total: number | string | null
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

export type ContactTrashRow = BaseTrashRow & {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

export type ProductTrashRow = BaseTrashRow & {
  name: string | null
  slug: string | null
  product_kind: string | null
}

export type OperatorTagTrashRow = BaseTrashRow & {
  name: string | null
  color: string | null
}

export type PricingSchemeTrashRow = BaseTrashRow & {
  name: string | null
  currency: string | null
}

export type TrashRowByKind = {
  bookings: BookingTrashRow
  contacts: ContactTrashRow
  products: ProductTrashRow
  operator_tags: OperatorTagTrashRow
  pricing_schemes: PricingSchemeTrashRow
}

export type AnyTrashRow = TrashRowByKind[TrashKind]

// ---- fetchers --------------------------------------------------------------

/**
 * List soft-deleted rows of `kind` for the operator. Ordered
 * newest-deleted-first by the server. Capped at 500 — the trash bin is a
 * recently-deleted UX, not a paged archive.
 */
export async function fetchTrash<K extends TrashKind>(
  operatorId: string,
  kind: K,
): Promise<Array<TrashRowByKind[K]>> {
  return await api<Array<TrashRowByKind[K]>>(
    'GET',
    `/api/staff/operators/${operatorId}/trash/${kind}`,
  )
}

// ---- restore --------------------------------------------------------------

/**
 * Restore one soft-deleted row by flipping `deleted_at` back to NULL.
 * Returns the post-restore row so the caller can update the cache without a
 * round-trip. Already-restored / wrong-operator IDs surface as a 404 thrown
 * by the api-client wrapper.
 */
export async function restoreTrashRow<K extends TrashKind>(
  operatorId: string,
  kind: K,
  rowId: string,
): Promise<TrashRowByKind[K]> {
  return await api<TrashRowByKind[K]>(
    'POST',
    `/api/staff/operators/${operatorId}/trash/${kind}/${rowId}/restore`,
  )
}

// ---- display helpers -------------------------------------------------------

/**
 * Normalise any trash row down to a {label, sublabel} pair the TrashTable
 * can render. Per-kind labels mirror the canonical display helpers used
 * elsewhere in the dashboard (contactNameDisplay, customerDisplay, etc.) so
 * trash rows read the same as live rows in other surfaces.
 */
export function trashRowLabel(
  kind: TrashKind,
  row: AnyTrashRow,
): { label: string; sublabel: string | null } {
  switch (kind) {
    case 'bookings': {
      const r = row as BookingTrashRow
      const c = r.customer
      const name = c
        ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() ||
          c.email ||
          '—'
        : '—'
      return { label: name, sublabel: r.id.slice(0, 8) }
    }
    case 'contacts': {
      const r = row as ContactTrashRow
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(' ').trim() ||
        r.email ||
        r.phone ||
        '—'
      return { label: name, sublabel: r.email ?? r.phone ?? null }
    }
    case 'products': {
      const r = row as ProductTrashRow
      return { label: r.name ?? '—', sublabel: r.slug ?? null }
    }
    case 'operator_tags': {
      const r = row as OperatorTagTrashRow
      return { label: r.name ?? '—', sublabel: r.color ?? null }
    }
    case 'pricing_schemes': {
      const r = row as PricingSchemeTrashRow
      return { label: r.name ?? '—', sublabel: r.currency ?? null }
    }
  }
}

const _dateTimeFormatter = new Intl.DateTimeFormat('en-IE', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function trashDeletedAtDisplay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return _dateTimeFormatter.format(d)
}
