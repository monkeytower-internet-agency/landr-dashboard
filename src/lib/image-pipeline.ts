// image-pipeline.ts — client-side image resize + WebP compression pipeline
// for the product image manager (landr-d8rg.9).
//
// EXPORTED API (also consumed by landr-d8rg.10 product-group image upload):
//   processImage(file, options?) -> Promise<ProcessedImage>
//   MAX_OUTPUT_BYTES        — 250 KB hard cap
//   RENDITION_WIDTHS        — [800, 1600] (thumb, hero)
//   QUALITY_START / STEP    — 0.78 / step down to 0.55
//
// Pipeline:
//   1. Decode via createImageBitmap.
//   2. For each rendition width: never upscale — skip if source is narrower.
//   3. Draw to OffscreenCanvas (or HTMLCanvasElement fallback), toBlob WebP.
//   4. Quality-step from QUALITY_START toward QUALITY_MIN until ≤ MAX_OUTPUT_BYTES.
//   5. Reject with ImagePipelineError when still over cap after min quality.

export const MAX_OUTPUT_BYTES = 250 * 1024 // 250 KB
export const QUALITY_START = 0.78
export const QUALITY_STEP = 0.05
export const QUALITY_MIN = 0.55
export const RENDITION_WIDTHS = [800, 1600] as const // thumb, hero

export class ImagePipelineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImagePipelineError'
  }
}

export type Rendition = {
  blob: Blob
  width: number
  height: number
  /** "thumb" | "hero" matching the upload path suffix */
  label: 'thumb' | 'hero'
}

export type ProcessedImage = {
  /** thumb (800w) rendition — always present (source must be ≥ 1px wide) */
  thumb: Rendition
  /** hero (1600w) rendition — null when source width < 1600px (no upscale) */
  hero: Rendition | null
}

// ---------------------------------------------------------------------------
// Internal helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Draw a bitmap onto a canvas at `targetWidth` (maintaining aspect ratio,
 * never upscaling), then compress to WebP stepping quality down from
 * `qualityStart` until the blob is ≤ maxBytes or quality < qualityMin.
 *
 * Throws ImagePipelineError when no quality level yields a small enough blob.
 */
export async function compressToWebP(
  bitmap: ImageBitmap,
  targetWidth: number,
  maxBytes: number,
  qualityStart: number,
  qualityStep: number,
  qualityMin: number,
  // Injected for tests — default uses the browser canvas APIs.
  canvasFactory?: (w: number, h: number) => CanvasLike,
): Promise<Blob> {
  const srcW = bitmap.width
  const srcH = bitmap.height

  // Never upscale.
  const drawW = Math.min(targetWidth, srcW)
  const drawH = Math.round((srcH / srcW) * drawW)

  const canvas = canvasFactory
    ? canvasFactory(drawW, drawH)
    : createCanvas(drawW, drawH)

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) throw new ImagePipelineError('Could not get 2D canvas context.')

  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, drawW, drawH)

  let quality = qualityStart
  while (quality >= qualityMin - 1e-9) {
    const blob = await toBlob(canvas, quality)
    if (blob.size <= maxBytes) return blob
    quality = Math.round((quality - qualityStep) * 100) / 100
  }

  // Final attempt at qualityMin (handles floating-point undershoot).
  const finalBlob = await toBlob(canvas, qualityMin)
  if (finalBlob.size <= maxBytes) return finalBlob

  throw new ImagePipelineError(
    `Image is still ${Math.ceil(finalBlob.size / 1024)} KB after maximum compression (limit: ${Math.ceil(maxBytes / 1024)} KB). ` +
      'Please crop or resize the image and try again.',
  )
}

// ---------------------------------------------------------------------------
// Canvas abstraction (thin wrapper so tests can inject mocks)
// ---------------------------------------------------------------------------

export type CanvasLike = {
  getContext(type: '2d'): CanvasRenderingContext2D | null
  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void
}

function createCanvas(w: number, h: number): CanvasLike {
  // OffscreenCanvas is available in modern browsers and Web Workers.
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h) as unknown as CanvasLike
  }
  // Fallback to a detached HTMLCanvasElement (e.g. older browsers).
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  return el as unknown as CanvasLike
}

function toBlob(canvas: CanvasLike, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImagePipelineError('Canvas toBlob returned null.'))
        } else {
          resolve(blob)
        }
      },
      'image/webp',
      quality,
    )
  })
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Process a user-supplied image file into exactly two WebP renditions:
 *   - thumb: 800 w  (hero label when source < 1600 w)
 *   - hero: 1600 w  (null when source < 1600 w — never upscale)
 *
 * Rejects with ImagePipelineError on oversized output or decode failure.
 */
export async function processImage(
  file: File,
  // Injected in tests.
  options?: {
    canvasFactory?: (w: number, h: number) => CanvasLike
    maxBytes?: number
    qualityStart?: number
    qualityStep?: number
    qualityMin?: number
  },
): Promise<ProcessedImage> {
  const maxBytes = options?.maxBytes ?? MAX_OUTPUT_BYTES
  const qualityStart = options?.qualityStart ?? QUALITY_START
  const qualityStep = options?.qualityStep ?? QUALITY_STEP
  const qualityMin = options?.qualityMin ?? QUALITY_MIN
  const cf = options?.canvasFactory

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImagePipelineError(
      'Could not decode image. Please upload a valid JPEG, PNG, WebP, or HEIC file.',
    )
  }

  const thumbBlob = await compressToWebP(
    bitmap,
    RENDITION_WIDTHS[0],
    maxBytes,
    qualityStart,
    qualityStep,
    qualityMin,
    cf,
  )

  const thumb: Rendition = {
    blob: thumbBlob,
    width: Math.min(RENDITION_WIDTHS[0], bitmap.width),
    height: Math.round(
      (bitmap.height / bitmap.width) * Math.min(RENDITION_WIDTHS[0], bitmap.width),
    ),
    label: 'thumb',
  }

  let hero: Rendition | null = null
  if (bitmap.width >= RENDITION_WIDTHS[1]) {
    const heroBlob = await compressToWebP(
      bitmap,
      RENDITION_WIDTHS[1],
      maxBytes,
      qualityStart,
      qualityStep,
      qualityMin,
      cf,
    )
    hero = {
      blob: heroBlob,
      width: RENDITION_WIDTHS[1],
      height: Math.round((bitmap.height / bitmap.width) * RENDITION_WIDTHS[1]),
      label: 'hero',
    }
  }

  bitmap.close()

  return { thumb, hero }
}
