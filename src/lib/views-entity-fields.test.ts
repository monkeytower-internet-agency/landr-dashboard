// landr-lx7s — guards against the duplicate-entry regression that bit
// BOOKING_FIELDS after a botched rebase (customer_last_name and
// date_range_end each appearing twice). Duplicate keys triggered React
// duplicate-key warnings in the field picker and (silently) made `findField`
// non-deterministic. A simple uniqueness assertion is enough to catch it.

import { describe, expect, it } from 'vitest'

import { BOOKING_FIELDS, fieldsFor } from './views-entity-fields'

describe('BOOKING_FIELDS (landr-lx7s)', () => {
  it('has no duplicate field keys', () => {
    const keys = BOOKING_FIELDS.map((f) => f.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('fieldsFor("booking") returns BOOKING_FIELDS', () => {
    expect(fieldsFor('booking')).toBe(BOOKING_FIELDS)
  })
})
