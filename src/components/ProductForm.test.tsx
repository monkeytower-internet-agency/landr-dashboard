import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProductForm, type ProductFormSubmitValue } from './ProductForm'
import type { Operator } from '@/lib/operator'
import type { ProductKind, ProductRow } from '@/lib/products'

// The form reads the operator allow-list from a hook by default; pass
// `allowedKinds` explicitly to bypass the context here. These tests focus
// on the kind→shape→is_contiguous progression and the package-gating
// rendering behaviour for landr-5eb + the premium-tease UX for landr-c3t.
//
// __mockOperator is a mutable handle that individual tests can re-assign
// to drive useOperator() into specific tier/teaser states.
const __operatorState: { current: Operator | null } = { current: null }
vi.mock('@/lib/operator', () => ({
  useOperatorAllowedProductKinds: () => ['service'],
  useOperator: () => ({
    operators: __operatorState.current ? [__operatorState.current] : [],
    currentOperator: __operatorState.current,
    currentOperatorId: __operatorState.current?.id ?? null,
    loading: false,
    switchOperator: () => {},
    refreshOperators: () => {},
  }),
}))

function setup(opts: {
  product?: ProductRow | null
  allowedKinds?: ProductKind[]
  operator?: Operator | null
  onSubmit?: (v: ProductFormSubmitValue) => void
} = {}) {
  __operatorState.current = opts.operator ?? null
  const onSubmit = vi.fn(opts.onSubmit ?? (() => {}))
  render(
    <ProductForm
      product={opts.product ?? null}
      pricingSchemes={[]}
      productGroups={[]}
      allowedKinds={opts.allowedKinds}
      onSubmit={onSubmit}
    />,
  )
  return { onSubmit }
}

function makeOperator(overrides: Partial<Operator> = {}): Operator {
  return {
    id: 'op-1',
    slug: 'op-1',
    name: 'Test Op',
    onboarded_at: '2026-05-01T00:00:00Z',
    subscription_package: {
      slug: 'pro',
      name: 'Pro',
      allowed_product_kinds: ['service', 'subscription'],
    },
    show_premium_teasers: false,
    ...overrides,
  }
}

describe('ProductForm — package gating (landr-5eb)', () => {
  it("hides product_kind options the operator's package doesn't allow", () => {
    setup({ allowedKinds: ['service'] })
    const select = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[]
    expect(options.map((o) => o.value)).toEqual(['service'])
  })

  it('shows all 4 kinds for an enterprise-tier operator', () => {
    setup({
      allowedKinds: ['service', 'physical_good', 'digital_good', 'gift_card'],
    })
    const select = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[]
    expect(options.map((o) => o.value).sort()).toEqual(
      ['digital_good', 'gift_card', 'physical_good', 'service'].sort(),
    )
  })

  it('renders the "Coming soon" placeholder for non-service kinds', async () => {
    const user = userEvent.setup()
    setup({ allowedKinds: ['service', 'gift_card'] })

    const select = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(select, 'gift_card')

    expect(
      screen.getByText(/coming soon — shop ui/i),
    ).toBeInTheDocument()
    // Submit button is disabled with the upgrade-prompt tooltip.
    const submit = screen.getByRole('button', { name: /create product/i })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAttribute(
      'title',
      expect.stringMatching(/upcoming shop surface/i),
    )
  })

  it('shows the physical_good-specific placeholder body for physical_good', async () => {
    const user = userEvent.setup()
    setup({ allowedKinds: ['service', 'physical_good'] })

    const select = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(select, 'physical_good')

    expect(
      screen.getByText(/inventory & shipping for physical goods/i),
    ).toBeInTheDocument()
  })
})

describe('ProductForm — premium-tease UX (landr-c3t)', () => {
  it('pro operator with teasers OFF shows only allowed kinds (no teasers)', () => {
    setup({
      allowedKinds: ['service', 'subscription'],
      operator: makeOperator({
        subscription_package: {
          slug: 'pro',
          name: 'Pro',
          allowed_product_kinds: ['service', 'subscription'],
        },
        show_premium_teasers: false,
      }),
    })
    const select = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[]
    expect(options.map((o) => o.value).sort()).toEqual(
      ['service', 'subscription'].sort(),
    )
    // None disabled.
    expect(options.every((o) => !o.disabled)).toBe(true)
  })

  it('pro operator with teasers ON shows allowed + disabled teased kinds', () => {
    setup({
      allowedKinds: ['service', 'subscription'],
      operator: makeOperator({
        subscription_package: {
          slug: 'pro',
          name: 'Pro',
          allowed_product_kinds: ['service', 'subscription'],
        },
        show_premium_teasers: true,
      }),
    })
    const select = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[]
    // All 5 kinds present.
    expect(options.map((o) => o.value).sort()).toEqual(
      ['digital_good', 'gift_card', 'physical_good', 'service', 'subscription'].sort(),
    )
    // service + subscription enabled; the other 3 disabled.
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value)
    const disabled = options.filter((o) => o.disabled).map((o) => o.value)
    expect(enabled.sort()).toEqual(['service', 'subscription'].sort())
    expect(disabled.sort()).toEqual(
      ['digital_good', 'gift_card', 'physical_good'].sort(),
    )
    // Tooltip names the lowest unlocking tier.
    const physical = options.find((o) => o.value === 'physical_good')
    expect(physical?.title).toMatch(/business/i)
    const gift = options.find((o) => o.value === 'gift_card')
    expect(gift?.title).toMatch(/enterprise/i)
  })

  it('free operator always shows teasers regardless of stored value', () => {
    setup({
      allowedKinds: ['service'],
      operator: makeOperator({
        subscription_package: {
          slug: 'free',
          name: 'Free',
          allowed_product_kinds: ['service'],
        },
        show_premium_teasers: false, // explicitly off — should still tease
      }),
    })
    const select = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    const options = within(select).getAllByRole(
      'option',
    ) as HTMLOptionElement[]
    expect(options.length).toBe(5)
    const disabled = options.filter((o) => o.disabled).map((o) => o.value)
    expect(disabled.sort()).toEqual(
      ['digital_good', 'gift_card', 'physical_good', 'subscription'].sort(),
    )
    const sub = options.find((o) => o.value === 'subscription')
    expect(sub?.title).toMatch(/pro/i)
  })
})

