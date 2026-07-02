// landr-c53m.5 — Settings → Vouchers scope-picker coverage.
//
// Verifies the create/edit dialog renders the product + campaign scope
// pickers (backed by the existing fetchProducts/fetchCampaigns sources),
// that a selected product/campaign is included in the create/patch
// payload, that clearing a selection sends null, that an existing
// voucher's scope pre-fills the pickers, and that a 400
// invalid_applies_to_product_id / invalid_campaign_id /
// invalid_scope_reference response surfaces a friendly inline error
// instead of crashing the form.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { Voucher } from '@/lib/vouchers'
import type { Campaign } from '@/lib/campaigns'
import type { ProductRow } from '@/lib/products'

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
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

const {
  fetchVouchersMock,
  createMock,
  patchMock,
  deleteMock,
  fetchProductsMock,
  fetchCampaignsMock,
} = vi.hoisted(() => ({
  fetchVouchersMock: vi.fn(),
  createMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
  fetchProductsMock: vi.fn(),
  fetchCampaignsMock: vi.fn(),
}))

vi.mock('@/lib/vouchers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vouchers')>()
  return {
    ...actual,
    fetchVouchers: (...args: unknown[]) => fetchVouchersMock(...args),
    createVoucher: (...args: unknown[]) => createMock(...args),
    patchVoucher: (...args: unknown[]) => patchMock(...args),
    deleteVoucher: (...args: unknown[]) => deleteMock(...args),
  }
})

vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/products')>()
  return {
    ...actual,
    fetchProducts: (...args: unknown[]) => fetchProductsMock(...args),
  }
})

vi.mock('@/lib/campaigns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/campaigns')>()
  return {
    ...actual,
    fetchCampaigns: (...args: unknown[]) => fetchCampaignsMock(...args),
  }
})

import { VouchersSettings } from './VouchersSettings'

