/**
 * Unit tests for the [landr_booking …] shortcode builder (landr-up1b / landr-il9f.3).
 * The exact grammar is load-bearing — it must match the WP plugin's
 * shortcode_atts keys (token/group/product/height/src).
 *
 * landr-il9f.3: `operator=` replaced by `token=` (opaque widget_token).
 */
import { describe, expect, it } from 'vitest'
import { buildShortcode } from './shortcode'

describe('buildShortcode', () => {
  it('emits token-only when nothing else is set', () => {
    expect(buildShortcode({ token: 'tok_abc123' })).toBe(
      '[landr_booking token="tok_abc123"]',
    )
  })

  it('includes a group filter', () => {
    expect(buildShortcode({ token: 'tok_abc123', group: 'courses' })).toBe(
      '[landr_booking token="tok_abc123" group="courses"]',
    )
  })

  it('includes a single product', () => {
    expect(
      buildShortcode({ token: 'tok_abc123', product: 'open-water' }),
    ).toBe('[landr_booking token="tok_abc123" product="open-water"]')
  })

  it('orders attrs token → group → product → height → src', () => {
    expect(
      buildShortcode({
        token: 'tok_abc123',
        group: 'courses',
        product: 'open-water',
        height: 900,
        src: 'https://preview.example/',
      }),
    ).toBe(
      '[landr_booking token="tok_abc123" group="courses" product="open-water" height="900" src="https://preview.example"]',
    )
  })

  it('omits blank/null optional attrs', () => {
    expect(
      buildShortcode({
        token: 'tok_abc123',
        group: '',
        product: null,
        height: '',
        src: '   ',
      }),
    ).toBe('[landr_booking token="tok_abc123"]')
  })

  it('drops non-positive / non-numeric heights', () => {
    expect(buildShortcode({ token: 'tok_p', height: 0 })).toBe(
      '[landr_booking token="tok_p"]',
    )
    expect(buildShortcode({ token: 'tok_p', height: -5 })).toBe(
      '[landr_booking token="tok_p"]',
    )
    expect(buildShortcode({ token: 'tok_p', height: 'abc' })).toBe(
      '[landr_booking token="tok_p"]',
    )
  })

  it('coerces a numeric-string height and strips trailing slashes on src', () => {
    expect(
      buildShortcode({ token: 'tok_p', height: '750', src: 'https://x.io///' }),
    ).toBe('[landr_booking token="tok_p" height="750" src="https://x.io"]')
  })

  it('trims the token value', () => {
    expect(buildShortcode({ token: '  tok_abc123  ' })).toBe(
      '[landr_booking token="tok_abc123"]',
    )
  })
})
