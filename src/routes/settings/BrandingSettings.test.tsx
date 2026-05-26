/**
 * BrandingSettings tests (landr-s09l) — logo upload button picker fix.
 *
 * Regression tests for the double-Slot (Label asChild + Button asChild)
 * click-forwarding bug: the upload Button must programmatically click the
 * hidden file input via its ref, not rely on label→input forwarding.
 */
import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/operator', async () => {
  const mod = await vi.importActual<typeof import('@/lib/operator')>(
    '@/lib/operator',
  )
  return {
    ...mod,
    useOperator: () => ({
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
      switchOperator: () => {},
      refreshOperators: () => {},
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

const { fetchOperatorMock, patchOperatorMock } = vi.hoisted(() => ({
  fetchOperatorMock: vi.fn(),
  patchOperatorMock: vi.fn(),
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: (...args: unknown[]) => fetchOperatorMock(...args),
    patchOperator: (...args: unknown[]) => patchOperatorMock(...args),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        upload: vi.fn().mockResolvedValue({ data: { path: 'op-1/logo-1.png' }, error: null }),
        getPublicUrl: () => ({
          data: { publicUrl: 'https://cdn.example.com/op-1/logo-1.png' },
        }),
      }),
    },
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock page-title to avoid router dep in PageTitle
vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeOperator(overrides = {}) {
  return {
    id: 'op-1',
    name: 'Para42',
    slug: 'para42',
    logo_url: null,
    primary_color: null,
    subscription_package: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

import { BrandingSettings } from './BrandingSettings'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchOperatorMock.mockResolvedValue(makeOperator())
  patchOperatorMock.mockResolvedValue(makeOperator())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BrandingSettings — logo upload button (landr-s09l)', () => {
  it('renders the hidden file input with the correct accept types', async () => {
    render(<BrandingSettings />)

    const input = await waitFor(() =>
      screen.getByLabelText<HTMLInputElement>('Upload logo'),
    )

    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/png,image/jpeg,image/svg+xml,image/webp')
    // sr-only keeps the input out of the visual layout but reachable
    expect(input.className).toContain('sr-only')
  })

  it('clicking the upload Button triggers .click() on the hidden file input', async () => {
    const user = userEvent.setup()
    render(<BrandingSettings />)

    // Wait for the form to finish loading
    const uploadBtn = await screen.findByRole('button', { name: 'Upload logo' })

    // Spy on the prototype so the spy is in place before the ref is used
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {})

    await user.click(uploadBtn)

    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('shows "Replace logo" label when a logo_url is already set', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ logo_url: 'https://cdn.example.com/op-1/logo-old.png' }),
    )
    render(<BrandingSettings />)

    await screen.findByRole('button', { name: 'Replace logo' })
  })

  it('shows "Remove logo" button only when a logo_url is set', async () => {
    // No logo → no remove button
    render(<BrandingSettings />)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Remove logo' }),
      ).toBeNull(),
    )
  })
})
