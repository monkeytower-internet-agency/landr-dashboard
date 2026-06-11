// Extracted from BrandingSettings.tsx (landr-v9e4.9 — pure-helper extraction).
// Pure color math functions: relativeLuminance, contrastRatio, deriveDark.
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

/**
 * Very simple heuristic: invert the lightness of a hex colour so a light
 * brand becomes a dark-mode equivalent. Used only when the operator hasn't
 * provided explicit overrides — the widget does the same thing.
 */
export function deriveDark(hex: string, isBackground = false): string {
  const norm = normaliseHex(hex)
  if (!norm) return isBackground ? '#1a1a1a' : '#e5e5e5'
  const r = parseInt(norm.slice(1, 3), 16)
  const g = parseInt(norm.slice(3, 5), 16)
  const b = parseInt(norm.slice(5, 7), 16)
  // Invert: simple 255-x per channel (photographic negative)
  const ri = 255 - r
  const gi = 255 - g
  const bi = 255 - b
  return `#${ri.toString(16).padStart(2, '0')}${gi.toString(16).padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`
}

/** Normalise a raw string to '#rrggbb' or null. */
export function normaliseHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return null
  return `#${trimmed.toLowerCase()}`
}
