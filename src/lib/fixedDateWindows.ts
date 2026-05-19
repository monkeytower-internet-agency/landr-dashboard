import { api } from '@/lib/api-client'

export type FixedDateWindow = {
  id: string
  operator_id: string
  product_id: string
  start_date: string
  end_date: string
  capacity: number
  capacity_reserved: number
  active: boolean
  created_at: string
  updated_at: string
}

export type FixedDateWindowWritePayload = {
  start_date: string
  end_date: string
  capacity: number
  active?: boolean
}

export type FixedDateWindowPatch = Partial<FixedDateWindowWritePayload>

export async function fetchFixedDateWindows(
  operatorId: string,
  productId: string,
): Promise<FixedDateWindow[]> {
  return api<FixedDateWindow[]>(
    'GET',
    `/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows`,
  )
}

export async function createFixedDateWindow(
  operatorId: string,
  productId: string,
  payload: FixedDateWindowWritePayload,
): Promise<FixedDateWindow> {
  return api<FixedDateWindow>(
    'POST',
    `/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows`,
    payload,
  )
}

export async function patchFixedDateWindow(
  operatorId: string,
  productId: string,
  windowId: string,
  payload: FixedDateWindowPatch,
): Promise<FixedDateWindow> {
  return api<FixedDateWindow>(
    'PATCH',
    `/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows/${windowId}`,
    payload,
  )
}

export async function deleteFixedDateWindow(
  operatorId: string,
  productId: string,
  windowId: string,
): Promise<void> {
  await api<void>(
    'DELETE',
    `/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows/${windowId}`,
  )
}
