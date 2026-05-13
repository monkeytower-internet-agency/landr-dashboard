import { supabase } from '@/lib/supabase'

export type BookingSemanticState =
  | 'pending'
  | 'confirmed'
  | 'finalised'
  | 'cancelled'
  | 'no_show'

export type BookingRow = {
  id: string
  created_at: string
  current_semantic_state: BookingSemanticState
  gross_total: number | string
  currency: string
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
  items: Array<{
    id: string
    products: { id: string; name: string } | null
  }>
}

const SELECT = `
  id,
  created_at,
  current_semantic_state,
  gross_total,
  currency,
  customer:contacts!inner ( id, first_name, last_name, email ),
  items:booking_products ( id, products ( id, name ) )
`

export async function fetchBookings(operatorId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BookingRow[]
}

export function customerDisplay(row: BookingRow): string {
  const c = row.customer
  if (!c) return '—'
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  return name || c.email || '—'
}

export function productDisplay(row: BookingRow): string {
  const named = row.items
    .map((item) => item.products?.name)
    .filter((n): n is string => !!n)
  if (named.length === 0) return '—'
  if (named.length === 1) return named[0]
  return `${named[0]} +${named.length - 1}`
}

const numberFormatCache = new Map<string, Intl.NumberFormat>()
function numberFormatter(currency: string): Intl.NumberFormat {
  const key = currency || 'EUR'
  let fmt = numberFormatCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: key,
    })
    numberFormatCache.set(key, fmt)
  }
  return fmt
}

export function priceDisplay(row: BookingRow): string {
  const n =
    typeof row.gross_total === 'number'
      ? row.gross_total
      : Number(row.gross_total)
  if (!Number.isFinite(n)) return '—'
  return numberFormatter(row.currency || 'EUR').format(n)
}

const dateFormatter = new Intl.DateTimeFormat('en-IE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
export function dateDisplay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateFormatter.format(d)
}
