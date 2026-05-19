import { api } from '@/lib/api-client'
import type { PricingSchemeRef } from '@/lib/products'

/**
 * Minimal CRUD for pricing schemes — surface used by the
 * EditTaxonomyButton next to the Discount-scheme dropdown on ProductForm
 * (landr-wto). Rules + tiers (the full pricing editor) are out of scope
 * for this slice; only name + currency are editable here.
 */

export type PricingSchemeWritePayload = {
  name: string
  currency: string
}

export async function createPricingScheme(
  operatorId: string,
  body: PricingSchemeWritePayload,
): Promise<PricingSchemeRef> {
  return api<PricingSchemeRef>(
    'POST',
    `/api/staff/operators/${operatorId}/pricing-schemes`,
    body,
  )
}

export async function patchPricingScheme(
  operatorId: string,
  schemeId: string,
  body: Partial<PricingSchemeWritePayload>,
): Promise<PricingSchemeRef> {
  return api<PricingSchemeRef>(
    'PATCH',
    `/api/staff/operators/${operatorId}/pricing-schemes/${schemeId}`,
    body,
  )
}

export async function deletePricingScheme(
  operatorId: string,
  schemeId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/pricing-schemes/${schemeId}`,
  )
}
