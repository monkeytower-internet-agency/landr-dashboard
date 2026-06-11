// Unit tests for branding-color.ts (landr-v9e4.9 — cheap coverage for
// extracted WCAG color math functions).

import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  deriveDark,
  normaliseHex,
  relativeLuminance,
} from './branding-color'

// ---------------------------------------------------------------------------
// normaliseHex

describe('normaliseHex', () => {
  it('normalises lowercase hex without hash', () => {
    expect(normaliseHex('ff8800')).toBe('#ff8800')
  })

  it('normalises uppercase hex with hash', () => {
    expect(normaliseHex('#FF8800')).toBe('#ff8800')
  })

  it('returns null for 3-char shorthand', () => {
    expect(normaliseHex('f80')).toBeNull()
  })

  it('returns null for invalid hex', () => {
    expect(normaliseHex('gggggg')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normaliseHex('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// relativeLuminance

describe('relativeLuminance', () => {
  it('returns 0 for pure black', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
  })

  it('returns 1 for pure white', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('returns a value between 0 and 1 for mid-grey', () => {
    const lum = relativeLuminance('#808080')
    expect(lum).toBeGreaterThan(0)
    expect(lum).toBeLessThan(1)
  })
})

// ---------------------------------------------------------------------------
// contrastRatio

describe('contrastRatio', () => {
  it('black on white contrast is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('white on white contrast is 1:1', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('is symmetric (order does not matter)', () => {
    const a = contrastRatio('#ff0000', '#ffffff')
    const b = contrastRatio('#ffffff', '#ff0000')
    expect(a).toBeCloseTo(b, 5)
  })

  it('returns a value >= 1 always', () => {
    expect(contrastRatio('#101010', '#2563eb')).toBeGreaterThanOrEqual(1)
  })

  it('blue on white passes WCAG AA large-text (>=3)', () => {
    // #2563eb on white is well-known to pass WCAG AA (large text)
    expect(contrastRatio('#2563eb', '#ffffff')).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// deriveDark

describe('deriveDark', () => {
  it('inverts pure black to white', () => {
    expect(deriveDark('#000000')).toBe('#ffffff')
  })

  it('inverts pure white to black', () => {
    expect(deriveDark('#ffffff')).toBe('#000000')
  })

  it('returns a fallback for an invalid hex (background mode)', () => {
    expect(deriveDark('invalid', true)).toBe('#1a1a1a')
  })

  it('returns a fallback for an invalid hex (non-background)', () => {
    expect(deriveDark('invalid', false)).toBe('#e5e5e5')
  })

  it('produces a valid 7-char hex output', () => {
    const result = deriveDark('#2563eb')
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })
})
