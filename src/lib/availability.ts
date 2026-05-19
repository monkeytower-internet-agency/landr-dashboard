import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api-client'

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

export async function fetchAvailability(
  operatorId: string,
  productId: string,
  fromDate: string,
  toDate: string,
): Promise<AvailabilityRow[]> {
  const params = new URLSearchParams({ from: fromDate, to: toDate })
  return api<AvailabilityRow[]>(
    'GET',
    `/api/staff/operators/${operatorId}/products/${productId}/availability?${params.toString()}`,
  )
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
  return api<AvailabilityRow>(
    'POST',
    `/api/staff/operators/${operatorId}/products/${productId}/availability`,
    payload,
  )
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
  return api<BulkAvailabilityResult>(
    'POST',
    `/api/staff/operators/${operatorId}/products/${productId}/availability/bulk`,
    payload,
  )
}

export async function patchAvailability(
  availabilityId: string,
  payload: AvailabilityPatch,
): Promise<AvailabilityRow> {
  return api<AvailabilityRow>(
    'PATCH',
    `/api/staff/availability/${availabilityId}`,
    payload,
  )
}

export async function deleteAvailability(availabilityId: string): Promise<void> {
  await api<void>('DELETE', `/api/staff/availability/${availabilityId}`)
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
