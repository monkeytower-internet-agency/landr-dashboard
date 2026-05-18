import { z } from 'zod'
import { supabase } from '@/lib/supabase'

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

export const locationFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  role_type_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Enter a valid email address.',
    }),
})

export type LocationFormValues = z.infer<typeof locationFormSchema>

// Resolved form values with empty string coerced to null for API calls.
export type LocationFormOutput = Omit<LocationFormValues, 'email'> & {
  email: string | null
}

export function resolveFormOutput(values: LocationFormValues): LocationFormOutput {
  return { ...values, email: values.email.trim() === '' ? null : values.email.trim() }
}

export async function fetchLocations(operatorId: string): Promise<Location[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  const res = await fetch(`${apiBase}/api/staff/operators/${operatorId}/locations`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<Location[]>
}

export async function fetchLocationRoleTypes(
  operatorId: string,
): Promise<LocationRoleType[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  const res = await fetch(
    `${apiBase}/api/staff/operators/${operatorId}/location-role-types`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<LocationRoleType[]>
}

export async function createLocation(
  operatorId: string,
  body: LocationFormOutput,
): Promise<Location> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  const payload: Record<string, unknown> = { name: body.name }
  if (body.parent_id) payload.parent_id = body.parent_id
  if (body.email) payload.email = body.email
  if (body.role_type_id) payload.role_type_id = body.role_type_id
  const res = await fetch(`${apiBase}/api/staff/operators/${operatorId}/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<Location>
}

export async function updateLocation(
  operatorId: string,
  locationId: string,
  body: Partial<LocationFormOutput>,
): Promise<Location> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  const payload: Record<string, unknown> = {}
  if (body.name !== undefined) payload.name = body.name
  if (body.parent_id !== undefined) payload.parent_id = body.parent_id
  if (body.email !== undefined) payload.email = body.email
  if (body.role_type_id !== undefined) payload.role_type_id = body.role_type_id
  const res = await fetch(
    `${apiBase}/api/staff/operators/${operatorId}/locations/${locationId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<Location>
}

export async function deleteLocation(
  operatorId: string,
  locationId: string,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  const res = await fetch(
    `${apiBase}/api/staff/operators/${operatorId}/locations/${locationId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
}
