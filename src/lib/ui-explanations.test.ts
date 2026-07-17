// landr-12ux — coverage for the static EXPLANATIONS map and the
// explanationFor lookup helper.

import { describe, expect, it } from 'vitest'
import { explanationFor } from './ui-explanations'

describe('explanationFor', () => {
  it('returns the explanation string for known (concept, key) pairs', () => {
    expect(explanationFor('bookingStage', 'confirmed')).toMatch(
      /approved and locked in/i,
    )
    expect(explanationFor('approvalStage', 'awaiting_hotel_approval')).toMatch(
      /hotel/i,
    )
    expect(explanationFor('approvalBranch', 'general')).toMatch(/operator/i)
    expect(explanationFor('ruleKind', 'per_streak_tier')).toMatch(
      /consecutive-day/i,
    )
  })

  it('returns null for unknown keys (never the raw key string)', () => {
    expect(explanationFor('bookingStage', 'nope')).toBeNull()
    expect(explanationFor('approvalStage', 'awaiting_legal_review')).toBeNull()
    expect(explanationFor('ruleKind', 'mystery_kind')).toBeNull()
  })

  it('returns null for null / undefined / empty keys', () => {
    expect(explanationFor('bookingStage', null)).toBeNull()
    expect(explanationFor('bookingStage', undefined)).toBeNull()
    expect(explanationFor('bookingStage', '')).toBeNull()
  })
})
