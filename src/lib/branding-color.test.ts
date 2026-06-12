// Unit tests for branding-color.ts (landr-v9e4.9 — cheap coverage for
// extracted WCAG color math functions).

import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  deriveDark,
  hexToHsl,
  hslToHex,
  normaliseHex,
  paletteToTheme,
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
// hexToHsl / hslToHex round-trip (landr-sl7k)

describe('hexToHsl / hslToHex', () => {
  it('returns null for invalid hex', () => {
    expect(hexToHsl('nope')).toBeNull()
  })

  it('pure red has hue 0, full saturation, mid lightness', () => {
    const hsl = hexToHsl('#ff0000')!
    expect(hsl.h).toBeCloseTo(0, 1)
    expect(hsl.s).toBeCloseTo(1, 2)
    expect(hsl.l).toBeCloseTo(0.5, 2)
  })

  it('blue #2563eb has a blue-family hue (~210–230°)', () => {
    const hsl = hexToHsl('#2563eb')!
    expect(hsl.h).toBeGreaterThan(205)
    expect(hsl.h).toBeLessThan(235)
  })

  it('greys have zero saturation', () => {
    expect(hexToHsl('#808080')!.s).toBeCloseTo(0, 2)
  })

  it('round-trips a handful of colours back to the same hex', () => {
    for (const hex of ['#2563eb', '#ff8800', '#101010', '#3ab54a', '#ffffff']) {
      const back = hslToHex(hexToHsl(hex)!)
      expect(back).toBe(hex)
    }
  })

  it('hslToHex clamps out-of-range hue/lightness', () => {
    expect(hslToHex({ h: 720, s: 0, l: 2 })).toBe('#ffffff')
    expect(hslToHex({ h: -120, s: 0, l: -1 })).toBe('#000000')
  })
})

// ---------------------------------------------------------------------------
// deriveDark — hue-preserving (landr-sl7k)

describe('deriveDark', () => {
  it('keeps a blue accent BLUE (not orange) — the core regression', () => {
    // The old per-channel invert turned #2563eb into orange #da9c14.
    // Hue-preserving derivation must keep it in the blue family.
    const dark = deriveDark('#2563eb', 'accent')
    const hsl = hexToHsl(dark)!
    expect(hsl.h).toBeGreaterThan(200)
    expect(hsl.h).toBeLessThan(240)
    // Definitely not orange (orange hue ≈ 30°).
    expect(hsl.h).not.toBeCloseTo(40, 0)
  })

  it('keeps a vibrant accent essentially as-is (hue + roughly its lightness)', () => {
    const src = hexToHsl('#2563eb')!
    const dark = hexToHsl(deriveDark('#2563eb', 'accent'))!
    expect(dark.h).toBeCloseTo(src.h, 0)
    // Accent that already pops is left at its own lightness.
    expect(dark.l).toBeCloseTo(src.l, 1)
  })

  it('lifts a very dark accent so it stays visible on a dark canvas', () => {
    const dark = hexToHsl(deriveDark('#0a1a40', 'accent'))!
    expect(dark.l).toBeGreaterThan(0.35)
  })

  it('brand: dark text becomes light text, hue preserved', () => {
    // A dark navy brand → light navy text for a dark canvas.
    const src = hexToHsl('#13294b')!
    const dark = hexToHsl(deriveDark('#13294b', 'brand'))!
    expect(dark.h).toBeCloseTo(src.h, 0)
    expect(dark.l).toBeGreaterThan(0.8)
  })

  it('background: white collapses to near-black, coloured bg keeps hue', () => {
    const white = hexToHsl(deriveDark('#ffffff', 'background'))!
    expect(white.l).toBeLessThan(0.12)
    const tinted = hexToHsl(deriveDark('#eef4ff', 'background'))!
    // A bluish light background derives to a dark bluish canvas, not grey.
    expect(tinted.s).toBeGreaterThan(0.1)
    expect(tinted.l).toBeLessThan(0.2)
  })

  it('returns a fallback for an invalid hex (background)', () => {
    expect(deriveDark('invalid', 'background')).toBe('#1a1a1a')
  })

  it('returns a fallback for an invalid hex (non-background)', () => {
    expect(deriveDark('invalid', 'accent')).toBe('#e5e5e5')
  })

  it('produces a valid 7-char hex output', () => {
    expect(deriveDark('#2563eb')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

// ---------------------------------------------------------------------------
// paletteToTheme (landr-sl7k)

describe('paletteToTheme', () => {
  it('maps Vibrant→accent, DarkVibrant→brand, LightMuted→background', () => {
    const theme = paletteToTheme({
      Vibrant: { hex: '#2563eb' },
      DarkVibrant: { hex: '#0b1d3a' },
      LightMuted: { hex: '#f2f4f8' },
    })
    expect(theme.accent).toBe('#2563eb')
    expect(theme.brand).toBe('#0b1d3a')
    expect(theme.background).toBe('#f2f4f8')
  })

  it('falls back to defaults when swatches are missing', () => {
    const theme = paletteToTheme({})
    expect(theme.accent).toBe('#2563eb')
    expect(theme.brand).toBe('#101010')
    expect(theme.background).toBe('#ffffff')
  })

  it('uses DarkMuted for brand when DarkVibrant is absent', () => {
    const theme = paletteToTheme({ DarkMuted: { hex: '#222831' } })
    expect(theme.brand).toBe('#222831')
  })

  it('contrast guard: darkens an illegible brand-on-background pair', () => {
    // Light brand on light background → fails; brand should fall back to #101010.
    const theme = paletteToTheme({
      DarkVibrant: { hex: '#cfd8e3' },
      LightMuted: { hex: '#ffffff' },
    })
    expect(theme.brand).toBe('#101010')
    expect(contrastRatio(theme.brand, theme.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('contrast guard: lightens background if darkening brand is not enough', () => {
    const theme = paletteToTheme({
      DarkVibrant: { hex: '#101010' },
      LightMuted: { hex: '#0a0a0a' },
    })
    expect(theme.background).toBe('#ffffff')
    expect(contrastRatio(theme.brand, theme.background)).toBeGreaterThanOrEqual(4.5)
  })
})