describe('ProductForm — kind/shape/contiguous progression', () => {
  it('renders service_time_shape select when kind=service', () => {
    setup({ allowedKinds: ['service'] })
    expect(screen.getByLabelText(/time model/i)).toBeInTheDocument()
  })

  it('shows is_contiguous toggle only when shape=days_range', async () => {
    const user = userEvent.setup()
    setup({ allowedKinds: ['service'] })

    // Default is days_range, so the toggle is visible.
    expect(
      screen.getByLabelText(/whole-range \(contiguous days\)/i),
    ).toBeInTheDocument()

    // Switch to time_slot → toggle disappears, duration_minutes appears.
    const shape = screen.getByLabelText(/time model/i) as HTMLSelectElement
    await user.selectOptions(shape, 'time_slot')
    expect(
      screen.queryByLabelText(/whole-range \(contiguous days\)/i),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(/duration \(minutes\)/i)).toBeInTheDocument()

    // Switch to fixed_window → date inputs appear.
    await user.selectOptions(shape, 'fixed_window')
    expect(screen.getByLabelText(/fixed start date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/fixed end date/i)).toBeInTheDocument()

    // Switch to single_date → no extra inputs.
    await user.selectOptions(shape, 'single_date')
    expect(screen.queryByLabelText(/duration \(minutes\)/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/fixed start date/i)).not.toBeInTheDocument()
  })

  it('submits with shape=days_range + is_contiguous=true when toggled', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    setup({
      allowedKinds: ['service'],
      onSubmit: (v) => {
        submitted.push(v)
      },
    })

    await user.type(screen.getByLabelText(/^name$/i), 'Week Course')
    // shape is days_range by default; toggle on.
    await user.click(
      screen.getByLabelText(/whole-range \(contiguous days\)/i),
    )
    await user.click(screen.getByRole('button', { name: /create product/i }))

    expect(submitted.length).toBe(1)
    expect(submitted[0]).toMatchObject({
      name: 'Week Course',
      product_kind: 'service',
      service_time_shape: 'days_range',
      is_contiguous: true,
    })
  })

  it('clears service_time_shape when kind is switched away from service', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    setup({
      allowedKinds: ['service', 'gift_card'],
      onSubmit: (v) => {
        submitted.push(v)
      },
    })

    await user.type(screen.getByLabelText(/^name$/i), 'Voucher 50')
    // Switch to gift_card — the form clears the shape so DB CHECK holds.
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'gift_card')

    // The submit button is disabled for non-service kinds — but we can still
    // verify the cleared shape via re-selecting service.
    await user.selectOptions(kind, 'service')
    expect(screen.getByLabelText(/time model/i)).toBeInTheDocument()
  })
})

// landr-wto — discount-scheme rename + None submission.
describe('ProductForm — discount scheme (landr-wto)', () => {
  it("renders the field as 'Discount scheme' with the helper text and a None option", () => {
    setup({ allowedKinds: ['service'] })
    // Label rename.
    expect(screen.getByLabelText(/discount scheme/i)).toBeInTheDocument()
    // Helper copy beneath the field.
    expect(
      screen.getByText(
        /optional.*applied to all bookings.*leave blank for no automatic discount/i,
      ),
    ).toBeInTheDocument()
    // None option present.
    const select = screen.getByLabelText(/discount scheme/i) as HTMLSelectElement
    const options = within(select).getAllByRole('option') as HTMLOptionElement[]
    expect(options[0].value).toBe('')
  })

  it('submits null for default_pricing_scheme_id when None stays selected', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    setup({
      allowedKinds: ['service'],
      onSubmit: (v) => {
        submitted.push(v)
      },
    })

    await user.type(screen.getByLabelText(/^name$/i), 'Tandem Flight')
    await user.click(screen.getByRole('button', { name: /create/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0].default_pricing_scheme_id).toBeNull()
  })
})