// ---------------------------------------------------------------------------
// Helpers + fixtures
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

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v1',
    operator_id: 'op-1',
    code: 'WELCOME10',
    kind: 'percent',
    amount: 10,
    currency: 'EUR',
    max_uses: 100,
    used_count: 3,
    valid_from: null,
    valid_until: null,
    scope: 'booking',
    applies_to_product_id: null,
    campaign_id: null,
    description: null,
    active: true,
    created_at: '2026-05-22T03:00:00Z',
    updated_at: '2026-05-22T03:00:00Z',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'prod-1',
    operator_id: 'op-1',
    product_group_id: null,
    slug: 'day-trip',
    name: 'Day trip',
    name_localized: null,
    short_description: null,
    short_description_localized: null,
    description: null,
    product_kind: 'service',
    service_time_shape: null,
    is_contiguous: true,
    duration_minutes: null,
    fixed_start_date: null,
    fixed_end_date: null,
    default_pricing_scheme_id: null,
    ...overrides,
  } as ProductRow
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-1',
    operator_id: 'op-1',
    code: 'SUMMER25',
    label: 'Summer 2025',
    label_localized: null,
    description: null,
    description_localized: null,
    kind: 'marketing',
    scope: 'booking',
    start_date: '2025-06-01',
    end_date: '2025-08-31',
    active: true,
    sort_order: 0,
    created_at: '2026-05-22T12:00:00Z',
    updated_at: '2026-05-22T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  fetchVouchersMock.mockReset()
  createMock.mockReset()
  patchMock.mockReset()
  deleteMock.mockReset()
  fetchProductsMock.mockReset()
  fetchCampaignsMock.mockReset()
  fetchProductsMock.mockResolvedValue([makeProduct()])
  fetchCampaignsMock.mockResolvedValue([makeCampaign()])
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VouchersSettings scope pickers (landr-c53m.5)', () => {
  it('renders the product and campaign scope pickers in the create dialog', async () => {
    fetchVouchersMock.mockResolvedValue([])
    const user = userEvent.setup()
    render(<VouchersSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('vouchers-create')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vouchers-create'))

    await waitFor(() => {
      expect(
        screen.getByTestId('voucher-field-product-scope'),
      ).toBeInTheDocument()
    })
    expect(screen.getByTestId('voucher-field-campaign-scope')).toBeInTheDocument()
    expect(screen.getByText('Day trip')).toBeInTheDocument()
    expect(screen.getByText('Summer 2025')).toBeInTheDocument()
    // Defaults to unscoped.
    expect(screen.getByTestId('voucher-field-product-scope')).toHaveValue('')
    expect(screen.getByTestId('voucher-field-campaign-scope')).toHaveValue('')
  })

  it('includes applies_to_product_id + campaign_id when selected on create', async () => {
    fetchVouchersMock.mockResolvedValue([])
    createMock.mockResolvedValue(makeVoucher())
    const user = userEvent.setup()
    render(<VouchersSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('vouchers-create')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vouchers-create'))

    await waitFor(() => {
      expect(
        screen.getByTestId('voucher-field-product-scope'),
      ).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('voucher-field-code'), 'SUMMER25')
    await user.type(screen.getByTestId('voucher-field-amount'), '25')
    await user.selectOptions(
      screen.getByTestId('voucher-field-product-scope'),
      'prod-1',
    )
    await user.selectOptions(
      screen.getByTestId('voucher-field-campaign-scope'),
      'camp-1',
    )
    await user.click(screen.getByTestId('voucher-dialog-submit'))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1)
    })
    const [, input] = createMock.mock.calls[0]
    expect(input).toMatchObject({
      applies_to_product_id: 'prod-1',
      campaign_id: 'camp-1',
    })
  })

  it('sends null for an unselected (cleared) scope', async () => {
    fetchVouchersMock.mockResolvedValue([])
    createMock.mockResolvedValue(makeVoucher())
    const user = userEvent.setup()
    render(<VouchersSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('vouchers-create')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vouchers-create'))
    await waitFor(() => {
      expect(
        screen.getByTestId('voucher-field-product-scope'),
      ).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('voucher-field-code'), 'SUMMER25')
    await user.type(screen.getByTestId('voucher-field-amount'), '25')
    // Leave both pickers on the default "All products" / "No campaign" option.
    await user.click(screen.getByTestId('voucher-dialog-submit'))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1)
    })
    const [, input] = createMock.mock.calls[0]
    expect(input.applies_to_product_id).toBeNull()
    expect(input.campaign_id).toBeNull()
  })

  it('pre-fills the pickers with the current scope when editing', async () => {
    fetchVouchersMock.mockResolvedValue([
      makeVoucher({ applies_to_product_id: 'prod-1', campaign_id: 'camp-1' }),
    ])
    const user = userEvent.setup()
    render(<VouchersSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('voucher-row-v1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('voucher-row-v1-edit'))

    await waitFor(() => {
      expect(screen.getByTestId('voucher-field-product-scope')).toHaveValue(
        'prod-1',
      )
    })
    expect(screen.getByTestId('voucher-field-campaign-scope')).toHaveValue(
      'camp-1',
    )
  })

  it('clearing an existing scope to "All products" / "No campaign" patches null', async () => {
    fetchVouchersMock.mockResolvedValue([
      makeVoucher({ applies_to_product_id: 'prod-1', campaign_id: 'camp-1' }),
    ])
    patchMock.mockResolvedValue(makeVoucher())
    const user = userEvent.setup()
    render(<VouchersSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('voucher-row-v1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('voucher-row-v1-edit'))
    await waitFor(() => {
      expect(screen.getByTestId('voucher-field-product-scope')).toHaveValue(
        'prod-1',
      )
    })

    await user.selectOptions(
      screen.getByTestId('voucher-field-product-scope'),
      '',
    )
    await user.selectOptions(
      screen.getByTestId('voucher-field-campaign-scope'),
      '',
    )
    await user.click(screen.getByTestId('voucher-dialog-submit'))

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledTimes(1)
    })
    const [, , patch] = patchMock.mock.calls[0]
    expect(patch.applies_to_product_id).toBeNull()
    expect(patch.campaign_id).toBeNull()
  })

  it('surfaces a friendly inline error on invalid_applies_to_product_id (400)', async () => {
    fetchVouchersMock.mockResolvedValue([])
    createMock.mockRejectedValue(new Error('invalid_applies_to_product_id'))
    const user = userEvent.setup()
    render(<VouchersSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('vouchers-create')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vouchers-create'))
    await waitFor(() => {
      expect(
        screen.getByTestId('voucher-field-product-scope'),
      ).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('voucher-field-code'), 'SUMMER25')
    await user.type(screen.getByTestId('voucher-field-amount'), '25')
    await user.selectOptions(
      screen.getByTestId('voucher-field-product-scope'),
      'prod-1',
    )
    await user.click(screen.getByTestId('voucher-dialog-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('voucher-scope-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('voucher-scope-error')).toHaveTextContent(
      /product could not be found/i,
    )
    // The dialog must stay open + usable, not crash.
    expect(screen.getByTestId('voucher-dialog-submit')).toBeInTheDocument()
  })

  it('surfaces a friendly inline error on invalid_campaign_id (400)', async () => {
    fetchVouchersMock.mockResolvedValue([])
    createMock.mockRejectedValue(new Error('invalid_campaign_id'))
    const user = userEvent.setup()
    render(<VouchersSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('vouchers-create')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vouchers-create'))
    await waitFor(() => {
      expect(
        screen.getByTestId('voucher-field-campaign-scope'),
      ).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('voucher-field-code'), 'SUMMER25')
    await user.type(screen.getByTestId('voucher-field-amount'), '25')
    await user.selectOptions(
      screen.getByTestId('voucher-field-campaign-scope'),
      'camp-1',
    )
    await user.click(screen.getByTestId('voucher-dialog-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('voucher-scope-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('voucher-scope-error')).toHaveTextContent(
      /campaign could not be found/i,
    )
  })
})
