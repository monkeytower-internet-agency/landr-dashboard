// landr-aqn4 — pure-logic coverage for the Approvals filter matcher and
// the bucket helpers it depends on (approvalReasonsOf, isNewCustomer,
// urgencyBucketOf, priceBucketOf, firstActivityDate).

import { describe, expect, it } from 'vitest'

import type { BookingRow } from '@/lib/bookings'
import {
  approvalReasonsOf,
  firstActivityDate,
  isNewCustomer,
  priceBucketOf,
  stageOf,
  urgencyBucketOf,
} from '@/lib/bookings'
import { matchesApprovalsFilters } from '@/lib/approvals-filter-match'
import {
  EMPTY_APPROVALS_FILTERS,
  type ApprovalsFilters,
} from '@/lib/approvals-filters'

function row(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b-1',
    created_at: '2026-05-17T10:00:00.000Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 200,
    currency: 'EUR',
    approval_trace: {
      outcome: 'requires_general_approval',
      applied_rules: [{ rule_kind: 'capacity_threshold', detail: {} }],
    },
    customer: {
      id: 'c-1',
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.com',
      phone: null,
    },
    items: [
      {
        id: 'i-1',
        date_range_start: '2026-06-01',
        date_range_end: '2026-06-01',
        selected_days: ['2026-06-01'],
        products: {
          id: 'p-1',
          name: 'Tandem',
          product_kind: 'service',
          service_time_shape: 'time_slot',
        },
      },
    ],
    participants: [],
    ...overrides,
  }
}

describe('approvalReasonsOf', () => {
  it('maps capacity_threshold rule to capacity_warning', () => {
    expect(approvalReasonsOf(row())).toContain('capacity_warning')
  })

  it('maps first_time_customer rule to new_customer', () => {
    const r = row({
      approval_trace: {
        applied_rules: [{ rule_kind: 'first_time_customer', detail: {} }],
      },
    })
    expect(approvalReasonsOf(r)).toContain('new_customer')
  })

  it('maps date_override + product_override rules to manual_override', () => {
    const r1 = row({
      approval_trace: {
        applied_rules: [{ rule_kind: 'date_override', detail: {} }],
      },
    })
    expect(approvalReasonsOf(r1)).toContain('manual_override')
    const r2 = row({
      approval_trace: {
        applied_rules: [{ rule_kind: 'product_override', detail: {} }],
      },
    })
    expect(approvalReasonsOf(r2)).toContain('manual_override')
  })

  it('falls back to other for unknown rule_kind', () => {
    const r = row({
      approval_trace: {
        applied_rules: [{ rule_kind: 'high_value', detail: {} }],
      },
    })
    expect(approvalReasonsOf(r)).toContain('other')
  })

  it('returns multiple buckets when multiple rules fire', () => {
    const r = row({
      approval_trace: {
        applied_rules: [
          { rule_kind: 'capacity_threshold', detail: {} },
          { rule_kind: 'first_time_customer', detail: {} },
        ],
      },
    })
    const buckets = approvalReasonsOf(r)
    expect(buckets.has('capacity_warning')).toBe(true)
    expect(buckets.has('new_customer')).toBe(true)
  })

  it('returns other when approval_trace is missing', () => {
    const r = row({ approval_trace: null })
    expect(approvalReasonsOf(r)).toEqual(new Set(['other']))
  })
})

describe('isNewCustomer', () => {
  it('returns true when first_time_customer rule fired', () => {
    const r = row({
      approval_trace: {
        applied_rules: [{ rule_kind: 'first_time_customer', detail: {} }],
      },
    })
    expect(isNewCustomer(r)).toBe(true)
  })

  it('returns false when no first_time_customer rule', () => {
    expect(isNewCustomer(row())).toBe(false)
  })

  it('returns false when approval_trace is missing', () => {
    expect(isNewCustomer(row({ approval_trace: null }))).toBe(false)
  })
})

