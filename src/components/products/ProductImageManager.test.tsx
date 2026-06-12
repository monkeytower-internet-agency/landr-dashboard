// ProductImageManager.test.tsx — component tests (landr-d8rg.9)
//
// Covers:
//   - renders existing image rows
//   - upload happy path (mocked pipeline + storage)
//   - rejects >250 KB result (ImagePipelineError)
//   - delete removes row + both storage objects
//   - reorder swaps sort_order
//   - alt text PATCH on blur

import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Fixtures ──────────────────────────────────────────────────────────────────

type ImageRow = {
  id: string
  operator_id: string
  product_id: string
  thumb_path: string
  hero_path: string
  alt: string | null
  sort_order: number
  created_at: string
}

const BASE_ROW: ImageRow = {
  id: 'img-1',
  operator_id: 'op-1',
  product_id: 'prod-1',
  thumb_path: 'op-1/products/prod-1/uuid-thumb.webp',
  hero_path: 'op-1/products/prod-1/uuid-hero.webp',
  alt: 'Mountain view',
  sort_order: 0,
  created_at: '2026-06-01T00:00:00Z',
}

const ROW_2: ImageRow = {
  ...BASE_ROW,
  id: 'img-2',
  thumb_path: 'op-1/products/prod-1/uuid2-thumb.webp',
  hero_path: 'op-1/products/prod-1/uuid2-hero.webp',
  alt: 'Valley panorama',
  sort_order: 1,
}

// ── Module mocks ──────────────────────────────────────────────────────────────

const { state } = vi.hoisted(() => {
  return {
    state: {
      rows: [] as ImageRow[],
      deleted: [] as string[],
      patched: [] as { id: string; payload: Record<string, unknown> }[],
      storageRemoved: [] as string[],
      uploadedPaths: [] as string[],
    },
  }
})

vi.mock('@/lib/product-images', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/product-images')>()
  return {
    ...actual,
    fetchProductImages: vi.fn(async () => state.rows),
    createProductImage: vi.fn(async (payload: Record<string, unknown>) => {
      const row: ImageRow = {
        id: `img-new-${Math.random()}`,
        operator_id: payload.operator_id as string,
        product_id: payload.product_id as string,
        thumb_path: payload.thumb_path as string,
        hero_path: payload.hero_path as string,
        alt: null,
        sort_order: (payload.sort_order as number) ?? 0,
        created_at: '2026-06-01T00:00:00Z',
      }
      state.rows = [...state.rows, row]
      return row
    }),
    deleteProductImage: vi.fn(async (id: string) => {
      state.deleted = [...state.deleted, id]
      state.rows = state.rows.filter((r) => r.id !== id)
    }),
    patchProductImage: vi.fn(
      async (id: string, payload: Record<string, unknown>) => {
        state.patched = [...state.patched, { id, payload }]
        const idx = state.rows.findIndex((r) => r.id === id)
        if (idx >= 0) {
          state.rows[idx] = { ...state.rows[idx], ...payload } as ImageRow
          return state.rows[idx]
        }
        throw new Error('not found')
      },
    ),
    removeProductImageStorageObjects: vi.fn(async (paths: string[]) => {
      state.storageRemoved = [...state.storageRemoved, ...paths]
    }),
    getProductImagePublicUrl: vi.fn(
      (path: string) => `https://example.com/storage/${path}`,
    ),
  }
})

vi.mock('@/lib/image-pipeline', () => ({
  processImage: vi.fn(async (_file: File) => ({
    thumb: {
      blob: new Blob(['thumb'], { type: 'image/webp' }),
      width: 800,
      height: 450,
      label: 'thumb',
    },
    hero: {
      blob: new Blob(['hero'], { type: 'image/webp' }),
      width: 1600,
      height: 900,
      label: 'hero',
    },
  })),
  ImagePipelineError: class ImagePipelineError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'ImagePipelineError'
    }
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          state.uploadedPaths = [...state.uploadedPaths, path]
          return { error: null }
        }),
        remove: vi.fn(async (paths: string[]) => {
          state.storageRemoved = [...state.storageRemoved, ...paths]
          return { error: null }
        }),
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://example.com/storage/${path}` },
        })),
      })),
    },
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { qc, Wrapper }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  state.rows = []
  state.deleted = []
  state.patched = []
  state.storageRemoved = []
  state.uploadedPaths = []
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Lazy import to get fresh module after vi.mock calls.
async function getComponent() {
  const { ProductImageManager } = await import(
    './ProductImageManager'
  )
  return ProductImageManager
}

describe('ProductImageManager — renders rows', () => {
  it('renders existing image slots', async () => {
    state.rows = [BASE_ROW, ROW_2]
    const ProductImageManager = await getComponent()
    const { Wrapper } = wrapper()

    render(
      <Wrapper>
        <ProductImageManager operatorId="op-1" productId="prod-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId(`image-slot-${BASE_ROW.id}`)).toBeInTheDocument()
      expect(screen.getByTestId(`image-slot-${ROW_2.id}`)).toBeInTheDocument()
    })

    // Counter should show 2/4
    expect(screen.getByText('2/4')).toBeInTheDocument()
  })

  it('renders save-first hint when no images', async () => {
    state.rows = []
    const ProductImageManager = await getComponent()
    const { Wrapper } = wrapper()

    render(
      <Wrapper>
        <ProductImageManager operatorId="op-1" productId="prod-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/No images yet/i),
      ).toBeInTheDocument()
    })
  })
})

