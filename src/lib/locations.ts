import { z } from 'zod'
import { api } from '@/lib/api-client'

export type LocationRoleType = {
  id: string
  operator_id: string
  code: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type Location = {
  id: string
  operator_id: string
  parent_id: string | null
  name: string
  name_localized: Record<string, string> | null
  geo: Record<string, unknown> | null
  email: string | null
  role_type_id: string | null
  created_at: string
  updated_at: string
}

// landr-cyoi — the basic pickup-location form no longer carries `email`.
// Email belongs to hotels (a first-class entity managed under Settings →
// Hotels). The `email` column still exists on the row (see the Location type
// below) and is read by the Hotels page / widget / _resolve_hotel_email, but
// this editor no longer writes it.
export const locationFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  role_type_id: z.string().nullable(),
  parent_id: z.string().nullable(),
})

export type LocationFormValues = z.infer<typeof locationFormSchema>

// Resolved form values (kept as a distinct type so the create/update helpers
// have a stable output contract even though it is now identical to the form
// values).
export type LocationFormOutput = LocationFormValues

export function resolveFormOutput(values: LocationFormValues): LocationFormOutput {
  return { ...values }
}

// landr-cyoi — does this role_type_id resolve to the 'hotel' role type? Used
// by the pickup-locations table to render hotel rows read-only ("managed
// under Hotels") and by the form to filter 'hotel' out of the role dropdown.
export const isHotelRole = (
  roleTypes: LocationRoleType[],
  roleTypeId: string | null,
): boolean =>
  roleTypeId != null &&
  roleTypes.find((r) => r.id === roleTypeId)?.code === 'hotel'

export async function fetchLocations(operatorId: string): Promise<Location[]> {
  return api<Location[]>('GET', `/api/staff/operators/${operatorId}/locations`)
}

export async function fetchLocationRoleTypes(
  operatorId: string,
): Promise<LocationRoleType[]> {
  return api<LocationRoleType[]>(
    'GET',
    `/api/staff/operators/${operatorId}/location-role-types`,
  )
}

export async function createLocation(
  operatorId: string,
  body: LocationFormOutput,
): Promise<Location> {
  const payload: Record<string, unknown> = { name: body.name }
  if (body.parent_id) payload.parent_id = body.parent_id
  if (body.role_type_id) payload.role_type_id = body.role_type_id
  return api<Location>('POST', `/api/staff/operators/${operatorId}/locations`, payload)
}

export async function updateLocation(
  operatorId: string,
  locationId: string,
  body: Partial<LocationFormOutput>,
): Promise<Location> {
  const payload: Record<string, unknown> = {}
  if (body.name !== undefined) payload.name = body.name
  if (body.parent_id !== undefined) payload.parent_id = body.parent_id
  if (body.role_type_id !== undefined) payload.role_type_id = body.role_type_id
  return api<Location>(
    'PATCH',
    `/api/staff/operators/${operatorId}/locations/${locationId}`,
    payload,
  )
}

export async function deleteLocation(
  operatorId: string,
  locationId: string,
): Promise<void> {
  await api<void>(
    'DELETE',
    `/api/staff/operators/${operatorId}/locations/${locationId}`,
  )
}

// ---- location_role_types (per-operator taxonomy) -------------------
//
// landr-ogf: CRUD helpers for the pen-icon "manage types" sheet
// rendered from PickupLocationForm.

export type LocationRoleTypeCreate = {
  code: string
  label: string
  sort_order?: number
}

export type LocationRoleTypePatch = {
  label?: string
  sort_order?: number
}

export async function createLocationRoleType(
  operatorId: string,
  body: LocationRoleTypeCreate,
): Promise<LocationRoleType> {
  return api<LocationRoleType>(
    'POST',
    `/api/staff/operators/${operatorId}/location-role-types`,
    body,
  )
}

export async function updateLocationRoleType(
  operatorId: string,
  roleTypeId: string,
  body: LocationRoleTypePatch,
): Promise<LocationRoleType> {
  return api<LocationRoleType>(
    'PATCH',
    `/api/staff/operators/${operatorId}/location-role-types/${roleTypeId}`,
    body,
  )
}

export async function deleteLocationRoleType(
  operatorId: string,
  roleTypeId: string,
): Promise<void> {
  await api<void>(
    'DELETE',
    `/api/staff/operators/${operatorId}/location-role-types/${roleTypeId}`,
  )
}
