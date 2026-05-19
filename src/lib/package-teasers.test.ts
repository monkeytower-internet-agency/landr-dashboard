import { describe, expect, it } from 'vitest'

import type { Operator } from '@/lib/operator'
import {
  KIND_DISPLAY_ORDER,
  KIND_LOWEST_TIER,
  lowestTierTooltip,
  shouldShowTeasers,
  TIER_LABELS,
  TIER_RANK,
} from '@/lib/package-teasers'

function op(overrides: Partial<Operator> = {}): Operator {
  return {
    id: 'op-1',
    slug: 'op-1',
    name: 'Test',
    onboarded_at: '2026-05-01T00:00:00Z',
    subscription_package: {
      slug: 'pro',
      name: 'Pro',
      allowed_product_kinds: ['service', 'subscription'],
    },
    show_premium_teasers: false,
    ...overrides,
  }
}

describe('KIND_LOWEST_TIER', () => {
  it('covers every product_kind in KIND_DISPLAY_ORDER', () => {
    for (const k of KIND_DISPLAY_ORDER) {
      expect(KIND_LOWEST_TIER[k]).toBeDefined()
    }
  })

  it('mirrors the migration seed (free→service, pro→subscription, business→physical_good, enterprise→digital_good+gift_card)', () => {
    expect(KIND_LOWEST_TIER.service).toBe('free')
    expect(KIND_LOWEST_TIER.subscription).toBe('pro')
    expect(KIND_LOWEST_TIER.physical_good).toBe('business')
    expect(KIND_LOWEST_TIER.digital_good).toBe('enterprise')
    expect(KIND_LOWEST_TIER.gift_card).toBe('enterprise')
  })

  it('every lowest-tier slug has a TIER_LABELS entry + TIER_RANK rank', () => {
    for (const k of KIND_DISPLAY_ORDER) {
      const slug = KIND_LOWEST_TIER[k]
      expect(TIER_LABELS[slug]).toBeDefined()
      expect(TIER_RANK[slug]).toBeDefined()
    }
  })
})

describe('lowestTierTooltip', () => {
  it("names the lowest unlocking tier for each kind", () => {
    expect(lowestTierTooltip('service')).toMatch(/free/i)
    expect(lowestTierTooltip('subscription')).toMatch(/pro/i)
    expect(lowestTierTooltip('physical_good')).toMatch(/business/i)
    expect(lowestTierTooltip('digital_good')).toMatch(/enterprise/i)
    expect(lowestTierTooltip('gift_card')).toMatch(/enterprise/i)
  })

  it('uses the "Available on X plan and above" phrasing', () => {
    expect(lowestTierTooltip('subscription')).toBe(
      'Available on Pro plan and above',
    )
  })
})

describe('shouldShowTeasers', () => {
  it('returns false when operator is null/undefined', () => {
    expect(shouldShowTeasers(null)).toBe(false)
    expect(shouldShowTeasers(undefined)).toBe(false)
  })

  it('returns true for free-tier operators regardless of stored value', () => {
    expect(
      shouldShowTeasers(
        op({
          subscription_package: {
            slug: 'free',
            name: 'Free',
            allowed_product_kinds: ['service'],
          },
          show_premium_teasers: false,
        }),
      ),
    ).toBe(true)
    expect(
      shouldShowTeasers(
        op({
          subscription_package: {
            slug: 'free',
            name: 'Free',
            allowed_product_kinds: ['service'],
          },
          show_premium_teasers: true,
        }),
      ),
    ).toBe(true)
  })

  it('returns true for paid tiers only when show_premium_teasers is true', () => {
    expect(
      shouldShowTeasers(op({ show_premium_teasers: true })),
    ).toBe(true)
    expect(
      shouldShowTeasers(op({ show_premium_teasers: false })),
    ).toBe(false)
    expect(
      shouldShowTeasers(op({ show_premium_teasers: null })),
    ).toBe(false)
  })

  it('returns false for enterprise operators with teasers off (nothing left to tease)', () => {
    // Enterprise has every kind; this verifies the boolean check works even
    // when there's nothing the picker would actually tease.
    expect(
      shouldShowTeasers(
        op({
          subscription_package: {
            slug: 'enterprise',
            name: 'Enterprise',
            allowed_product_kinds: [
              'service',
              'subscription',
              'physical_good',
              'digital_good',
              'gift_card',
            ],
          },
          show_premium_teasers: false,
        }),
      ),
    ).toBe(false)
  })
})
