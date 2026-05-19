import { supabase } from '@/lib/supabase'

export type AvailabilityStatus = 'open' | 'closed' | 'fully_booked'
export type AvailabilitySource = 'template' | 'manual'

export type AvailabilityRow = {
  id: string
  operator_id: string
  product_id: string
  date: string
  start_time: string | null
  end_time: string | null
  capacity: number
  capacity_reserved: number
  status: AvailabilityStatus
  source: AvailabilitySource
  source_template_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type SlotTime = {
  start_time: string
  end_time: string
}

export type BulkAvailabilityPayload = {
  from: string
  to: string
  capacity: number
  slot_times?: SlotTime[]
  notes?: string | null
}

export type AvailabilityPatch = {
  capacity?: number
  notes?: string | null
  status?: AvailabilityStatus
}

async function authHeaders(): Promise<{
  Authorization: string
  'Content-Type': string
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<T>
}

export async function fetchAvailability(
  operatorId: string,
  productId: string,
  fromDate: string,
  toDate: string,
): Promise<AvailabilityRow[]> {
  const headers = await authHeaders()
  const params = new URLSearchParams({ from: fromDate, to: toDate })
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/products/${productId}/availability?${params.toString()}`,
    { headers },
  )
  return unwrap<AvailabilityRow[]>(res)
}

export async function createAvailability(
  operatorId: string,
  productId: string,
  payload: {
    date: string
    start_time?: string | null
    end_time?: string | null
    capacity: number
    notes?: string | null
  },
): Promise<AvailabilityRow> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/products/${productId}/availability`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
  )
  return unwrap<AvailabilityRow>(res)
}

export type BulkAvailabilityResult = {
  inserted: number
  rows: AvailabilityRow[]
}

export async function bulkCreateAvailability(
  operatorId: string,
  productId: string,
  payload: BulkAvailabilityPayload,
): Promise<BulkAvailabilityResult> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/products/${productId}/availability/bulk`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
  )
  return unwrap<BulkAvailabilityResult>(res)
}

export async function patchAvailability(
  availabilityId: string,
  payload: AvailabilityPatch,
): Promise<AvailabilityRow> {
  const headers = await authHeaders()
  const res = await fetch(`${apiBase()}/api/staff/availability/${availabilityId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  })
  return unwrap<AvailabilityRow>(res)
}

export async function deleteAvailability(availabilityId: string): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`${apiBase()}/api/staff/availability/${availabilityId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
}

export type ProductForSchedule = {
  id: string
  name: string
  duration_kind: 'single_days_range' | 'fixed_date_range' | 'time_slot'
}

export async function fetchSchedulableProducts(
  operatorId: string,
): Promise<ProductForSchedule[]> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, duration_kind')
    .eq('operator_id', operatorId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as ProductForSchedule[]
}
