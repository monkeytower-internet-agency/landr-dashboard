/**
 * ProductGroupManager tests — CRUD + cover image (upload/replace/remove)
 * coverage for the per-operator `product_groups` editor.
 *
 * landr-19m, landr-d8rg.10, landr-fqni.
 */
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Fixtures ──────────────────────────────────────────────────────────────────

type GroupFixture = {
  id: string
  operator_id: string
  slug: string
  name: string
  name_localized: Record<string, string> | null
  description: string | null
  description_localized: Record<string, string> | null
  parent_id: string | null
  sort_order: number
  active: boolean
  // landr-fqni: storage path (not public URL)
  image_path: string | null
  created_at: string
  updated_at: string
}

// ── Module mocks ──────────────────────────────────────────────────────────────

const { mock } = vi.hoisted(() => {
  const state = {
    groups: [] as GroupFixture[],
    lastCreate: null as Record<string, unknown> | null,
    lastPatch: null as { id: string; payload: Record<string, unknown> } | null,
    lastDelete: null as string | null,
    supabaseUpdates: [] as {
      table: string
      id: string
      payload: Record<string, unknown>
    }[],
    storageUploaded: [] as string[],
    storageRemoved: [] as string[],
  }
  return { mock: { state } }
})

vi.mock('@/lib/productGroups', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/productGroups')>()
  return {
    ...actual,
    fetchProductGroupsFull: vi.fn(async () => mock.state.groups),
    createProductGroup: vi.fn(
      async (_opId: string, body: Record<string, unknown>) => {
        mock.state.lastCreate = body
        const row: GroupFixture = {
          id: `pg-${mock.state.groups.length + 1}`,
          operator_id: 'op-1',
          slug: body.slug as string,
          name: body.name as string,
          name_localized: null,
          description: null,
          description_localized: null,
          parent_id: null,
          sort_order: (body.sort_order as number) ?? 0,
          active: true,
          image_path: null,
          created_at: '2026-05-21T12:00:00Z',
          updated_at: '2026-05-21T12:00:00Z',
        }
        mock.state.groups = [...mock.state.groups, row]
        return row
      },
    ),
    updateProductGroup: vi.fn(
      async (_opId: string, id: string, body: Record<string, unknown>) => {
        mock.state.lastPatch = { id, payload: body }
        const idx = mock.state.groups.findIndex((g) => g.id === id)
        if (idx >= 0) {
          mock.state.groups[idx] = {
            ...mock.state.groups[idx],
            ...body,
          } as GroupFixture
          return mock.state.groups[idx]
        }
        throw new Error('not found')
      },
    ),
    deleteProductGroup: vi.fn(async (_opId: string, id: string) => {
      mock.state.lastDelete = id
      mock.state.groups = mock.state.groups.filter((g) => g.id !== id)
    }),
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
    from: vi.fn((table: string) => ({
      update: vi.fn((payload: Record<string, unknown>) => ({
        eq: vi.fn((_col: string, val: string) => {
          mock.state.supabaseUpdates.push({ table, id: val, payload })
          return Promise.resolve({ error: null })
        }),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          mock.state.storageUploaded.push(path)
          return { error: null }
        }),
        remove: vi.fn(async (paths: string[]) => {
          mock.state.storageRemoved.push(...paths)
          return { error: null }
        }),
        getPublicUrl: vi.fn((path: string) => ({
          data: {
            publicUrl: `https://example.supabase.co/storage/v1/object/public/product-images/${path}`,
          },
        })),
      })),
    },
  },
}))

vi.mock('@/lib/product-images', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/product-images')>()
  return {
    ...actual,
    PRODUCT_IMAGES_BUCKET: 'product-images',
    getProductImagePublicUrl: vi.fn(
      (path: string) =>
        `https://example.supabase.co/storage/v1/object/public/product-images/${path}`,
    ),
  }
})

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: { success: [] as string[], error: [] as string[] },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => {
      toastCalls.success.push(msg)
    }),
    error: vi.fn((msg: string, _opts?: unknown) => {
      toastCalls.error.push(msg)
    }),
  },
  Toaster: () => null,
}))

import { ProductGroupManager } from './ProductGroupManager'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<GroupFixture> = {}): GroupFixture {
  return {
    id: 'pg-courses',
    operator_id: 'op-1',
    slug: 'courses',
    name: 'Courses',
    name_localized: null,
    description: null,
    description_localized: null,
    parent_id: null,
    sort_order: 10,
    active: true,
    image_path: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
    ...overrides,
  }
}

function renderManager() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProductGroupManager operatorId="op-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mock.state.groups = []
  mock.state.lastCreate = null
  mock.state.lastPatch = null
  mock.state.lastDelete = null
  mock.state.supabaseUpdates = []
  mock.state.storageUploaded = []
  mock.state.storageRemoved = []
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── CRUD tests ────────────────────────────────────────────────────────────────

