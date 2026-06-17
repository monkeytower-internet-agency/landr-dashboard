// Custom Offer (landr-sbhz.2) — per-booking pricing composer.
//
// Contract para.1(2): staff set INDIVIDUAL per-participant prices, an
// automatic group discount once the PAYING party exceeds a threshold
// (Para42: >6 pax), and N FREE / complimentary spots (e.g. a staff
// companion). FREE spots are COMMISSION-FREE per the contract: they
// contribute 0 to the booking's net_total, which is the base the
// platform commission engine uses, so they never accrue commission.
//
// This is the PRICED, per-booking flow — distinct from the generic
// no-price operator "offers" upsell catalogue (lib/offers, landr-znzz.5).
//
// API: /api/staff/operators/{op}/bookings/{id}/custom-offer
//   GET    -> read the offer (lines + computed totals + meta)
//   PUT    -> compose/replace + apply (recompute net/tax/gross)
//   DELETE -> clear the offer

import { api } from '@/lib/api-client'

export type CustomOfferLine = {
  id: string
  booking_participant_id: string | null
  label: string | null
  unit_price: string
  // landr-uvfg.2: regular per-participant price from the pricing scheme.
  // Null when the line has no booking_participant link.
  regular_unit_price: string | null
  is_free: boolean
  sort_order: number
  notes: string | null
}

export type CustomOffer = {
  booking_id: string
  custom_offer_applied: boolean
  group_threshold: number | null
  group_discount_pct: string | null
  group_discount_applied: boolean
  free_spot_count: number
  paying_count: number
  net_total: string
  tax_total: string
  gross_total: string
  balance_due: string
  lines: CustomOfferLine[]
}

// PUT body shape. unit_price is sent as a string (the server parses to
// Decimal); a free line's price is forced to 0 server-side regardless.
export type CustomOfferLineInput = {
  booking_participant_id?: string | null
  label?: string | null
  unit_price?: string
  is_free?: boolean
  sort_order?: number
  notes?: string | null
}

export type CustomOfferInput = {
  lines: CustomOfferLineInput[]
  group_threshold: number
  group_discount_pct: string
  tax_rate: string
}

function base(operatorId: string, bookingId: string): string {
  return `/api/staff/operators/${operatorId}/bookings/${bookingId}/custom-offer`
}

export async function fetchCustomOffer(
  operatorId: string,
  bookingId: string,
): Promise<CustomOffer> {
  return api<CustomOffer>('GET', base(operatorId, bookingId))
}

export async function putCustomOffer(
  operatorId: string,
  bookingId: string,
  body: CustomOfferInput,
): Promise<CustomOffer> {
  return api<CustomOffer>('PUT', base(operatorId, bookingId), body)
}

export async function clearCustomOffer(
  operatorId: string,
  bookingId: string,
): Promise<CustomOffer> {
  return api<CustomOffer>('DELETE', base(operatorId, bookingId))
}

// ── landr-uvfg.4 ─────────────────────────────────────────────────────────────

export type SendOfferResponse = {
  ok: boolean
  sent_to: string
  token_preview: string
}

/**
 * Send the custom offer email to the customer (landr-uvfg.4).
 * POST /api/staff/operators/{op}/bookings/{id}/send-offer
 * Requires custom_offer_applied=true on the booking; returns {ok, sent_to}.
 */
export async function sendOffer(
  operatorId: string,
  bookingId: string,
): Promise<SendOfferResponse> {
  return api<SendOfferResponse>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/send-offer`,
  )
}