describe('ProductImageManager — upload happy path', () => {
  it('calls processImage then uploads and inserts row', async () => {
    state.rows = []
    const { processImage } = await import('@/lib/image-pipeline')
    const { createProductImage } = await import('@/lib/product-images')
    const ProductImageManager = await getComponent()
    const { Wrapper } = wrapper()

    render(
      <Wrapper>
        <ProductImageManager operatorId="op-1" productId="prod-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('add-product-image-btn')).toBeInTheDocument()
    })

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(processImage).toHaveBeenCalledWith(file)
      expect(createProductImage).toHaveBeenCalledWith(
        expect.objectContaining({
          operator_id: 'op-1',
          product_id: 'prod-1',
        }),
      )
    })
  })
})

describe('ProductImageManager — reject >250 KB', () => {
  it('aborts upload when pipeline throws ImagePipelineError (createProductImage not called)', async () => {
    state.rows = []
    const { processImage, ImagePipelineError } = await import('@/lib/image-pipeline')
    const { createProductImage } = await import('@/lib/product-images')
    vi.mocked(processImage).mockRejectedValueOnce(
      new ImagePipelineError(
        'Image is still 300 KB after maximum compression (limit: 250 KB).',
      ),
    )

    const ProductImageManager = await getComponent()
    const { Wrapper } = wrapper()

    render(
      <Wrapper>
        <ProductImageManager operatorId="op-1" productId="prod-1" />
      </Wrapper>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('add-product-image-btn')).toBeInTheDocument(),
    )

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = new File(['x'.repeat(400 * 1024)], 'big.jpg', {
      type: 'image/jpeg',
    })
    fireEvent.change(fileInput, { target: { files: [file] } })

    // Wait for the mutation to settle (error path).
    await waitFor(() => {
      expect(processImage).toHaveBeenCalledWith(file)
    })
    // createProductImage must NOT be called when pipeline rejects.
    expect(createProductImage).not.toHaveBeenCalled()
  })
})

describe('ProductImageManager — delete', () => {
  it('calls deleteProductImage and removeProductImageStorageObjects', async () => {
    state.rows = [BASE_ROW]
    const { deleteProductImage } = await import('@/lib/product-images')
    const { removeProductImageStorageObjects } = await import(
      '@/lib/product-images'
    )
    const ProductImageManager = await getComponent()
    const { Wrapper } = wrapper()

    render(
      <Wrapper>
        <ProductImageManager operatorId="op-1" productId="prod-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId(`delete-image-${BASE_ROW.id}`)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByTestId(`delete-image-${BASE_ROW.id}`))

    await waitFor(() => {
      expect(deleteProductImage).toHaveBeenCalledWith(BASE_ROW.id)
      expect(removeProductImageStorageObjects).toHaveBeenCalledWith([
        BASE_ROW.thumb_path,
        BASE_ROW.hero_path,
      ])
    })
  })
})

describe('ProductImageManager — reorder', () => {
  it('swaps sort_order of adjacent images on move-up', async () => {
    state.rows = [BASE_ROW, ROW_2]
    const { patchProductImage } = await import('@/lib/product-images')
    const ProductImageManager = await getComponent()
    const { Wrapper } = wrapper()

    render(
      <Wrapper>
        <ProductImageManager operatorId="op-1" productId="prod-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId(`move-up-${ROW_2.id}`)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByTestId(`move-up-${ROW_2.id}`))

    await waitFor(() => {
      // ROW_2 (idx 1) moves up: swaps sort_order with BASE_ROW (idx 0)
      expect(patchProductImage).toHaveBeenCalledWith(
        ROW_2.id,
        expect.objectContaining({ sort_order: BASE_ROW.sort_order }),
      )
      expect(patchProductImage).toHaveBeenCalledWith(
        BASE_ROW.id,
        expect.objectContaining({ sort_order: ROW_2.sort_order }),
      )
    })
  })
})

describe('ProductImageManager — alt text patch', () => {
  it('calls patchProductImage on blur when alt text changes', async () => {
    state.rows = [{ ...BASE_ROW, alt: '' }]
    const { patchProductImage } = await import('@/lib/product-images')
    const ProductImageManager = await getComponent()
    const { Wrapper } = wrapper()

    render(
      <Wrapper>
        <ProductImageManager operatorId="op-1" productId="prod-1" />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByTestId(`image-slot-${BASE_ROW.id}`)).toBeInTheDocument()
    })

    const slot = screen.getByTestId(`image-slot-${BASE_ROW.id}`)
    const altInput = within(slot).getByRole('textbox')

    await userEvent.clear(altInput)
    await userEvent.type(altInput, 'New alt text')
    fireEvent.blur(altInput)

    await waitFor(() => {
      expect(patchProductImage).toHaveBeenCalledWith(
        BASE_ROW.id,
        expect.objectContaining({ alt: 'New alt text' }),
      )
    })
  })
})
