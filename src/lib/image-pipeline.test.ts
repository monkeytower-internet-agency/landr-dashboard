// image-pipeline.test.ts — unit tests for the client-side compression pipeline
// (landr-d8rg.9). All canvas/createImageBitmap APIs are mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  compressToWebP,
  processImage,
  ImagePipelineError,
  MAX_OUTPUT_BYTES,
  QUALITY_START,
  QUALITY_STEP,
  QUALITY_MIN,
  RENDITION_WIDTHS,
  type CanvasLike,
} from './image-pipeline'

// ── Canvas mock factory ──────────────────────────────────────────────────────

function makeCanvasMock(blobSize: number): CanvasLike {
  return {
    getContext: () =>
      ({
        drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
    toBlob: (cb, _type?, _quality?) => {
      cb(new Blob(['x'.repeat(blobSize)], { type: 'image/webp' }))
    },
  }
}

/** Canvas that returns progressively smaller blobs each call (simulates quality stepping). */
function makeSteppingCanvasMock(sizes: number[]): () => CanvasLike {
  let callIdx = 0
  return () => ({
    getContext: () =>
      ({
        drawImage: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
    toBlob: (cb) => {
      const size = sizes[Math.min(callIdx++, sizes.length - 1)]
      cb(new Blob(['x'.repeat(size)], { type: 'image/webp' }))
    },
  })
}

/** Minimal ImageBitmap-like object for tests. */
function makeBitmap(width: number, height: number): ImageBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap
}

// ── compressToWebP ──────────────────────────────────────────────────────────

describe('compressToWebP', () => {
  it('returns the blob when it fits within maxBytes on first try', async () => {
    const blob = await compressToWebP(
      makeBitmap(1000, 500),
      800,
      MAX_OUTPUT_BYTES,
      QUALITY_START,
      QUALITY_STEP,
      QUALITY_MIN,
      (_w, _h) => makeCanvasMock(1024), // 1 KB — fits
    )
    expect(blob.size).toBe(1024)
  })

  it('never upscales: draws at source width when source < targetWidth', async () => {
    const drawImageSpy = vi.fn()
    const canvas: CanvasLike = {
      getContext: () =>
        ({ drawImage: drawImageSpy }) as unknown as CanvasRenderingContext2D,
      toBlob: (cb) => cb(new Blob(['a'], { type: 'image/webp' })),
    }
    await compressToWebP(
      makeBitmap(400, 300), // source 400 px wide
      800, // target 800 — should draw at 400 instead
      MAX_OUTPUT_BYTES,
      QUALITY_START,
      QUALITY_STEP,
      QUALITY_MIN,
      () => canvas,
    )
    // drawImage called with drawW=400, drawH=300
    expect(drawImageSpy).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 300)
  })

  it('steps down quality until blob fits', async () => {
    // First blob too big (300 KB), second fits (200 KB)
    const sizes = [300 * 1024, 200 * 1024]
    const factory = makeSteppingCanvasMock(sizes)

    const blob = await compressToWebP(
      makeBitmap(1600, 900),
      800,
      MAX_OUTPUT_BYTES,
      QUALITY_START,
      QUALITY_STEP,
      QUALITY_MIN,
      factory,
    )
    expect(blob.size).toBe(200 * 1024)
  })

  it('throws ImagePipelineError when still over cap after quality min', async () => {
    // Always 300 KB — never fits
    await expect(
      compressToWebP(
        makeBitmap(1600, 900),
        800,
        MAX_OUTPUT_BYTES,
        QUALITY_START,
        QUALITY_STEP,
        QUALITY_MIN,
        (_w, _h) => makeCanvasMock(300 * 1024),
      ),
    ).rejects.toThrow(ImagePipelineError)
  })

  it('throws with a KB-mentioning message when over cap', async () => {
    await expect(
      compressToWebP(
        makeBitmap(1600, 900),
        800,
        MAX_OUTPUT_BYTES,
        QUALITY_START,
        QUALITY_STEP,
        QUALITY_MIN,
        (_w, _h) => makeCanvasMock(300 * 1024),
      ),
    ).rejects.toThrow(/KB/)
  })
})

// ── processImage ─────────────────────────────────────────────────────────────

describe('processImage', () => {
  let origCreateImageBitmap: typeof createImageBitmap

  beforeEach(() => {
    origCreateImageBitmap = globalThis.createImageBitmap
  })

  afterEach(() => {
    globalThis.createImageBitmap = origCreateImageBitmap
  })

  it('produces thumb rendition for a 1600x900 source', async () => {
    const bitmap = makeBitmap(1600, 900)
    globalThis.createImageBitmap = vi.fn().mockResolvedValue(bitmap)

    const { thumb, hero } = await processImage(new File([], 'test.jpg'), {
      canvasFactory: (_w, _h) => makeCanvasMock(1024),
    })

    expect(thumb.label).toBe('thumb')
    expect(thumb.width).toBe(RENDITION_WIDTHS[0]) // 800
    expect(hero).not.toBeNull()
    expect(hero!.label).toBe('hero')
    expect(hero!.width).toBe(RENDITION_WIDTHS[1]) // 1600
  })

  it('produces no hero rendition when source < 1600px (no upscale)', async () => {
    const bitmap = makeBitmap(800, 600) // exactly thumb width
    globalThis.createImageBitmap = vi.fn().mockResolvedValue(bitmap)

    const { thumb, hero } = await processImage(new File([], 'small.jpg'), {
      canvasFactory: (_w, _h) => makeCanvasMock(1024),
    })

    expect(thumb.label).toBe('thumb')
    expect(hero).toBeNull()
  })

  it('rejects with ImagePipelineError when blob exceeds limit', async () => {
    const bitmap = makeBitmap(1600, 900)
    globalThis.createImageBitmap = vi.fn().mockResolvedValue(bitmap)

    await expect(
      processImage(new File([], 'big.jpg'), {
        canvasFactory: (_w, _h) => makeCanvasMock(300 * 1024), // always 300 KB
      }),
    ).rejects.toThrow(ImagePipelineError)
  })

  it('rejects with ImagePipelineError when createImageBitmap fails', async () => {
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('bad'))

    await expect(
      processImage(new File([], 'corrupt.xyz')),
    ).rejects.toThrow(ImagePipelineError)
  })

  it('closes the bitmap after processing', async () => {
    const bitmap = makeBitmap(1600, 900)
    const closeSpy = vi.fn()
    bitmap.close = closeSpy
    globalThis.createImageBitmap = vi.fn().mockResolvedValue(bitmap)

    await processImage(new File([], 'test.jpg'), {
      canvasFactory: (_w, _h) => makeCanvasMock(1024),
    })

    expect(closeSpy).toHaveBeenCalledOnce()
  })
})
