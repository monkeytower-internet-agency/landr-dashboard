/**
 * Tests for the shared currency-formatting helpers (landr-v9e4.4).
 */
import { describe, it, expect } from 'vitest'
import { formatCurrency, getCurrencyFormatter } from './format-currency'

describe('formatCurrency', () => {
  it('formats a EUR amount with the default currency', () => {
    const result = formatCurrency(42.5)
    // en-IE locale formats EUR as '€42.50'
    expect(result).toMatch(/42[.,]50/)
    expect(result).toContain('€')
  })

  it('formats a EUR amount with explicit currency', () => {
    const result = formatCurrency(100, 'EUR')
    expect(result).toMatch(/100[.,]00/)
    expect(result).toContain('€')
  })

  it('formats a GBP amount', () => {
    const result = formatCurrency(99.99, 'GBP')
    expect(result).toMatch(/99[.,]99/)
    expect(result).toContain('£')
  })

  it('returns "—" for non-finite values', () => {
    expect(formatCurrency(NaN)).toBe('—')
    expect(formatCurrency(Infinity)).toBe('—')
    expect(formatCurrency(-Infinity)).toBe('—')
  })

  it('produces the same output as getCurrencyFormatter().format() for finite values', () => {
    const amount = 1234.56
    const currency = 'EUR'
    expect(formatCurrency(amount, currency)).toBe(
      getCurrencyFormatter(currency).format(amount),
    )
  })
})

describe('getCurrencyFormatter', () => {
  it('returns a cached Intl.NumberFormat instance', () => {
    const fmt1 = getCurrencyFormatter('EUR')
    const fmt2 = getCurrencyFormatter('EUR')
    expect(fmt1).toBe(fmt2)
  })

  it('uses en-IE locale (€ symbol for EUR)', () => {
    const out = getCurrencyFormatter('EUR').format(10)
    expect(out).toContain('€')
  })

  it('defaults to EUR when currency is omitted', () => {
    const withDefault = getCurrencyFormatter()
    const withEur = getCurrencyFormatter('EUR')
    expect(withDefault).toBe(withEur)
  })
})
