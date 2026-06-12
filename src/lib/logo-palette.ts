// landr-sl7k — extract a colour palette from an operator's uploaded logo so the
// branding form can suggest theme colours. The DOM/canvas/CORS interaction
// lives here (behind a single async function) so the component stays thin and
// the math in branding-color.ts stays pure. Tests mock this module.

import { Vibrant } from 'node-vibrant/browser'

import { paletteToTheme, type LogoPalette, type SuggestedTheme } from './branding-color'

export class LogoPaletteError extends Error {
  constructor(message = "Couldn't read the logo's colours") {
    super(message)
    this.name = 'LogoPaletteError'
  }
}

/**
 * Load an image cross-origin and confirm it's actually readable: draw it onto a
 * canvas and try to read a pixel back. A tainted (CORS-blocked) canvas throws on
 * getImageData — we surface that as a LogoPaletteError so the caller can show
 * the "set them manually" hint instead of silently doing nothing.
 */
function loadReadableImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, img.naturalWidth || 1)
        canvas.height = Math.max(1, img.naturalHeight || 1)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new LogoPaletteError())
          return
        }
        ctx.drawImage(img, 0, 0)
        // Throws a SecurityError if the canvas is tainted (CORS).
        ctx.getImageData(0, 0, 1, 1)
        resolve(img)
      } catch {
        reject(new LogoPaletteError())
      }
    }
    img.onerror = () => reject(new LogoPaletteError())
    img.src = url
  })
}

/**
 * Extract a suggested theme (brand / accent / background) from a logo URL.
 * Rejects with a LogoPaletteError if the logo can't be loaded or its canvas is
 * tainted by CORS.
 */
export async function suggestThemeFromLogo(url: string): Promise<SuggestedTheme> {
  const img = await loadReadableImage(url)
  let palette: LogoPalette
  try {
    palette = (await Vibrant.from(img).getPalette()) as LogoPalette
  } catch {
    throw new LogoPaletteError()
  }
  return paletteToTheme(palette)
}
