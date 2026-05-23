/**
 * Operator-scoped service-roles CRUD wrappers (landr-1tqx).
 *
 * `service_roles` is the per-operator catalogue of participant roles —
 * "Pilot" / "Passenger" / "Diver" / etc. Every operator is auto-seeded
 * with a default {code:'participant', label:'Participant'} row, and the
 * embedded booking widget reads them via the public
 * `public_get_operator_service_roles` RPC (landr-mg0a). This surface lets
 * operators manage that catalogue from Settings → Service roles.
 *
 * Write routing (per CLAUDE.md write-routing convention):
 *   - CRUD funnels through the FastAPI router at
 *     `/api/staff/operators/{operator_id}/service-roles`
 *     (staff_service_roles.py) because two server-side guards make the
 *     errors nicer than raw PostgREST:
 *       · per-operator unique `code` → 409 service_role_code_taken
 *       · last-active-role guard → 409 last_active_role (the widget needs
 *         at least one active role to render the booking form).
 */
import { api } from '@/lib/api-client'

/** A service-role row from public.service_roles. */
export type ServiceRole = {
  id: string
  operator_id: string
  /** Stable machine key the widget submits as `service_role_code`. Unique
   *  per operator. Not editable after create (booking_participants + the
   *  widget reference it). */
  code: string
  /** Customer-visible display label (e.g. "Pilot"). */
  label: string
  label_localized: Record<string, string> | null
  description: string | null
  description_localized: Record<string, string> | null
  /** Doubles as "takes a bus seat?" — operator can flip false for e.g.
   *  companions arriving by their own means. */
  requires_pickup_location: boolean
  requires_provider_role_id: string | null
  /** false for incidental participants (e.g. ground-only companion). */
  receives_main_service: boolean
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type ServiceRoleCreate = {
  code: string
  label: string
  requires_pickup_location?: boolean
  receives_main_service?: boolean
  sort_order?: number
  active?: boolean
}

/** Partial update. `code` is intentionally absent — it's immutable after
 *  create (the widget + booking_participants reference it). Rename via
 *  `label`. */
export type ServiceRolePatch = {
  label?: string
  requires_pickup_location?: boolean
  receives_main_service?: boolean
  sort_order?: number
  active?: boolean
}

/** List the operator's service roles (incl. inactive; soft-deleted hidden),
 *  ordered by sort_order. */
export async function fetchServiceRoles(
  operatorId: string,
): Promise<ServiceRole[]> {
  return await api<ServiceRole[]>(
    'GET',
    `/api/staff/operators/${operatorId}/service-roles`,
  )
}

/** Create a service role. Throws 409 if `code` is already taken. */
export async function createServiceRole(
  operatorId: string,
  body: ServiceRoleCreate,
): Promise<ServiceRole> {
  return await api<ServiceRole>(
    'POST',
    `/api/staff/operators/${operatorId}/service-roles`,
    body,
  )
}

/** Rename / reorder / (de)activate a service role. Deactivating the last
 *  active role throws 409 last_active_role. */
export async function updateServiceRole(
  operatorId: string,
  roleId: string,
  patch: ServiceRolePatch,
): Promise<ServiceRole> {
  return await api<ServiceRole>(
    'PATCH',
    `/api/staff/operators/${operatorId}/service-roles/${roleId}`,
    patch,
  )
}

/** Soft-delete a service role. Deleting the last active role throws 409
 *  last_active_role. */
export async function deleteServiceRole(
  operatorId: string,
  roleId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/service-roles/${roleId}`,
  )
}

/** Derive a machine `code` from a free-typed label. Lowercase, ASCII
 *  alphanumerics + single underscores, trimmed. Mirrors nameToSlug from
 *  @/lib/products but underscored (codes are identifiers, not URL slugs).
 *  Empty input yields '' so the caller can fall back. */
export function labelToCode(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}
