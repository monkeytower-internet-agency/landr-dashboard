// Unit tests for isFieldVisible in forms.ts (landr-noyq — cross-repo
// field-visibility reconciliation).
//
// This is the FormEditor live-PREVIEW evaluator. It MUST return the SAME
// boolean as the customer-facing widget (landr-booking-widget
// fieldVisibility.test.ts) and the server twin
// (landr-api test_form_responses_validation.py). These cases mirror those
// suites so the three impls stay in lock-step — the dashboard previously
// diverged on empty-array truthiness, list-answer membership, and absent /
// null-value handling.

import { describe, expect, it } from 'vitest'
import { isFieldVisible, type VisibilityRule } from './forms'

describe('isFieldVisible — null / always-visible', () => {
  it('returns true when the rule is null or undefined', () => {
    expect(isFieldVisible(null, {})).toBe(true)
    expect(isFieldVisible(undefined, {})).toBe(true)
  })
})

describe('isFieldVisible — eq (scalar answer)', () => {
  const rule: VisibilityRule = { field_key: 'kind', op: 'eq', value: 'other' }

  it('visible when scalar answer matches', () => {
    expect(isFieldVisible(rule, { kind: 'other' })).toBe(true)
  })
  it('hidden when scalar answer differs', () => {
    expect(isFieldVisible(rule, { kind: 'standard' })).toBe(false)
  })
  it('hidden when referenced answer is absent', () => {
    expect(isFieldVisible(rule, {})).toBe(false)
  })
})

describe('isFieldVisible — eq/neq/in (LIST answer → membership)', () => {
  it('eq against a list uses MEMBERSHIP, not whole-list equality', () => {
    const rule: VisibilityRule = { field_key: 'consent', op: 'eq', value: 'agree' }
    expect(isFieldVisible(rule, { consent: ['agree'] })).toBe(true)
    expect(isFieldVisible(rule, { consent: ['agree', 'other'] })).toBe(true)
    expect(isFieldVisible(rule, { consent: ['other'] })).toBe(false)
    expect(isFieldVisible(rule, { consent: [] })).toBe(false)
  })

  it('neq against a list: hidden when value IS a member', () => {
    const rule: VisibilityRule = { field_key: 'tags', op: 'neq', value: 'skip' }
    expect(isFieldVisible(rule, { tags: ['skip'] })).toBe(false)
    expect(isFieldVisible(rule, { tags: ['other'] })).toBe(true)
    expect(isFieldVisible(rule, { tags: [] })).toBe(true)
  })

  it('in against a list: any intersection → visible', () => {
    const rule: VisibilityRule = { field_key: 'tags', op: 'in', value: ['a', 'b'] }
    expect(isFieldVisible(rule, { tags: ['a', 'z'] })).toBe(true)
    expect(isFieldVisible(rule, { tags: ['z'] })).toBe(false)
    expect(isFieldVisible(rule, { tags: [] })).toBe(false)
  })
})

describe('isFieldVisible — in (scalar answer)', () => {
  const rule: VisibilityRule = { field_key: 'kind', op: 'in', value: ['a', 'b'] }
  it('visible when scalar answer is in the array', () => {
    expect(isFieldVisible(rule, { kind: 'a' })).toBe(true)
  })
  it('hidden when not in the array / absent', () => {
    expect(isFieldVisible(rule, { kind: 'c' })).toBe(false)
    expect(isFieldVisible(rule, {})).toBe(false)
  })
  it('fail-open when in value is not an array', () => {
    const bad = { field_key: 'kind', op: 'in', value: 'x' } as unknown as VisibilityRule
    expect(isFieldVisible(bad, { kind: 'y' })).toBe(true)
  })
})

describe('isFieldVisible — truthy', () => {
  const rule: VisibilityRule = { field_key: 'name', op: 'truthy' }
  it('non-empty string (incl. whitespace) → visible', () => {
    expect(isFieldVisible(rule, { name: 'Ada' })).toBe(true)
    expect(isFieldVisible(rule, { name: '   ' })).toBe(true)
  })
  it('empty string / absent → hidden', () => {
    expect(isFieldVisible(rule, { name: '' })).toBe(false)
    expect(isFieldVisible(rule, {})).toBe(false)
  })
  // landr-noyq divergence: dashboard previously SHOWED an empty list
  // (Boolean([]) === true); now hidden, matching widget/server.
  it('empty list → hidden; non-empty list → visible', () => {
    expect(isFieldVisible(rule, { name: [] })).toBe(false)
    expect(isFieldVisible(rule, { name: ['a'] })).toBe(true)
  })
})

// ─── CROSS-REPO PARITY (landr-noyq) ────────────────────────────────────────────
// Mirrors test_form_responses_validation.py + fieldVisibility.test.ts.

describe('isFieldVisible — parity: whole-number-float value', () => {
  it('value 3.0 matches answer "3" for eq/neq/in (String(3.0) === "3")', () => {
    expect(isFieldVisible({ field_key: 'n', op: 'eq', value: 3.0 } as unknown as VisibilityRule, { n: '3' })).toBe(true)
    expect(isFieldVisible({ field_key: 'n', op: 'eq', value: 3.0 } as unknown as VisibilityRule, { n: '4' })).toBe(false)
    expect(isFieldVisible({ field_key: 'n', op: 'neq', value: 3.0 } as unknown as VisibilityRule, { n: '3' })).toBe(false)
    expect(isFieldVisible({ field_key: 'n', op: 'in', value: [3.0, 5.0] } as unknown as VisibilityRule, { n: '3' })).toBe(true)
  })
  it('a fractional float (3.5) does NOT collapse', () => {
    expect(isFieldVisible({ field_key: 'n', op: 'eq', value: 3.5 } as unknown as VisibilityRule, { n: '3.5' })).toBe(true)
    expect(isFieldVisible({ field_key: 'n', op: 'eq', value: 3.5 } as unknown as VisibilityRule, { n: '3' })).toBe(false)
  })
})

describe('isFieldVisible — parity: null-value contract', () => {
  it('eq with value null → hidden (null matches nothing; absent answer too)', () => {
    const rule: VisibilityRule = { field_key: 'ref', op: 'eq', value: null }
    expect(isFieldVisible(rule, {})).toBe(false)
    expect(isFieldVisible(rule, { ref: 'x' })).toBe(false)
  })
  it('neq with value null → visible (null ≠ anything; absent answer too)', () => {
    const rule: VisibilityRule = { field_key: 'ref', op: 'neq', value: null }
    expect(isFieldVisible(rule, {})).toBe(true)
    expect(isFieldVisible(rule, { ref: 'x' })).toBe(true)
  })
})
