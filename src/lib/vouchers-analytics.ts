// Voucher analytics fetchers — landr-1jgr.
//
// Backs the "Voucher performance" card on /analytics. Two fetches:
//
//   - fetchVouchers(operatorId): the operator's voucher roster (live only),
//     so the shaper can resolve voucher_id → code/kind/amount/currency for
//     each redemption. We keep soft-deleted vouchers OUT of the listing for
//     the dropdown case; the shaper falls back to a synthetic display when a
//     redeemed voucher has since been deleted.
//
//   - fetchVoucherRedemptions(operatorId, from, to): bookings created inside
//     [from, to] with voucher_id_applied IS NOT NULL. These are our
//     "redemptions" (no dedicated voucher_redemptions table exists today —
//     consumption is recorded via bookings.voucher_id_applied, set by the
//     public_submit_booking RPC after the atomic max_uses guard). See bd
//     ticket landr-1jgr for the full reasoning + follow-up to extract a
//     proper voucher_redemptions table once we need per-line-item
//     attribution.
//
// Both tables are operator-scoped via apply_tenant_rls — the dashboard just
// supplies operator_id and reads through the standard supabase client.

import { supabase } from '@/lib/supabase'

export type VoucherKind = 'percent' | 'flat'

export type VoucherRow = {
  id: string
  operator_id: string
  code: string
  kind: VoucherKind
  /** percent: 10.00 = 10%; flat: currency-units. */
  amount: number | string
  currency: string
  used_count: number
  max_uses: number | null
  active: boolean
}

/** A booking that consumed a voucher — the minimum projection needed for
 *  the performance card. `current_semantic_state` lets the shaper exclude
 *  cancelled bookings from the discount-given total (consistent with the
 *  rest of analytics). */
export type VoucherRedemptionRow = {
  booking_id: string
  voucher_id: string
  created_at: string
  gross_total: number | string
  currency: string
  current_semantic_state: string
}

const VOUCHER_SELECT = `
  id,
  operator_id,
  code,
  kind,
  amount,
  currency,
  used_count,
  max_uses,
  active
`

export async function fetchVouchers(
  operatorId: string,
): Promise<VoucherRow[]> {
  const { data, error } = await supabase
    .from('vouchers')
    .select(VOUCHER_SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('code', { ascending: true })
    .limit(1000)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as VoucherRow[]
}

// Bookings projection — only the fields the voucher-performance shaper
// touches. We fetch separately from the main bookings query (instead of
// reusing fetchBookings) because that fetch has a 500-row cap focused on
// the recent activity; redemption analytics wants every voucher use in the
// window regardless of where it lands in the operator's overall booking
// volume.
const REDEMPTION_SELECT = `
  id,
  created_at,
  gross_total,
  currency,
  current_semantic_state,
  voucher_id_applied
`

type RawRedemption = {
  id: string
  created_at: string
  gross_total: number | string
  currency: string
  current_semantic_state: string
  voucher_id_applied: string | null
}

export async function fetchVoucherRedemptions(
  operatorId: string,
  fromIso: string,
  toIso: string,
): Promise<VoucherRedemptionRow[]> {
  // PostgREST `gte`/`lte` on created_at compares the timestamptz value
  // against the ISO string — pass the inclusive day-boundary so the window
  // matches the rest of the analytics page (filterByCreatedAt slices on
  // YYYY-MM-DD strings).
  const fromTs = `${fromIso}T00:00:00.000Z`
  const toTs = `${toIso}T23:59:59.999Z`
  const { data, error } = await supabase
    .from('bookings')
    .select(REDEMPTION_SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .not('voucher_id_applied', 'is', null)
    .gte('created_at', fromTs)
    .lte('created_at', toTs)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as RawRedemption[]
  return rows
    .filter((r): r is RawRedemption & { voucher_id_applied: string } =>
      typeof r.voucher_id_applied === 'string' && r.voucher_id_applied.length > 0,
    )
    .map((r) => ({
      booking_id: r.id,
      voucher_id: r.voucher_id_applied,
      created_at: r.created_at,
      gross_total: r.gross_total,
      currency: r.currency,
      current_semantic_state: r.current_semantic_state,
    }))
}
