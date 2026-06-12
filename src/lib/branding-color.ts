// Extracted from BrandingSettings.tsx (landr-v9e4.9 — pure-helper extraction).
// Pure color math functions: relativeLuminance, contrastRatio, deriveDark,
// hex<->HSL helpers, and the logo-palette → theme-slot mapping.
// No React / DOM dependencies — independently unit-testable.

/**
 * WCAG relative luminance (sRGB).
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio (always ≥ 1). */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ── hex ↔ HSL ────────────────────────────────────────────────────────────────
// HSL keeps hue/saturation separable from lightness, which is exactly what a
// dark-mode derivation needs: we want to move L without touching H/S (a plain
// per-channel RGB invert flips the hue to its complement — blue→orange).

export type HSL = { h: number; s: number; l: number }

/** Convert '#rrggbb' to HSL with h ∈ [0,360), s,l ∈ [0,1]. */
export function hexToHsl(hex: string): HSL | null {
  const norm = normaliseHex(hex)
  if (!norm) return null
  const r = parseInt(norm.slice(1, 3), 16) / 255
  const g = parseInt(norm.slice(3, 5), 16) / 255
  const b = parseInt(norm.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2

  let h = 0
  let s = 0
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / delta + 2
        break
      default:
        h = (r - g) / delta + 4
        break
    }
    h *= 60
  }
  return { h, s, l }
}

/** Convert HSL (h ∈ [0,360), s,l ∈ [0,1]) back to '#rrggbb'. */
export function hslToHex({ h, s, l }: HSL): string {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp01(s)
  const light = clamp01(l)

  if (sat === 0) {
    const v = Math.round(light * 255)
    const hh = v.toString(16).padStart(2, '0')
    return `#${hh}${hh}${hh}`
  }

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const hk = hue / 360
  const r = hueToRgb(p, q, hk + 1 / 3)
  const g = hueToRgb(p, q, hk)
  const b = hueToRgb(p, q, hk - 1 / 3)

  const toHex = (c: number) =>
    Math.round(clamp01(c) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Derive a dark-mode equivalent of a hex colour, **preserving hue**. Used only
 * when the operator hasn't provided explicit overrides — the widget does the
 * same thing.
 *
 * A previous implementation did a photographic-negative RGB invert
 * (`255 − channel`), which flips the *hue* to its complement — e.g. a blue
 * accent `#2563eb` came out orange `#da9c14`. That is wrong: the dark variant
 * should be the same colour family, just re-lit for a dark canvas.
 *
 * Strategy (hue + saturation kept; only lightness moves):
 *  - **background**: collapse to a dark canvas. We mirror lightness into a dark
 *    band (L_dark ≈ 1 − L_light, floored to stay near-black) so a white page
 *    becomes near-black while a coloured background keeps its hue.
 *  - **brand / text**: flip lightness toward light so dark text on a light page
 *    becomes light text on a dark page, hue intact (L_dark ≈ 1 − L_light,
 *    raised to stay readable).
 *  - **accent** (the default): keep the accent essentially as-is — brand
 *    accents are designed to pop on dark — with at most a gentle L nudge so
 *    very dark accents don't vanish on the dark canvas. Hue is never changed.
 */
export function deriveDark(
  hex: string,
  kind: 'accent' | 'brand' | 'background' = 'accent',
): string {
  const hsl = hexToHsl(hex)
  if (!hsl) {
    // Mirrors the old fallbacks for invalid input.
    return kind === 'background' ? '#1a1a1a' : '#e5e5e5'
  }

  if (kind === 'background') {
    // Map light → dark band [0.06, 0.16]. White (L≈1) → ~0.06; an already-dark
    // background stays dark. Keep hue/sat so tinted canvases stay tinted.
    const l = 0.06 + (1 - hsl.l) * 0.1
    return hslToHex({ h: hsl.h, s: hsl.s, l })
  }

  if (kind === 'brand') {
    // Flip lightness for legibility on a dark canvas, floored so it stays light
    // enough to read (≥ 0.82). Dark brand text → light brand text, hue intact.
    const l = Math.max(0.82, 1 - hsl.l)
    return hslToHex({ h: hsl.h, s: hsl.s, l })
  }

  // accent: keep as-is, only lift very dark accents a touch for visibility.
  const l = hsl.l < 0.35 ? 0.45 : hsl.l
  return hslToHex({ h: hsl.h, s: hsl.s, l })
}

// ── logo palette → theme slots ────────────────────────────────────────────────

/**
 * A minimal swatch shape — just the hex. node-vibrant's Swatch exposes more,
 * but the slot mapping only needs the colour, and this keeps the function pure
 * and trivially testable without importing node-vibrant types here.
 */
export type PaletteSwatch = { hex: string } | null | undefined

/** The subset of a node-vibrant Palette this mapping reads. */
export type LogoPalette = {
  Vibrant?: PaletteSwatch
  DarkVibrant?: PaletteSwatch
  DarkMuted?: PaletteSwatch
  LightMuted?: PaletteSwatch
  LightVibrant?: PaletteSwatch
  Muted?: PaletteSwatch
}

export type SuggestedTheme = {
  brand: string
  accent: string
  background: string
}

/** First valid hex among the given swatches, or null. */
function firstHex(...swatches: PaletteSwatch[]): string | null {
  for (const sw of swatches) {
    if (sw && typeof sw.hex === 'string') {
      const norm = normaliseHex(sw.hex)
      if (norm) return norm
    }
  }
  return null
}

/**
 * Map an extracted logo palette to the three theme slots, with a contrast
 * guard so brand-on-background stays legible.
 *
 *  - Accent     ← the most vibrant swatch (Vibrant → LightVibrant → DarkVibrant)
 *  - Brand      ← a dark, readable swatch (DarkVibrant → DarkMuted → Muted)
 *  - Background ← a light swatch (LightMuted → LightVibrant) or '#ffffff'
 *
 * Contrast guard: if brand-on-background < ~4.5, fall back the failing side
 * (brand → '#101010', else background → '#ffffff') until it passes.
 */
export function paletteToTheme(
  palette: LogoPalette,
  minContrast = 4.5,
): SuggestedTheme {
  const accent =
    firstHex(palette.Vibrant, palette.LightVibrant, palette.DarkVibrant) ??
    '#2563eb'

  let brand =
    firstHex(palette.DarkVibrant, palette.DarkMuted, palette.Muted) ?? '#101010'

  let background =
    firstHex(palette.LightMuted, palette.LightVibrant) ?? '#ffffff'

  // Contrast guard — try darkening the brand first, then lightening the bg.
  if (contrastRatio(brand, background) < minContrast) {
    brand = '#101010'
  }
  if (contrastRatio(brand, background) < minContrast) {
    background = '#ffffff'
  }

  return { brand, accent, background }
}

/** Normalise a raw string to '#rrggbb' or null. */
export function normaliseHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return null
  return `#${trimmed.toLowerCase()}`
}
