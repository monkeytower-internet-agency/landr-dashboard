import { supabase } from '@/lib/supabase'

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

export async function fetchFixedDateWindows(
  operatorId: string,
  productId: string,
): Promise<FixedDateWindow[]> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows`,
    { headers },
  )
  return unwrap<FixedDateWindow[]>(res)
}

export async function createFixedDateWindow(
  operatorId: string,
  productId: string,
  payload: FixedDateWindowWritePayload,
): Promise<FixedDateWindow> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
  )
  return unwrap<FixedDateWindow>(res)
}

export async function patchFixedDateWindow(
  operatorId: string,
  productId: string,
  windowId: string,
  payload: FixedDateWindowPatch,
): Promise<FixedDateWindow> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows/${windowId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    },
  )
  return unwrap<FixedDateWindow>(res)
}

export async function deleteFixedDateWindow(
  operatorId: string,
  productId: string,
  windowId: string,
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/products/${productId}/fixed-date-windows/${windowId}`,
    { method: 'DELETE', headers },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
}