describe('firstActivityDate', () => {
  it('returns the min across date_range_start values', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-07-01',
          date_range_end: null,
          selected_days: null,
          products: null,
        },
        {
          id: 'i-2',
          date_range_start: '2026-06-15',
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
    expect(firstActivityDate(r)).toBe('2026-06-15')
  })

  it('falls back to the first selected_day when no date_range_start', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: null,
          date_range_end: null,
          selected_days: ['2026-08-20', '2026-08-21'],
          products: null,
        },
      ],
    })
    expect(firstActivityDate(r)).toBe('2026-08-20')
  })

  it('returns null when no scheduling info', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: null,
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
    expect(firstActivityDate(r)).toBeNull()
  })
})

describe('urgencyBucketOf', () => {
  const now = new Date('2026-06-01T12:00:00Z')

  it('buckets ≤3 days as urgent', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-06-03',
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
    expect(urgencyBucketOf(r, now)).toBe('urgent')
  })

  it('buckets 4-14 days as soon', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-06-10',
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
    expect(urgencyBucketOf(r, now)).toBe('soon')
  })

  it('buckets 15+ days as later', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-07-01',
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
    expect(urgencyBucketOf(r, now)).toBe('later')
  })

  it('returns unknown when no activity date', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: null,
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
    expect(urgencyBucketOf(r, now)).toBe('unknown')
  })
})

describe('priceBucketOf', () => {
  it('buckets <100€ as low', () => {
    expect(priceBucketOf(row({ gross_total: 50 }))).toBe('low')
  })

  it('buckets 100-500€ as mid', () => {
    expect(priceBucketOf(row({ gross_total: 100 }))).toBe('mid')
    expect(priceBucketOf(row({ gross_total: 500 }))).toBe('mid')
  })

  it('buckets >500€ as high', () => {
    expect(priceBucketOf(row({ gross_total: 750 }))).toBe('high')
  })

  it('treats invalid gross_total as low', () => {
    expect(priceBucketOf(row({ gross_total: 'oops' }))).toBe('low')
  })
})

