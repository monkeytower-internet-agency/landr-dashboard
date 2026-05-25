// landr-sbhz.8 — owner revenue overview data layer (STAFF-ONLY).
//
// Reads the FastAPI staff aggregation endpoint
//   GET /api/landr-staff/revenue[?operator_id=…]
// (landr-api app/routers/landr_staff_revenue.py), which returns the platform
// commission the Landr owner (ok@landr.de) earns per operator, split by year
// into REALIZED (finalised bookings' persisted commissions, net of reversals)
// and PROJECTED (confirmed/pending bookings run through the pure commission
// engine). The per-year effective_rate is data-driven from the operator's
// platform commission scheme (5% 2026 / 4% 2027), NOT hardcoded here.
//
// The endpoint is is_landr_staff-gated server-side (403 otherwise); this
// surface is additionally route-guarded in Revenue.tsx. No write paths.
import { api } from '@/lib/api-client'

export type YearBreakdown = {
  year: number
  /** Platform commission rate that fires for that year (e.g. 0.05). null when
   *  no base-% rule applies. */
  effective_rate: number | null
  realized: number
  projected: number
  total: number
  /** Net booking revenue the realized / projected commission was taken from. */
  realized_net_base: number
  projected_net_base: number
  booking_count: number
}

export type OperatorRevenue = {
  operator_id: string
  operator_name: string | null
  operator_slug: string | null
  currency: string
  has_platform_scheme: boolean
  years: YearBreakdown[]
  realized_total: number
  projected_total: number
  total: number
}

export type RevenueOverview = {
  currency: string
  operators: OperatorRevenue[]
  realized_total: number
  projected_total: number
  grand_total: number
  generated_at: string
}

/**
 * Fetch the platform-commission revenue overview. Optional `operatorId`
 * narrows to a single operator; omitted ⇒ every operator with a platform
 * commission scheme or activity.
 */
export async function fetchRevenueOverview(
  operatorId?: string | null,
): Promise<RevenueOverview> {
  const qs = operatorId ? `?operator_id=${encodeURIComponent(operatorId)}` : ''
  return api<RevenueOverview>('GET', `/api/landr-staff/revenue${qs}`)
}

/** Format a numeric amount as the operator's currency (de-DE locale to match
 *  the rest of the dashboard). */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount)
  } catch {
    // Unknown currency code → fall back to a plain 2-dp number + code.
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** Format a rate fraction (0.05) as a percent string ("5%"). */
export function formatRate(rate: number | null): string {
  if (rate === null || rate === undefined) return '—'
  // Trim trailing zeros: 0.05 → "5%", 0.045 → "4.5%".
  const pct = rate * 100
  const rounded = Math.round(pct * 100) / 100
  return `${rounded}%`
}
