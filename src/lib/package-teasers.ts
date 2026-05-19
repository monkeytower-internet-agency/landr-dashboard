// landr-c3t — premium-tease helpers for the ProductForm kind picker.
//
// The ProductForm renders ALL product_kind values in a fixed marketing order;
// kinds outside the operator's subscription package allow-list become either
// hidden or disabled-with-crown depending on shouldShowTeasers(). The tooltip
// on each teaser names the lowest package tier that unlocks the kind so the
// upgrade path is obvious.
//
// Source of truth for the tier seeds is
// supabase/migrations/20260519240100_subscription_kind_packages_and_teasers.sql,
// later widened by 20260520100100_products_hotel_room_columns.sql to include
// 'hotel_room' on pro/business/enterprise (landr-nzak / landr-ssrx):
//
//   free       → ['service']
//   pro        → ['service','subscription','hotel_room']
//   business   → ['service','subscription','hotel_room','physical_good']
//   enterprise → ['service','subscription','hotel_room','physical_good','digital_good','gift_card']
//
// Keep KIND_LOWEST_TIER + TIER_RANK + TIER_LABELS aligned with that seed.

import type { Operator } from '@/lib/operator'
import type { ProductKind } from '@/lib/products'

/**
 * Marketing-order list of every product_kind the picker should show. The
 * order is shared by the picker UI and the teaser layout so paid kinds
 * always appear adjacent to 'service' in the dropdown.
 */
export const KIND_DISPLAY_ORDER: readonly ProductKind[] = [
  'service',
  'subscription',
  'hotel_room',
  'physical_good',
  'digital_good',
  'gift_card',
] as const

export const KIND_LABELS: Record<ProductKind, string> = {
  service: 'Service',
  subscription: 'Subscription',
  hotel_room: 'Hotel room',
  physical_good: 'Physical good',
  digital_good: 'Digital good',
  gift_card: 'Gift card',
}

/**
 * For each product_kind, the slug of the lowest subscription_package tier
 * whose `allowed_product_kinds` includes that kind. Drives the teaser
 * tooltip ("Available on <tier> plan and above").
 */
export const KIND_LOWEST_TIER: Record<ProductKind, string> = {
  service: 'free',
  subscription: 'pro',
  hotel_room: 'pro',
  physical_good: 'business',
  digital_good: 'enterprise',
  gift_card: 'enterprise',
}

export const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
}

/** Ranking used by upgrade-path comparisons. Lower = cheaper. */
export const TIER_RANK: Record<string, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
}

/**
 * Tooltip body for a teaser-disabled product_kind option.
 * E.g. lowestTierTooltip('subscription') → 'Available on Pro plan and above'.
 */
export function lowestTierTooltip(kind: ProductKind): string {
  const slug = KIND_LOWEST_TIER[kind] ?? 'enterprise'
  const label = TIER_LABELS[slug] ?? slug
  return `Available on ${label} plan and above`
}

/**
 * Should the ProductForm reveal disabled-with-crown teaser options for kinds
 * outside the operator's allow-list?
 *
 * - Free-tier operators ALWAYS see teasers regardless of stored value (the
 *   Settings toggle is rendered disabled-on for them, so they can't opt out).
 * - Paid-tier operators see teasers only when show_premium_teasers === true.
 */
export function shouldShowTeasers(operator: Operator | null | undefined): boolean {
  if (!operator) return false
  if (operator.subscription_package?.slug === 'free') return true
  return operator.show_premium_teasers === true
}
