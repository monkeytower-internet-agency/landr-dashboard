import {
  render as rtlRender,
  screen,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { PricingSchemeRef } from '@/lib/products'

// landr-i018 — mock the operator hook + the schemes fetcher so the
// component renders deterministically with the fixture data below.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

const { fetchPricingSchemesMock } = vi.hoisted(() => ({
  fetchPricingSchemesMock: vi.fn(),
}))

vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/products')>()
  return {
    ...actual,
    fetchPricingSchemes: (...args: unknown[]) =>
      fetchPricingSchemesMock(...args),
  }
})

// The editor sheet pulls in heavy graph queries; the index-page tests
// don't open it so a tiny stub is fine and keeps the render fast.
vi.mock('@/components/pricing/PricingSchemeEditorSheet', () => ({
  PricingSchemeEditorSheet: () => null,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}))

import { PricingSettings } from './PricingSettings'

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

function makeScheme(overrides: Partial<PricingSchemeRef> = {}): PricingSchemeRef {
  return {
    id: 'ps-1',
    name: 'Standard paragliding',
    currency: 'EUR',
    active: true,
    notes: null,
    products: [],
    ...overrides,
  }
}

beforeEach(() => {
  fetchPricingSchemesMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PricingSettings — index card metadata (landr-i018)', () => {
  it('renders the scheme notes inline when present', async () => {
    fetchPricingSchemesMock.mockResolvedValue([
      makeScheme({
        notes: 'Summer 2026 pricing; review Q3.',
      }),
    ])

    render(<PricingSettings />)

    expect(
      await screen.findByText('Summer 2026 pricing; review Q3.'),
    ).toBeInTheDocument()
  })

  it('renders "Used by" with one link per product, each pointing to /products/<id>', async () => {
    fetchPricingSchemesMock.mockResolvedValue([
      makeScheme({
        products: [
          { id: 'p-1', slug: 'tandem', name: 'Tandem flight' },
          { id: 'p-2', slug: 'course', name: 'Beginner course' },
        ],
      }),
    ])

    render(<PricingSettings />)

    const tandem = await screen.findByRole('link', { name: 'Tandem flight' })
    expect(tandem).toHaveAttribute('href', '/products/p-1')

    const course = screen.getByRole('link', { name: 'Beginner course' })
    expect(course).toHaveAttribute('href', '/products/p-2')

    expect(screen.getByText(/Used by:/)).toBeInTheDocument()
  })

  it('renders "Not in use" when no products link the scheme', async () => {
    fetchPricingSchemesMock.mockResolvedValue([
      makeScheme({ products: [] }),
    ])

    render(<PricingSettings />)

    expect(await screen.findByText('Not in use')).toBeInTheDocument()
    expect(screen.queryByText(/Used by:/)).not.toBeInTheDocument()
  })

  it('does not render the notes paragraph when notes is null/empty', async () => {
    fetchPricingSchemesMock.mockResolvedValue([
      makeScheme({ notes: '' }),
      makeScheme({ id: 'ps-2', name: 'Second scheme', notes: null }),
    ])

    render(<PricingSettings />)

    // Wait for the schemes to render before asserting on absence.
    await screen.findByText('Standard paragliding')
    expect(screen.getByText('Second scheme')).toBeInTheDocument()

    // Each card still renders the 'Not in use' line (products: [])
    // but the empty/null notes block should be absent.
    const notesParagraphs = screen
      .queryAllByText((_text, node) => {
        if (!node) return false
        return (
          node.tagName === 'P' &&
          node.className.includes('text-muted-foreground') &&
          (node.textContent ?? '').trim().length > 0 &&
          node.textContent !== 'Loading pricing schemes…'
        )
      })
    expect(notesParagraphs.length).toBe(0)
  })
})
