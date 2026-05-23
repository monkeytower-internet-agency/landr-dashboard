/**
 * Unit tests for the [landr_booking …] shortcode builder (landr-up1b).
 * The exact grammar is load-bearing — it must match the WP plugin's
 * shortcode_atts keys (operator/group/product/height/src).
 */
import { describe, expect, it } from 'vitest'
import { buildShortcode } from './shortcode'

describe('buildShortcode', () => {
  it('emits operator-only when nothing else is set', () => {
    expect(buildShortcode({ operator: 'para42' })).toBe(
      '[landr_booking operator="para42"]',
    )
  })

  it('includes a group filter', () => {
    expect(buildShortcode({ operator: 'para42', group: 'courses' })).toBe(
      '[landr_booking operator="para42" group="courses"]',
    )
  })

  it('includes a single product', () => {
    expect(
      buildShortcode({ operator: 'para42', product: 'open-water' }),
    ).toBe('[landr_booking operator="para42" product="open-water"]')
  })

  it('orders attrs operator → group → product → height → src', () => {
    expect(
      buildShortcode({
        operator: 'para42',
        group: 'courses',
        product: 'open-water',
        height: 900,
        src: 'https://preview.example/',
      }),
    ).toBe(
      '[landr_booking operator="para42" group="courses" product="open-water" height="900" src="https://preview.example"]',
    )
  })

  it('omits blank/null optional attrs', () => {
    expect(
      buildShortcode({
        operator: 'para42',
        group: '',
        product: null,
        height: '',
        src: '   ',
      }),
    ).toBe('[landr_booking operator="para42"]')
  })

  it('drops non-positive / non-numeric heights', () => {
    expect(buildShortcode({ operator: 'p', height: 0 })).toBe(
      '[landr_booking operator="p"]',
    )
    expect(buildShortcode({ operator: 'p', height: -5 })).toBe(
      '[landr_booking operator="p"]',
    )
    expect(buildShortcode({ operator: 'p', height: 'abc' })).toBe(
      '[landr_booking operator="p"]',
    )
  })

  it('coerces a numeric-string height and strips trailing slashes on src', () => {
    expect(
      buildShortcode({ operator: 'p', height: '750', src: 'https://x.io///' }),
    ).toBe('[landr_booking operator="p" height="750" src="https://x.io"]')
  })

  it('trims the operator slug', () => {
    expect(buildShortcode({ operator: '  para42  ' })).toBe(
      '[landr_booking operator="para42"]',
    )
  })
})
