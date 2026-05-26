/**
 * Unit tests for the [landr_booking …] shortcode builder (landr-up1b / landr-il9f.3).
 * The exact grammar is load-bearing — it must match the WP plugin's
 * shortcode_atts keys (token/group/product/height/src).
 *
 * landr-il9f.3: `operator=` replaced by `token=` (opaque widget_token).
 * landr-7zc5.4: embed-hosts config map + buildWidgetUrl tests added.
 */
import { describe, expect, it } from 'vitest'
import { buildShortcode } from './shortcode'
import {
  EMBED_ENV_HOSTS,
  EMBED_ENV_ORDER,
  buildWidgetUrl,
} from './embed-hosts'

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

// landr-7zc5.4 — embed-hosts config map
describe('EMBED_ENV_HOSTS', () => {
  it('has exactly three entries in the correct order', () => {
    expect(EMBED_ENV_ORDER).toEqual(['development', 'testing', 'live'])
  })

  it('maps development to bw-dev.landr.de', () => {
    expect(EMBED_ENV_HOSTS.development).toBe('bw-dev.landr.de')
  })

  it('maps testing to bw-staging.landr.de', () => {
    expect(EMBED_ENV_HOSTS.testing).toBe('bw-staging.landr.de')
  })

  it('maps live to bw.landr.de', () => {
    expect(EMBED_ENV_HOSTS.live).toBe('bw.landr.de')
  })
})

describe('buildWidgetUrl', () => {
  it('builds a URL for the live env with token only', () => {
    expect(buildWidgetUrl('live', 'tok_abc')).toBe(
      'https://bw.landr.de/?w=tok_abc',
    )
  })

  it('builds a URL for the development env', () => {
    expect(buildWidgetUrl('development', 'tok_abc')).toBe(
      'https://bw-dev.landr.de/?w=tok_abc',
    )
  })

  it('builds a URL for the testing env', () => {
    expect(buildWidgetUrl('testing', 'tok_abc')).toBe(
      'https://bw-staging.landr.de/?w=tok_abc',
    )
  })

  it('includes group and product params when provided', () => {
    expect(
      buildWidgetUrl('live', 'tok_abc', { group: 'courses', product: 'open-water' }),
    ).toBe('https://bw.landr.de/?w=tok_abc&group=courses&product=open-water')
  })

  it('omits null/empty group and product', () => {
    expect(buildWidgetUrl('live', 'tok_abc', { group: null, product: '' })).toBe(
      'https://bw.landr.de/?w=tok_abc',
    )
  })
})
