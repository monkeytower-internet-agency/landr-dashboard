/**
 * OffersSettings tests (landr-znzz.5) — generic per-operator offers editor.
 * Covers list render, empty state, create (title required), inline edit,
 * the active toggle, reorder (sort_order PATCH), and delete (soft-delete).
 */
import {
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

type OfferFixture = import('@/lib/operator-offers').OperatorOffer

const { state, createMock, updateMock, deleteMock } = vi.hoisted(() => ({
  state: { offers: [] as OfferFixture[] },
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('@/lib/operator-offers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/operator-offers')>()
  return {
    ...actual,
    fetchOperatorOffers: vi.fn(async () => state.offers),
    createOperatorOffer: vi.fn(async (_op: string, body: unknown) => {
      createMock(body)
      return state.offers[0]
    }),
    updateOperatorOffer: vi.fn(
      async (_op: string, id: string, patch: unknown) => {
        updateMock(id, patch)
        return { ...state.offers.find((o) => o.id === id)!, ...(patch as object) }
      },
    ),
    deleteOperatorOffer: vi.fn(async (_op: string, id: string) => {
      deleteMock(id)
    }),
  }
})

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}))

import { OffersSettings } from './OffersSettings'

function o(
  id: string,
  title: string,
  sort_order = 0,
  overrides: Partial<OfferFixture> = {},
): OfferFixture {
  return {
    id,
    operator_id: 'op-1',
    title,
    description: null,
    cta_label: 'Buy',
    cta_url: 'https://shop.example/' + id,
    image_url: null,
    is_active: true,
    sort_order,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides,
  }
}

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
  state.offers = [o('video', 'Your footage', 0), o('mug', 'Photo mug', 1)]
  createMock.mockReset()
  updateMock.mockReset()
  deleteMock.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('OffersSettings (landr-znzz.5)', () => {
  it('renders the offers list in order', async () => {
    render(<OffersSettings />)
    await screen.findByTestId('offer-row-video')
    const rows = screen.getAllByTestId(/^offer-row-[a-z]+$/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'offer-row-video',
      'offer-row-mug',
    ])
  })

  it('shows an empty state with no defaults', async () => {
    state.offers = []
    render(<OffersSettings />)
    await waitFor(() =>
      expect(screen.getByTestId('offers-list')).toHaveTextContent(/no offers yet/i),
    )
  })

  it('requires a title to create', async () => {
    const user = userEvent.setup()
    render(<OffersSettings />)
    await screen.findByTestId('offers-create')
    // submit stays disabled with an empty title
    expect(screen.getByTestId('offers-create-submit')).toBeDisabled()
    await user.type(screen.getByTestId('offers-create-title'), 'New offer')
    await user.type(
      screen.getByTestId('offers-create-cta-url'),
      'https://shop.example/new',
    )
    expect(screen.getByTestId('offers-create-submit')).not.toBeDisabled()
    await user.click(screen.getByTestId('offers-create-submit'))
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New offer',
          cta_url: 'https://shop.example/new',
        }),
      ),
    )
  })

  it('toggles an offer active via the row checkbox (PATCH)', async () => {
    const user = userEvent.setup()
    render(<OffersSettings />)
    const row = await screen.findByTestId('offer-row-video')
    await user.click(within(row).getByTestId('offer-row-video-active'))
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('video', { is_active: false }),
    )
  })

  it('reorders an offer down by writing the neighbour sort_order', async () => {
    const user = userEvent.setup()
    render(<OffersSettings />)
    const row = await screen.findByTestId('offer-row-video')
    await user.click(within(row).getByTestId('offer-row-video-down'))
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('video', { sort_order: 1 }),
    )
  })

  it('soft-deletes an offer after confirm', async () => {
    const user = userEvent.setup()
    render(<OffersSettings />)
    const row = await screen.findByTestId('offer-row-mug')
    await user.click(within(row).getByTestId('offer-row-mug-delete'))
    await user.click(within(row).getByTestId('offer-row-mug-confirm-delete'))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('mug'))
  })
})
