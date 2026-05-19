import {
  render as rtlRender,
  screen,
  waitFor,
  act,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { OperatorSettings, GmailStatus } from '@/lib/operatorSettings'
import type { Location, LocationRoleType } from '@/lib/locations'
import type {
  PricingSchemeRef,
  ProductGroupRef,
  ProductRow,
  ProductWritePayload,
} from '@/lib/products'

const OPERATOR_FIXTURE: OperatorSettings = {
  id: 'op-1',
  name: 'Para42',
  legal_name: 'Para42 GmbH',
  slug: 'para42',
  tax_id: 'DE123456789',
  tax_id_kind: 'VAT',
  phone: '+49 1234 567890',
  street: 'Hauptstr. 1',
  city: 'Berlin',
  postal_code: '10115',
  region: 'Berlin',
  country: 'DE',
  timezone: 'Europe/Berlin',
  default_locale: 'de',
  onboarded_at: null,
}

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchOperator: vi.fn<(id: string) => Promise<OperatorSettings>>(),
    patchOperator: vi.fn<
      (id: string, patch: Partial<OperatorSettings>) => Promise<OperatorSettings>
    >(),
    markOnboarded: vi.fn<(id: string) => Promise<OperatorSettings>>(),
    fetchGmailStatus: vi.fn<(id: string) => Promise<GmailStatus>>(),
    fetchGmailInstallUrl:
      vi.fn<(id: string) => Promise<{ install_url: string; state: string }>>(),
    fetchLocations: vi.fn<(id: string) => Promise<Location[]>>(),
    fetchLocationRoleTypes: vi.fn<(id: string) => Promise<LocationRoleType[]>>(),
    fetchProducts: vi.fn<(id: string) => Promise<ProductRow[]>>(),
    fetchPricingSchemes: vi.fn<(id: string) => Promise<PricingSchemeRef[]>>(),
    fetchProductGroups: vi.fn<(id: string) => Promise<ProductGroupRef[]>>(),
    createProduct: vi.fn<(p: ProductWritePayload) => Promise<ProductRow>>(),
    refreshOperators: vi.fn(),
  },
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: mocks.fetchOperator,
    patchOperator: mocks.patchOperator,
    markOnboarded: mocks.markOnboarded,
    fetchGmailStatus: mocks.fetchGmailStatus,
    fetchGmailInstallUrl: mocks.fetchGmailInstallUrl,
  }
})

vi.mock('@/lib/locations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/locations')>()
  return {
    ...actual,
    fetchLocations: mocks.fetchLocations,
    fetchLocationRoleTypes: mocks.fetchLocationRoleTypes,
  }
})

vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/products')>()
  return {
    ...actual,
    fetchProducts: mocks.fetchProducts,
    fetchPricingSchemes: mocks.fetchPricingSchemes,
    fetchProductGroups: mocks.fetchProductGroups,
    createProduct: mocks.createProduct,
  }
})

vi.mock('@/lib/operator', () => {
  const PACKAGE = {
    slug: 'pro',
    name: 'Pro',
    allowed_product_kinds: ['service'],
  }
  const OPERATOR = {
    id: 'op-1',
    slug: 'para42',
    name: 'Para42',
    onboarded_at: null,
    subscription_package: PACKAGE,
  }
  return {
    useOperator: () => ({
      operators: [OPERATOR],
      currentOperator: OPERATOR,
      currentOperatorId: 'op-1',
      loading: false,
      switchOperator: () => {},
      refreshOperators: mocks.refreshOperators,
    }),
    useOperatorAllowedProductKinds: () => ['service'],
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { access_token: 'tok-1', user: { id: 'user-1' } },
    loading: false,
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: { success: [] as string[], error: [] as string[] },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => { toastCalls.success.push(msg) }),
    error: vi.fn((msg: string) => { toastCalls.error.push(msg) }),
  },
  Toaster: () => null,
}))

import { Onboarding } from './Onboarding'

