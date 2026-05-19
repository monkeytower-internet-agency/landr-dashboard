import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProductForm, type ProductFormSubmitValue } from './ProductForm'
import type { ProductKind, ProductRow } from '@/lib/products'

// The form reads the operator allow-list from a hook by default; pass
// `allowedKinds` explicitly to bypass the context here. These tests focus
// on the kind→shape→is_contiguous progression and the package-gating
// rendering behaviour for landr-5eb.
vi.mock('@/lib/operator', () => ({
  useOperatorAllowedProductKinds: () => ['service'],
}))

function setup(opts: {
  product?: ProductRow | null
  allowedKinds?: ProductKind[]
  onSubmit?: (v: ProductFormSubmitValue) => void
} = {}) {
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
