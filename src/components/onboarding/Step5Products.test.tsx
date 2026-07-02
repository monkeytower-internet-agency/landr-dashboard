/**
 * Unit tests for Step5Products — "your first products" onboarding template
 * picker (landr-0wgo).
 *
 * Covers:
 *   - All 4 templates (guided, course, hotel, tandem) render with a Create button
 *   - Tandem template creates with the correct payload shape
 *   - templateLabel / templateDesc return the tandem i18n strings
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

import type { ProductRow, ProductWritePayload, PricingSchemeRef, ProductGroupRef } from '@/lib/products'
import { t } from '@/lib/strings'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchProducts: vi.fn<() => Promise<ProductRow[]>>(),
    fetchPricingSchemes: vi.fn<() => Promise<PricingSchemeRef[]>>(),
    fetchProductGroups: vi.fn<() => Promise<ProductGroupRef[]>>(),
    createProduct: vi.fn<(p: ProductWritePayload) => Promise<ProductRow>>(),
  },
}))

vi.mock('@/lib/products', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/products')>()
  return {
    ...actual,
    fetchProducts: mocks.fetchProducts,
    fetchPricingSchemes: mocks.fetchPricingSchemes,
    fetchProductGroups: mocks.fetchProductGroups,
    createProduct: mocks.createProduct,
  }
})

// sonner's toast is irrelevant; suppress it.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// ProductsManager is used in the Sheet overlay — stub it out so the test
// doesn't need to wire up the full product CRUD stack.
vi.mock('@/components/products/ProductsManager', () => ({
  ProductsManager: () => <div data-testid="products-manager" />,
}))

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  )
}

async function renderStep5(operatorId = 'op-test') {
  const { Step5Products } = await import('./Step5Products')
  const onAdvance = vi.fn()
  const onBack = vi.fn()
  render(
    <Step5Products operatorId={operatorId} onAdvance={onAdvance} onBack={onBack} />,
    { wrapper },
  )
  return { onAdvance, onBack }
}

const EMPTY_PRODUCT_LIST: ProductRow[] = []

const STUB_PRODUCT: ProductRow = {
  id: 'p-1',
  operator_id: 'op-test',
  product_group_id: null,
  slug: 'tandem-flight',
  name: 'Tandem flight',
  name_localized: null,
  short_description: 'Single tandem flight, time-slot bookable with a pilot.',
  short_description_localized: null,
  description: null,
  product_kind: 'service',
  service_time_shape: 'time_slot',
  is_contiguous: false,
  duration_minutes: 20,
  fixed_start_date: null,
  fixed_end_date: null,
  default_pricing_scheme_id: null,
  needs_provider: true,
  needs_pickup: true,
  revenue_flows_through_operator: true,
  is_publicly_listed: true,
  active: true,
  sort_order: 1,
  deleted_at: null,
  created_at: '2026-06-17T00:00:00Z',
  updated_at: '2026-06-17T00:00:00Z',
  hotel_location_id: null,
  hotel_offering: 'none',
  is_addon_only: false,
  capacity_per_unit: null,
  includes_breakfast: false,
  pricing_scheme: null,
  product_group: null,
  hotel_location: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchProducts.mockResolvedValue(EMPTY_PRODUCT_LIST)
  mocks.fetchPricingSchemes.mockResolvedValue([])
  mocks.fetchProductGroups.mockResolvedValue([])
  mocks.createProduct.mockResolvedValue(STUB_PRODUCT)
})

describe('Step5Products template list', () => {
  it('renders exactly 4 Create buttons (guided, course, hotel, tandem)', async () => {
    await renderStep5()
    const buttons = await screen.findAllByRole('button', { name: /^create$/i })
    expect(buttons).toHaveLength(4)
  })

  it('renders the tandem-flight template label from strings.ts', async () => {
    await renderStep5()
    await screen.findByText(t.onboarding.step5.templateTandem)
  })

  it('renders the tandem-flight template description from strings.ts', async () => {
    await renderStep5()
    await screen.findByText(t.onboarding.step5.templateTandemDesc)
  })
})

describe('Step5Products tandem template creation', () => {
  it('calls createProduct with tandem payload when the 4th Create button is clicked', async () => {
    const user = userEvent.setup()
    await renderStep5()

    const buttons = await screen.findAllByRole('button', { name: /^create$/i })
    // The 4th button corresponds to tandem (guided=0, course=1, hotel=2, tandem=3)
    await user.click(buttons[3])

    await waitFor(() => {
      expect(mocks.createProduct).toHaveBeenCalledTimes(1)
    })

    const payload = mocks.createProduct.mock.calls[0][0] as ProductWritePayload
    expect(payload.name).toBe('Tandem flight')
    expect(payload.service_time_shape).toBe('time_slot')
    expect(payload.duration_minutes).toBe(20)
    expect(payload.needs_provider).toBe(true)
    expect(payload.needs_pickup).toBe(true)
    expect(payload.is_contiguous).toBe(false)
    expect(payload.product_kind).toBe('service')
    expect(payload.operator_id).toBe('op-test')
  })
})

describe('Step5Products i18n strings', () => {
  it('templateTandem string is defined and non-empty', () => {
    expect(t.onboarding.step5.templateTandem).toBeTruthy()
    expect(typeof t.onboarding.step5.templateTandem).toBe('string')
  })

  it('templateTandemDesc string is defined and non-empty', () => {
    expect(t.onboarding.step5.templateTandemDesc).toBeTruthy()
    expect(typeof t.onboarding.step5.templateTandemDesc).toBe('string')
  })
})