describe('<ProductGroupManager>', () => {
  it('shows the empty state when no groups exist', async () => {
    mock.state.groups = []
    renderManager()
    await screen.findByText(/no groups yet/i)
  })

  it('renders existing groups fetched from the API', async () => {
    mock.state.groups = [
      makeGroup(),
      makeGroup({ id: 'pg-specialty', slug: 'specialty', name: 'Specialty' }),
    ]
    renderManager()
    await screen.findByText('Courses')
    expect(screen.getByText('Specialty')).toBeInTheDocument()
  })

  it('creates a new group via the add form (slug auto-derived from name)', async () => {
    const user = userEvent.setup()
    renderManager()

    await screen.findByText(/no groups yet/i)
    const addForm = screen.getByRole('form', { name: /add group/i })
    await user.type(within(addForm).getByLabelText(/^Name$/i), 'Guided Days')
    await user.click(within(addForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastCreate).toMatchObject({
        name: 'Guided Days',
        slug: 'guided-days',
      })
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('renames an existing group via the inline edit form', async () => {
    mock.state.groups = [makeGroup()]
    const user = userEvent.setup()
    renderManager()

    await screen.findByText('Courses')
    await user.click(
      screen.getByRole('button', { name: /Edit group — Courses/i }),
    )

    const editForm = await screen.findByRole('form', { name: /rename group/i })
    const nameInput = within(editForm).getByLabelText(
      /^Name$/i,
    ) as HTMLInputElement
    expect(nameInput.value).toBe('Courses')

    await user.clear(nameInput)
    await user.type(nameInput, 'Liveaboard Courses')
    await user.click(within(editForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastPatch).not.toBeNull()
    })
    expect(mock.state.lastPatch?.payload).toMatchObject({
      name: 'Liveaboard Courses',
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  // landr-14s4 — locale-tabbed name + tagline. The PATCH must carry the
  // *_localized jsonb with empty overrides STRIPPED so the widget fallback
  // keeps working.
  it('patches name_localized + description_localized via the locale tabs', async () => {
    mock.state.groups = [
      makeGroup({
        name: 'Courses',
        // Seed an existing DE name override; the edit must preserve it.
        name_localized: { de: 'Kurse' },
        description: 'All our courses',
        description_localized: null,
      }),
    ]
    const user = userEvent.setup()
    renderManager()

    await screen.findByText('Courses')
    await user.click(
      screen.getByRole('button', { name: /Edit group — Courses/i }),
    )
    const editForm = await screen.findByRole('form', { name: /rename group/i })

    // The DE name tab already shows the override badge (seeded value).
    expect(
      within(editForm).getByTestId('locale-override-badge-de'),
    ).toBeInTheDocument()

    // Add a DE override for the tagline (description). There are two locale
    // tab strips (name, tagline); target the tagline one via its DE tab —
    // the second locale-tab-de in document order.
    const deTabs = within(editForm).getAllByTestId('locale-tab-de')
    await user.click(deTabs[1])
    const taglineDe = within(editForm).getByTestId('locale-input-de')
    await user.type(taglineDe, 'Alle unsere Kurse')

    await user.click(within(editForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastPatch).not.toBeNull()
    })
    // name_localized preserved (jsonb merge keeps the seeded DE name),
    // description_localized gains the new DE tagline. Both base fields ride
    // along unchanged.
    expect(mock.state.lastPatch?.payload).toMatchObject({
      name: 'Courses',
      name_localized: { de: 'Kurse' },
      description: 'All our courses',
      description_localized: { de: 'Alle unsere Kurse' },
    })
  })

  it('strips an emptied tagline override to null on PATCH', async () => {
    mock.state.groups = [
      makeGroup({
        name: 'Courses',
        name_localized: null,
        description: 'All our courses',
        description_localized: { de: 'Alle unsere Kurse' },
      }),
    ]
    const user = userEvent.setup()
    renderManager()

    await screen.findByText('Courses')
    await user.click(
      screen.getByRole('button', { name: /Edit group — Courses/i }),
    )
    const editForm = await screen.findByRole('form', { name: /rename group/i })

    // Open the tagline DE tab and clear the existing override.
    const deTabs = within(editForm).getAllByTestId('locale-tab-de')
    await user.click(deTabs[1])
    await user.clear(within(editForm).getByTestId('locale-input-de'))

    await user.click(within(editForm).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mock.state.lastPatch).not.toBeNull()
    })
    // Emptied override → null, never an empty-string key.
    expect(mock.state.lastPatch?.payload).toMatchObject({
      description_localized: null,
    })
  })

  it('deletes a group when the trash button is confirmed', async () => {
    mock.state.groups = [makeGroup()]
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderManager()

    await screen.findByText('Courses')
    await user.click(
      screen.getByRole('button', { name: /Delete group — Courses/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastDelete).toBe('pg-courses')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
    confirmSpy.mockRestore()
  })
})

// ── Cover image tests (landr-d8rg.10, landr-fqni) ────────────────────────────

describe('<ProductGroupManager> — cover image upload (happy path)', () => {
  it('calls processImage, uploads hero blob to groups path, PATCHes image_path (storage path, not URL), toasts success', async () => {
    mock.state.groups = [makeGroup()]
    const { processImage } = await import('@/lib/image-pipeline')

    renderManager()
    await screen.findByText('Courses')

    const fileInput = screen.getByTestId('cover-file-input-pg-courses')
    const file = new File(['img'], 'cover.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(processImage).toHaveBeenCalledWith(file)
    })

    // Storage upload uses the groups path.
    await waitFor(() => {
      expect(
        mock.state.storageUploaded.some((p) =>
          p.includes('/groups/pg-courses/'),
        ),
      ).toBe(true)
    })

    // Supabase PATCH product_groups.image_path with a storage path string
    // (NOT a full public URL — landr-fqni).
    await waitFor(() => {
      expect(
        mock.state.supabaseUpdates.some(
          (u) =>
            u.table === 'product_groups' &&
            u.id === 'pg-courses' &&
            typeof u.payload['image_path'] === 'string' &&
            !u.payload['image_path'].startsWith('http'),
        ),
      ).toBe(true)
    })

    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })
})

describe('<ProductGroupManager> — cover image replace', () => {
  it('shows Replace button when image_path is set; Replace re-uploads and re-PATCHes', async () => {
    mock.state.groups = [
      makeGroup({
        // landr-fqni: image_path is the storage path, not a public URL.
        image_path: 'op-1/groups/pg-courses/old.webp',
      }),
    ]
    const { processImage } = await import('@/lib/image-pipeline')

    renderManager()

    const replaceBtn = await screen.findByTestId('cover-replace-pg-courses')
    expect(replaceBtn).toBeInTheDocument()

    // Trigger file selection via the hidden input.
    const fileInput = screen.getByTestId('cover-file-input-pg-courses')
    const file = new File(['img2'], 'new-cover.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(processImage).toHaveBeenCalledWith(file)
    })

    await waitFor(() => {
      expect(
        mock.state.storageUploaded.some((p) =>
          p.includes('/groups/pg-courses/'),
        ),
      ).toBe(true)
    })

    await waitFor(() => {
      expect(
        mock.state.supabaseUpdates.some(
          (u) => u.table === 'product_groups' && u.id === 'pg-courses',
        ),
      ).toBe(true)
    })
  })
})

describe('<ProductGroupManager> — cover image remove', () => {
  it('PATCHes image_path to null and deletes storage object (path directly, not parsed from URL), then toasts success', async () => {
    // landr-fqni: image_path is the storage path (not a public URL).
    const coverPath = 'op-1/groups/pg-courses/old.webp'
    mock.state.groups = [makeGroup({ image_path: coverPath })]

    renderManager()

    const removeBtn = await screen.findByTestId('cover-remove-pg-courses')
    await userEvent.click(removeBtn)

    // PATCH image_path → null.
    await waitFor(() => {
      expect(
        mock.state.supabaseUpdates.some(
          (u) =>
            u.table === 'product_groups' &&
            u.id === 'pg-courses' &&
            u.payload['image_path'] === null,
        ),
      ).toBe(true)
    })

    // Storage object deleted using the path directly (no URL parsing needed).
    await waitFor(() => {
      expect(
        mock.state.storageRemoved.some((p) =>
          p.includes('op-1/groups/pg-courses/old.webp'),
        ),
      ).toBe(true)
    })

    // Success toast.
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })
})

describe('<ProductGroupManager> — cover image upload failure toast', () => {
  it('shows error toast when processImage throws; storage and PATCH are not called', async () => {
    mock.state.groups = [makeGroup()]
    const { processImage, ImagePipelineError } = await import(
      '@/lib/image-pipeline'
    )
    vi.mocked(processImage).mockRejectedValueOnce(
      new ImagePipelineError(
        'Image is still 300 KB after maximum compression (limit: 250 KB).',
      ),
    )

    renderManager()
    await screen.findByText('Courses')

    const fileInput = screen.getByTestId('cover-file-input-pg-courses')
    const file = new File(['x'.repeat(400 * 1024)], 'big.jpg', {
      type: 'image/jpeg',
    })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(processImage).toHaveBeenCalledWith(file)
    })

    await waitFor(() => {
      expect(toastCalls.error.length).toBeGreaterThan(0)
    })

    // Storage and PATCH must NOT have been called.
    expect(mock.state.storageUploaded).toHaveLength(0)
    expect(mock.state.supabaseUpdates).toHaveLength(0)
  })
})
