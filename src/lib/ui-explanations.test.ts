// landr-12ux — coverage for the static EXPLANATIONS map and the
// explanationFor lookup helper.

import { describe, expect, it } from 'vitest'
import { EXPLANATIONS, explanationFor } from './ui-explanations'

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

describe('EXPLANATIONS coverage', () => {
  it('covers all 5 booking semantic states', () => {
    const keys = Object.keys(EXPLANATIONS.bookingStage).sort()
    expect(keys).toEqual([
      'cancelled',
      'confirmed',
      'finalised',
      'no_show',
      'pending',
    ])
  })

  it('covers the three canonical approval stage codes', () => {
    const keys = Object.keys(EXPLANATIONS.approvalStage).sort()
    expect(keys).toEqual([
      'awaiting_general_approval',
      'awaiting_hotel_approval',
      'awaiting_secondary_approval',
    ])
  })

  it('covers the three approval-branch buckets', () => {
    const keys = Object.keys(EXPLANATIONS.approvalBranch).sort()
    expect(keys).toEqual(['general', 'hotel', 'secondary'])
  })

  it('covers all 9 pricing rule kinds (landr-d2uy: time_of_day_surcharge + manual_override added)', () => {
    const keys = Object.keys(EXPLANATIONS.ruleKind).sort()
    expect(keys).toEqual([
      'fixed_total',
      'flat_discount',
      'manual_override',
      'per_day_base',
      'per_participant_tier',
      'per_streak_tier',
      'per_total_days_tier',
      'percentage_discount',
      'time_of_day_surcharge',
    ])
  })
})