function renderRoute(initialEntry = '/onboarding/start'): ReturnType<typeof rtlRender> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/onboarding/start" element={<Onboarding />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/bookings" element={<div>Bookings page</div>} />
          <Route path="/calendar" element={<div>Calendar page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return rtlRender(ui)
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.fetchOperator.mockResolvedValue({ ...OPERATOR_FIXTURE })
  mocks.patchOperator.mockResolvedValue({ ...OPERATOR_FIXTURE })
  mocks.markOnboarded.mockResolvedValue({
    ...OPERATOR_FIXTURE,
    onboarded_at: '2026-05-19T10:00:00.000Z',
  })
  mocks.fetchGmailStatus.mockResolvedValue({ connected: false })
  mocks.fetchGmailInstallUrl.mockResolvedValue({
    install_url: 'https://accounts.google.com/o/oauth2/auth',
    state: 'st-1',
  })
  mocks.fetchLocations.mockResolvedValue([])
  mocks.fetchLocationRoleTypes.mockResolvedValue([])
  mocks.fetchProducts.mockResolvedValue([])
  mocks.fetchPricingSchemes.mockResolvedValue([])
  mocks.fetchProductGroups.mockResolvedValue([])
  mocks.createProduct.mockImplementation(async (payload) => ({
    id: 'new-prod',
    operator_id: payload.operator_id,
    product_group_id: payload.product_group_id,
    slug: payload.slug,
    name: payload.name,
    short_description: payload.short_description,
    description: payload.description,
    product_kind: payload.product_kind,
    service_time_shape: payload.service_time_shape,
    is_contiguous: payload.is_contiguous,
    duration_minutes: payload.duration_minutes,
    fixed_start_date: payload.fixed_start_date,
    fixed_end_date: payload.fixed_end_date,
    default_pricing_scheme_id: payload.default_pricing_scheme_id,
    needs_provider: payload.needs_provider,
    needs_pickup: payload.needs_pickup,
    revenue_flows_through_operator: payload.revenue_flows_through_operator,
    is_publicly_listed: payload.is_publicly_listed,
    active: payload.active,
    sort_order: payload.sort_order,
    deleted_at: null,
    created_at: '2026-05-19T10:00:00.000Z',
    updated_at: '2026-05-19T10:00:00.000Z',
    pricing_scheme: null,
    product_group: null,
  }))
  mocks.refreshOperators.mockReset()
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Onboarding wizard', () => {
  it('renders step 1 (Welcome) and advances on CTA', async () => {
    const user = userEvent.setup()
    renderRoute()

    await screen.findByRole('heading', { name: /welcome to landr/i, level: 1 })
    expect(screen.getByText(/step 1 of 9/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /let's get started/i }))
    await screen.findByText(/step 2 of 9/i)
  })

  it('PATCHes operator on step 2 Next', async () => {
    const user = userEvent.setup()
    renderRoute('/onboarding/start?step=2')

    await screen.findByText(/step 2 of 9/i)
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    await waitFor(() => {
      expect(mocks.patchOperator).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ name: 'Para42' }),
      )
    })
    await screen.findByText(/step 3 of 9/i)
  })

  it('warns then allows skip on step 4 when there are no pickup locations', async () => {
    const user = userEvent.setup()
    renderRoute('/onboarding/start?step=4')

    await screen.findByText(/step 4 of 9/i)
    await screen.findByText(/no pickup locations yet/i)

    // First click on Skip → confirmation appears
    await user.click(screen.getByRole('button', { name: /skip for now/i }))
    await screen.findByRole('alert')

    // Second click → advances
    await user.click(screen.getByRole('button', { name: /^next$/i }))
    await screen.findByText(/step 5 of 9/i)
  })

  it('creates a starter product from a template on step 5', async () => {
    const user = userEvent.setup()
    renderRoute('/onboarding/start?step=5')

    await screen.findByText(/step 5 of 9/i)
    const createButtons = await screen.findAllByRole('button', { name: /^create$/i })
    expect(createButtons.length).toBe(3)

    await user.click(createButtons[0])
    await waitFor(() => {
      expect(mocks.createProduct).toHaveBeenCalledTimes(1)
    })
    expect(mocks.createProduct.mock.calls[0][0].operator_id).toBe('op-1')
  })

  it('step 5 count is derived from the products query (3 fetched → "3 products configured")', async () => {
    mocks.fetchProducts.mockResolvedValue([
      {
        id: 'p-1', operator_id: 'op-1', product_group_id: null, slug: 'a',
        name: 'A', short_description: null, description: null,
        product_kind: 'service', service_time_shape: 'time_slot', is_contiguous: false, duration_minutes: 60,
        fixed_start_date: null, fixed_end_date: null,
        default_pricing_scheme_id: null,
        needs_provider: false, needs_pickup: false,
        revenue_flows_through_operator: true, is_publicly_listed: true,
        active: true, sort_order: 1, deleted_at: null,
        created_at: '2026-05-19T10:00:00Z', updated_at: '2026-05-19T10:00:00Z',
        pricing_scheme: null, product_group: null,
      },
      {
        id: 'p-2', operator_id: 'op-1', product_group_id: null, slug: 'b',
        name: 'B', short_description: null, description: null,
        product_kind: 'service', service_time_shape: 'time_slot', is_contiguous: false, duration_minutes: 60,
        fixed_start_date: null, fixed_end_date: null,
        default_pricing_scheme_id: null,
        needs_provider: false, needs_pickup: false,
        revenue_flows_through_operator: true, is_publicly_listed: true,
        active: true, sort_order: 2, deleted_at: null,
        created_at: '2026-05-19T10:00:00Z', updated_at: '2026-05-19T10:00:00Z',
        pricing_scheme: null, product_group: null,
      },
      {
        id: 'p-3', operator_id: 'op-1', product_group_id: null, slug: 'c',
        name: 'C', short_description: null, description: null,
        product_kind: 'service', service_time_shape: 'time_slot', is_contiguous: false, duration_minutes: 60,
        fixed_start_date: null, fixed_end_date: null,
        default_pricing_scheme_id: null,
        needs_provider: false, needs_pickup: false,
        revenue_flows_through_operator: true, is_publicly_listed: true,
        active: true, sort_order: 3, deleted_at: null,
        created_at: '2026-05-19T10:00:00Z', updated_at: '2026-05-19T10:00:00Z',
        pricing_scheme: null, product_group: null,
      },
    ])
    renderRoute('/onboarding/start?step=5')

    await screen.findByText(/step 5 of 9/i)
    // The count is derived from the same fetchProducts query the overlay
    // (ProductsManager) uses, so 3 fetched rows → "3 products configured".
    await screen.findByText(/3 products configured/i)
  })

  it('step 5 "Open products" button does not navigate (it opens a Sheet overlay)', async () => {
    const user = userEvent.setup()
    renderRoute('/onboarding/start?step=5')

    await screen.findByText(/step 5 of 9/i)
    const openProducts = await screen.findByRole('button', { name: /open products/i })
    // It must be a button (not a Link/anchor), so clicking it stays on the
    // wizard route instead of pushing /products (the old broken behaviour).
    expect(openProducts.tagName).toBe('BUTTON')
    await user.click(openProducts)
    // Still on the wizard step after the click.
    expect(screen.getByText(/step 5 of 9/i)).toBeInTheDocument()
  })

  it('goes back from step 3 to step 2', async () => {
    const user = userEvent.setup()
    renderRoute('/onboarding/start?step=3')

    await screen.findByText(/step 3 of 9/i)
    await user.click(screen.getByRole('button', { name: /^back$/i }))
    await screen.findByText(/step 2 of 9/i)
  })

  it('marks onboarded_at on step 8 finish and shows step 9', async () => {
    const user = userEvent.setup()
    renderRoute('/onboarding/start?step=8')

    await screen.findByText(/step 8 of 9/i)
    await user.click(screen.getByRole('button', { name: /i've embedded it/i }))

    await waitFor(() => {
      expect(mocks.markOnboarded).toHaveBeenCalledWith('op-1')
    })
    expect(mocks.refreshOperators).toHaveBeenCalled()
    await screen.findByText(/step 9 of 9/i)
  })

  it('persists step number to localStorage and resumes from it', async () => {
    const user = userEvent.setup()
    renderRoute('/onboarding/start?step=3')

    await screen.findByText(/step 3 of 9/i)
    await waitFor(() => {
      expect(window.localStorage.getItem('landr.dashboard.onboarding.op-1.step')).toBe('3')
    })

    // Click Back to ensure persisted value updates with step
    await user.click(screen.getByRole('button', { name: /^back$/i }))
    await screen.findByText(/step 2 of 9/i)
    await waitFor(() => {
      expect(window.localStorage.getItem('landr.dashboard.onboarding.op-1.step')).toBe('2')
    })
  })

  it('renders the WP shortcode on step 8 for copy', async () => {
    renderRoute('/onboarding/start?step=8')

    await screen.findByText(/step 8 of 9/i)
    expect(
      screen.getByText('[landr_booking operator=para42]'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('[landr_booking operator=para42 type=courses]'),
    ).toBeInTheDocument()
  })

  it('keeps the wizard out of the redirect loop while still loading', async () => {
    // Sanity: render step 1 and just confirm it renders cleanly.
    renderRoute()
    await screen.findByText(/step 1 of 9/i)
    await act(async () => { /* allow effects to settle */ })
  })
})
