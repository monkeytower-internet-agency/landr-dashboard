/**
 * EmbedSettings tests (landr-up1b) — booking-widget shortcode generator.
 * Covers the All / Category / Single-product modes, the live shortcode +
 * iframe output, and Copy.
 */
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

type GroupFixture = import('@/lib/productGroups').ProductGroup

vi.mock('@/lib/productGroups', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/productGroups')>()
  return {
    ...actual,
    fetchProductGroupTree: vi.fn(
      async (): Promise<GroupFixture[]> => [
        {
          id: 'courses',
          operator_id: 'op-1',
          slug: 'courses',
          name: 'Courses',
          name_localized: null,
          description: null,
          description_localized: null,
          parent_id: null,
          sort_order: 10,
          active: true,
          created_at: '2026-05-22T00:00:00Z',
          updated_at: '2026-05-22T00:00:00Z',
        },
      ],
    ),
  }
})

vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/products')>()
  return {
    ...actual,
    fetchProducts: vi.fn(async () => [
      {
        id: 'p-1',
        operator_id: 'op-1',
        product_group_id: 'courses',
        slug: 'open-water',
        name: 'Open Water',
        product_kind: 'service',
        active: true,
      },
    ]),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { EmbedSettings } from './EmbedSettings'

const clipboardWriteText = vi.fn(() => Promise.resolve())
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: clipboardWriteText },
})

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

beforeEach(() => {
  clipboardWriteText.mockReset()
  clipboardWriteText.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EmbedSettings (landr-up1b)', () => {
  it('defaults to "All products" — operator-only shortcode', async () => {
    render(<EmbedSettings />)
    const code = await screen.findByTestId('embed-shortcode-code')
    expect(code).toHaveTextContent('[landr_booking operator="para42"]')
  })

  it('adds a group= attr when a category is selected', async () => {
    const user = userEvent.setup()
    render(<EmbedSettings />)
    await user.click(screen.getByTestId('embed-mode-category'))
    const select = await screen.findByTestId('embed-category-select')
    await user.selectOptions(select, 'courses')
    await waitFor(() =>
      expect(screen.getByTestId('embed-shortcode-code')).toHaveTextContent(
        '[landr_booking operator="para42" group="courses"]',
      ),
    )
  })

  it('adds a product= attr when a single product is selected', async () => {
    const user = userEvent.setup()
    render(<EmbedSettings />)
    await user.click(screen.getByTestId('embed-mode-product'))
    const select = await screen.findByTestId('embed-product-select')
    await user.selectOptions(select, 'open-water')
    await waitFor(() =>
      expect(screen.getByTestId('embed-shortcode-code')).toHaveTextContent(
        '[landr_booking operator="para42" product="open-water"]',
      ),
    )
  })

  it('renders a matching iframe and copies it', async () => {
    render(<EmbedSettings />)
    const iframeBlock = await screen.findByTestId('embed-iframe')
    expect(
      within(iframeBlock).getByTestId('embed-iframe-code'),
    ).toHaveTextContent(
      'https://bw.landr.de/?operator=para42',
    )
    // Re-install the spy right before the click: an earlier test in this
    // file may have called userEvent.setup(), which (v14) swaps
    // navigator.clipboard for its own stub. fireEvent + a fresh spy keeps
    // the assertion honest.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
    fireEvent.click(within(iframeBlock).getByTestId('embed-iframe-copy'))
    await waitFor(() =>
      expect(clipboardWriteText).toHaveBeenCalledWith(
        expect.stringContaining('<iframe src="https://bw.landr.de/?operator=para42"'),
      ),
    )
  })
})
