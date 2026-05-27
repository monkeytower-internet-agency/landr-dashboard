// landr-znzz.5 — API client for the generic per-operator offers/upsells
// catalogue surfaced in the AFTER phase of the customer event page.
//
// All endpoints are staff-JWT-auth and operator-scoped under
//   /api/staff/operators/{operator_id}/offers
// and go through the shared `api()` wrapper (attaches the bearer token).
//
// GENERICITY (memory operator-configurable-no-defaults): there are NO default
// offers and nothing vendor-specific. Each operator defines their own add-ons
// (flight video, photo merch, gift voucher…) as title + description + a CTA
// label and a CTA url that points at THEIR OWN shop/merch/form. Landr renders
// the cards; the operator owns fulfilment. There is NO price field — the event
// page is a no-price surface; any price lives behind cta_url.

import { api } from '@/lib/api-client'

export type OperatorOffer = {
  id: string
  operator_id: string
  title: string
  description: string | null
  cta_label: string | null
  cta_url: string | null
  image_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type OperatorOfferCreate = {
  title: string
  description?: string | null
  cta_label?: string | null
  cta_url?: string | null
  image_url?: string | null
  is_active?: boolean
  sort_order?: number
}

export type OperatorOfferPatch = {
  title?: string
  description?: string | null
  cta_label?: string | null
  cta_url?: string | null
  image_url?: string | null
  is_active?: boolean
  sort_order?: number
}

function offersPath(operatorId: string): string {
  return `/api/staff/operators/${operatorId}/offers`
}

/** GET the operator's offers, ordered by (sort_order, created_at). */
export async function fetchOperatorOffers(
  operatorId: string,
): Promise<OperatorOffer[]> {
  return api<OperatorOffer[]>('GET', offersPath(operatorId))
}

/** POST a new offer. `title` is required; the rest are optional. */
export async function createOperatorOffer(
  operatorId: string,
  body: OperatorOfferCreate,
): Promise<OperatorOffer> {
  return api<OperatorOffer>('POST', offersPath(operatorId), body)
}

/** PATCH an offer — only the set fields are written. */
export async function updateOperatorOffer(
  operatorId: string,
  offerId: string,
  patch: OperatorOfferPatch,
): Promise<OperatorOffer> {
  return api<OperatorOffer>(
    'PATCH',
    `${offersPath(operatorId)}/${offerId}`,
    patch,
  )
}

/** DELETE (soft-delete) an offer. */
export async function deleteOperatorOffer(
  operatorId: string,
  offerId: string,
): Promise<void> {
  await api<{ ok: boolean; id: string }>(
    'DELETE',
    `${offersPath(operatorId)}/${offerId}`,
  )
}