describe('matchesApprovalsFilters', () => {
  const now = new Date('2026-06-01T12:00:00Z')

  function withFilters(over: Partial<ApprovalsFilters>): ApprovalsFilters {
    return { ...EMPTY_APPROVALS_FILTERS, ...over }
  }

  it('empty filters match everything', () => {
    expect(matchesApprovalsFilters(row(), EMPTY_APPROVALS_FILTERS, now)).toBe(
      true,
    )
  })

  it('reason filter matches when ANY bucket fires (within-dim OR)', () => {
    const r = row({
      approval_trace: {
        applied_rules: [{ rule_kind: 'first_time_customer', detail: {} }],
      },
    })
    expect(
      matchesApprovalsFilters(
        r,
        withFilters({ reasons: ['capacity_warning', 'new_customer'] }),
        now,
      ),
    ).toBe(true)
  })

  it('reason filter excludes when no bucket matches', () => {
    expect(
      matchesApprovalsFilters(
        row(), // capacity_warning bucket
        withFilters({ reasons: ['new_customer'] }),
        now,
      ),
    ).toBe(false)
  })

  it('productIds filter matches when ANY item product matches', () => {
    const r = row({
      items: [
        {
          id: 'i-1',
          date_range_start: null,
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'p-X',
            name: 'X',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
        {
          id: 'i-2',
          date_range_start: null,
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'p-Y',
            name: 'Y',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
      ],
    })
    expect(
      matchesApprovalsFilters(r, withFilters({ productIds: ['p-Y'] }), now),
    ).toBe(true)
    expect(
      matchesApprovalsFilters(r, withFilters({ productIds: ['p-Z'] }), now),
    ).toBe(false)
  })

  it('customerStatus filter: new vs returning', () => {
    const newCustomerRow = row({
      approval_trace: {
        applied_rules: [{ rule_kind: 'first_time_customer', detail: {} }],
      },
    })
    expect(
      matchesApprovalsFilters(
        newCustomerRow,
        withFilters({ customerStatus: ['new'] }),
        now,
      ),
    ).toBe(true)
    expect(
      matchesApprovalsFilters(
        newCustomerRow,
        withFilters({ customerStatus: ['returning'] }),
        now,
      ),
    ).toBe(false)
    expect(
      matchesApprovalsFilters(
        row(), // capacity reason → returning
        withFilters({ customerStatus: ['returning'] }),
        now,
      ),
    ).toBe(true)
  })

  it('urgency filter buckets correctly', () => {
    const urgentRow = row({
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-06-02',
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
    expect(
      matchesApprovalsFilters(
        urgentRow,
        withFilters({ urgency: ['urgent'] }),
        now,
      ),
    ).toBe(true)
    expect(
      matchesApprovalsFilters(
        urgentRow,
        withFilters({ urgency: ['later'] }),
        now,
      ),
    ).toBe(false)
  })

  it('price filter buckets correctly', () => {
    expect(
      matchesApprovalsFilters(
        row({ gross_total: 50 }),
        withFilters({ price: ['low'] }),
        now,
      ),
    ).toBe(true)
    expect(
      matchesApprovalsFilters(
        row({ gross_total: 50 }),
        withFilters({ price: ['high'] }),
        now,
      ),
    ).toBe(false)
  })

  it('across dimensions is intersection (AND)', () => {
    const r = row({
      gross_total: 50, // low
      approval_trace: {
        applied_rules: [{ rule_kind: 'first_time_customer', detail: {} }],
      },
    })
    // new + low → both match
    expect(
      matchesApprovalsFilters(
        r,
        withFilters({ customerStatus: ['new'], price: ['low'] }),
        now,
      ),
    ).toBe(true)
    // new + high → price excludes
    expect(
      matchesApprovalsFilters(
        r,
        withFilters({ customerStatus: ['new'], price: ['high'] }),
        now,
      ),
    ).toBe(false)
  })

  // landr-qmdo — Stage dimension ('general' | 'secondary' | 'hotel').
  it('stage filter matches when current_stage.code is in the set', () => {
    const r = row() // current_stage.code = awaiting_general_approval
    expect(
      matchesApprovalsFilters(r, withFilters({ stages: ['general'] }), now),
    ).toBe(true)
    expect(
      matchesApprovalsFilters(r, withFilters({ stages: ['hotel'] }), now),
    ).toBe(false)
  })

  it('stage filter is multi-select OR within the dimension', () => {
    const general = row({ current_stage: { code: 'awaiting_general_approval' } })
    const hotel = row({ current_stage: { code: 'awaiting_hotel_approval' } })
    const secondary = row({
      current_stage: { code: 'awaiting_secondary_approval' },
    })
    const filters = withFilters({ stages: ['general', 'hotel'] })
    expect(matchesApprovalsFilters(general, filters, now)).toBe(true)
    expect(matchesApprovalsFilters(hotel, filters, now)).toBe(true)
    expect(matchesApprovalsFilters(secondary, filters, now)).toBe(false)
  })

  it('stage filter excludes rows with unknown stage codes', () => {
    const r = row({ current_stage: { code: 'awaiting_legal_review' } })
    expect(
      matchesApprovalsFilters(r, withFilters({ stages: ['general'] }), now),
    ).toBe(false)
  })

  it('empty stages array does not filter (matches anything)', () => {
    const r = row({ current_stage: { code: 'awaiting_legal_review' } })
    expect(
      matchesApprovalsFilters(r, withFilters({ stages: [] }), now),
    ).toBe(true)
  })
})

describe('stageOf', () => {
  function r(code: string | null) {
    return {
      ...({} as BookingRow),
      current_stage: code ? { code } : null,
    } as BookingRow
  }

  it('maps the three canonical codes to enum buckets', () => {
    expect(stageOf(r('awaiting_general_approval'))).toBe('general')
    expect(stageOf(r('awaiting_secondary_approval'))).toBe('secondary')
    expect(stageOf(r('awaiting_hotel_approval'))).toBe('hotel')
  })

  it('returns null for unknown / customised codes', () => {
    expect(stageOf(r('awaiting_legal_review'))).toBeNull()
    expect(stageOf(r('confirmed'))).toBeNull()
  })

  it('returns null when current_stage is missing', () => {
    expect(stageOf(r(null))).toBeNull()
  })
})
