// landr-jb1k — lazy font loader for the Settings → Booking widget title-style
// preview.
//
// The five showcase fonts are self-hosted via @fontsource (GDPR — no Google
// Fonts CDN, no third-party request). They are NOT in the global stylesheet:
// the rest of the dashboard must not pay their download/parse cost. Instead
// `loadWidgetFonts()` dynamically imports the latin CSS only when the Booking
// widget section mounts, so the @font-face rules (and the woff2 files Vite
// fingerprints) land in a code-split chunk fetched on demand.
//
// Latin 400 + 700 each, except Bebas Neue (a single-weight display face that
// only ships 400).

export type WidgetFont =
  | 'system'
  | 'playfair'
  | 'montserrat'
  | 'bebas'
  | 'space-grotesk'
  | 'caveat'

// CSS font-family stacks. 'system' uses the platform UI stack (no download).
// The named families match @fontsource's registered font-family values.
export const WIDGET_FONT_STACKS: Record<WidgetFont, string> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  playfair: '"Playfair Display", ui-serif, Georgia, serif',
  montserrat: '"Montserrat", ui-sans-serif, system-ui, sans-serif',
  bebas: '"Bebas Neue", ui-sans-serif, system-ui, sans-serif',
  'space-grotesk': '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  caveat: '"Caveat", ui-serif, cursive',
}

let loaded: Promise<void> | null = null

/**
 * Dynamically import the latin font CSS for all showcase fonts. Idempotent —
 * the first call kicks off the imports; subsequent calls await the same
 * promise. Safe to call on every mount.
 */
export function loadWidgetFonts(): Promise<void> {
  if (loaded) return loaded
  loaded = Promise.all([
    import('@fontsource/playfair-display/latin-400.css'),
    import('@fontsource/playfair-display/latin-700.css'),
    import('@fontsource/montserrat/latin-400.css'),
    import('@fontsource/montserrat/latin-700.css'),
    // Bebas Neue is a single-weight display face (only 400 ships).
    import('@fontsource/bebas-neue/latin-400.css'),
    import('@fontsource/space-grotesk/latin-400.css'),
    import('@fontsource/space-grotesk/latin-700.css'),
    import('@fontsource/caveat/latin-400.css'),
    import('@fontsource/caveat/latin-700.css'),
  ]).then(() => undefined)
  return loaded
}
