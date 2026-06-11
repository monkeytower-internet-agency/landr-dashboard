/**
 * Shared currency-formatting helpers (landr-v9e4.4).
 *
 * Single source of truth for `en-IE` currency formatting across the
 * dashboard. All call sites that previously had their own
 * `Intl.NumberFormat('en-IE', { style: 'currency', currency })` cache
 * now go through here.
 */

const _cache = new Map<string, Intl.NumberFormat>()

/**
 * Returns a cached `Intl.NumberFormat` for the given currency code.
 * Useful when a call site needs to call `.format()` multiple times on the
 * same formatter (e.g. a table cell that renders several amounts).
 */
export function getCurrencyFormatter(currency?: string): Intl.NumberFormat {
  const key = currency || 'EUR'
  let fmt = _cache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: key })
    _cache.set(key, fmt)
  }
  return fmt
}

/**
 * Format a numeric amount as a localised currency string (en-IE locale).
 * Returns `'—'` when the value is not a finite number.
 *
 * @param amount   Numeric amount to format.
 * @param currency ISO 4217 currency code (default `'EUR'`).
 */
export function formatCurrency(amount: number, currency?: string): string {
  if (!Number.isFinite(amount)) return '—'
  return getCurrencyFormatter(currency).format(amount)
}
