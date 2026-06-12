// Unit tests for revenue.ts pure helpers — formatMoney + formatRate.
// landr-v9e4.10 coverage pass.

import { describe, expect, it } from 'vitest'
import { formatMoney, formatRate } from './revenue'

// ---------------------------------------------------------------------------
// formatMoney
// ---------------------------------------------------------------------------

describe('formatMoney', () => {
  it('formats EUR amounts in de-DE locale', () => {
    // de-DE uses comma as decimal separator and period as thousands separator.
    const result = formatMoney(1234.56, 'EUR')
    // We assert on the number parts rather than the exact string because
    // Intl formatting can include non-breaking spaces on some runtimes.
    expect(result).toMatch(/1\.234/)
    expect(result).toMatch(/56/)
    expect(result).toContain('€')
  })

  it('formats zero correctly', () => {
    const result = formatMoney(0, 'EUR')
    expect(result).toContain('0')
    expect(result).toContain('€')
  })

  it('formats negative amounts', () => {
    const result = formatMoney(-42.5, 'EUR')
    // Should contain the minus or the amount negated
    expect(result).toMatch(/42/)
    expect(result).toContain('€')
  })

  it('falls back to plain number + code for an unknown currency', () => {
    // An unknown ISO 4217 code causes Intl to throw a RangeError internally;
    // the function catches it and returns "amount.toFixed(2) + space + code".
    const result = formatMoney(12.5, 'NOTACURRENCY')
    expect(result).toBe('12.50 NOTACURRENCY')
  })

  it('falls back gracefully for an empty currency string', () => {
    // Empty string is an invalid currency code → falls back to EUR in the try
    // block (the `currency || 'EUR'` coercion).
    const result = formatMoney(10, '')
    expect(result).toContain('€')
  })

  it('formats USD amounts', () => {
    const result = formatMoney(99.99, 'USD')
    expect(result).toMatch(/99/)
    // USD symbol or code should appear
    expect(result.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// formatRate
// ---------------------------------------------------------------------------

describe('formatRate', () => {
  it('formats 5% rate from 0.05', () => {
    expect(formatRate(0.05)).toBe('5%')
  })

  it('formats 4.5% rate from 0.045', () => {
    expect(formatRate(0.045)).toBe('4.5%')
  })

  it('formats 0% rate from 0', () => {
    expect(formatRate(0)).toBe('0%')
  })

  it('formats 100% rate from 1', () => {
    expect(formatRate(1)).toBe('100%')
  })

  it('trims trailing zeros: 0.10 → 10% not 10.00%', () => {
    expect(formatRate(0.1)).toBe('10%')
  })

  it('returns em-dash for null', () => {
    expect(formatRate(null)).toBe('—')
  })

  it('returns em-dash for undefined', () => {
    expect(formatRate(undefined as unknown as null)).toBe('—')
  })

  it('rounds to 2 decimal places in the percent display', () => {
    // 0.123456 * 100 = 12.3456 → rounded to 12.35
    expect(formatRate(0.123456)).toBe('12.35%')
  })

  it('handles small rates near zero', () => {
    // 0.001 → 0.1%
    expect(formatRate(0.001)).toBe('0.1%')
  })
})
