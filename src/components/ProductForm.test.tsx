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
    const submit = screen.getByRole('button', { name: /save/i })
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
    // landr-ssrx widened the kind list with 'hotel_room' — all 6 kinds
    // present now.
    expect(options.map((o) => o.value).sort()).toEqual(
      [
        'digital_good',
        'gift_card',
        'hotel_room',
        'physical_good',
        'service',
        'subscription',
      ].sort(),
    )
    // service + subscription enabled; the other 4 disabled (hotel_room is
    // a pro-tier feature but this test's allow-list omits it on purpose so
    // we can verify the teaser branch).
    const enabled = options.filter((o) => !o.disabled).map((o) => o.value)
    const disabled = options.filter((o) => o.disabled).map((o) => o.value)
    expect(enabled.sort()).toEqual(['service', 'subscription'].sort())
    expect(disabled.sort()).toEqual(
      ['digital_good', 'gift_card', 'hotel_room', 'physical_good'].sort(),
    )
    // Tooltip names the lowest unlocking tier.
    const physical = options.find((o) => o.value === 'physical_good')
    expect(physical?.title).toMatch(/business/i)
    const gift = options.find((o) => o.value === 'gift_card')
    expect(gift?.title).toMatch(/enterprise/i)
    const hotel = options.find((o) => o.value === 'hotel_room')
    expect(hotel?.title).toMatch(/pro/i)
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
    // 6 kinds after landr-ssrx added 'hotel_room'.
    expect(options.length).toBe(6)
    const disabled = options.filter((o) => o.disabled).map((o) => o.value)
    expect(disabled.sort()).toEqual(
      [
        'digital_good',
        'gift_card',
        'hotel_room',
        'physical_good',
        'subscription',
      ].sort(),
    )
    const sub = options.find((o) => o.value === 'subscription')
    expect(sub?.title).toMatch(/pro/i)
    const hotel = options.find((o) => o.value === 'hotel_room')
    expect(hotel?.title).toMatch(/pro/i)
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
    await user.click(screen.getByRole('button', { name: /save/i }))

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

// landr-ssrx — hotel_room kind + hotel_offering control on services.
describe('ProductForm — hotel_room kind (landr-ssrx)', () => {
  const hotelLocations = [
    { id: 'hotel-1', name: 'Hotel Sol' },
    { id: 'hotel-2', name: 'Hotel Luna' },
  ]

  it('shows the hotel picker only when kind=hotel_room', async () => {
    const user = userEvent.setup()
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={() => {}}
      />,
    )
    // Default is service — no hotel picker yet.
    expect(screen.queryByLabelText(/^hotel$/i)).not.toBeInTheDocument()

    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')

    // Hotel picker appears with both hotels as options.
    const picker = screen.getByLabelText(/^hotel$/i) as HTMLSelectElement
    const options = within(picker).getAllByRole('option') as HTMLOptionElement[]
    expect(options.map((o) => o.value)).toContain('hotel-1')
    expect(options.map((o) => o.value)).toContain('hotel-2')

    // Service-only fields drop out.
    expect(screen.queryByLabelText(/time model/i)).not.toBeInTheDocument()
    // Helper card naming the per-night/RFTO=false semantics is present.
    expect(
      screen.getByText(/hotel room prices are displayed per night/i),
    ).toBeInTheDocument()
  })

  it('defaults revenue_flows_through_operator to false for fresh hotel_room', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )

    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')

    await user.type(screen.getByLabelText(/^name$/i), 'Single Room')
    await user.selectOptions(
      screen.getByLabelText(/^hotel$/i),
      'hotel-1',
    )

    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'hotel_room',
      hotel_location_id: 'hotel-1',
      // landr-ssrx: hotel rooms ship RFTO=false by default — guests pay
      // the hotel directly.
      revenue_flows_through_operator: false,
      // service-only fields collapse to safe defaults so the DB CHECK holds.
      service_time_shape: null,
      hotel_offering: 'none',
    })
  })

  it('blocks submit until a hotel is picked for kind=hotel_room', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )

    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')

    await user.type(screen.getByLabelText(/^name$/i), 'Single Room')
    // Intentionally skip the hotel picker.
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(0)
    // The validation message renders inside the FormMessage <p
    // data-slot="form-message">; the helper-text copy below the picker
    // also mentions "Pick the hotel…", so we anchor on the form-message
    // slot to avoid the duplicate.
    const messages = await screen.findAllByText(
      /pick the hotel this room belongs to/i,
    )
    const messageNode = messages.find(
      (n) => n.getAttribute('data-slot') === 'form-message',
    )
    expect(messageNode).toBeDefined()
  })

  it('warns when the operator has no hotel-role locations yet', async () => {
    const user = userEvent.setup()
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={[]}
        onSubmit={() => {}}
      />,
    )

    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')

    const picker = screen.getByLabelText(/^hotel$/i) as HTMLSelectElement
    expect(picker).toBeDisabled()
    expect(
      screen.getByText(/no hotel-role locations yet/i),
    ).toBeInTheDocument()
  })
})

describe('ProductForm — hotel_offering on services (landr-ssrx)', () => {
  it('renders the hotel_offering select only for kind=service', async () => {
    const user = userEvent.setup()
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={[{ id: 'hotel-1', name: 'Hotel Sol' }]}
        onSubmit={() => {}}
      />,
    )

    // Default kind=service → the field is present.
    const offering = screen.getByLabelText(
      /includes accommodation/i,
    ) as HTMLSelectElement
    expect(offering).toBeInTheDocument()
    const options = within(offering).getAllByRole(
      'option',
    ) as HTMLOptionElement[]
    expect(options.map((o) => o.value)).toEqual([
      'none',
      'optional',
      'mandatory',
    ])

    // Switch to hotel_room → the field disappears.
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    expect(
      screen.queryByLabelText(/includes accommodation/i),
    ).not.toBeInTheDocument()
  })

  it('submits the chosen hotel_offering on a service product', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service']}
        hotelLocations={[]}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )

    await user.type(screen.getByLabelText(/^name$/i), 'Guided Dive')
    await user.selectOptions(
      screen.getByLabelText(/includes accommodation/i),
      'optional',
    )

    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'service',
      hotel_offering: 'optional',
    })
  })
})

// landr-knm0 — capacity_per_unit input visible only for hotel_room.
describe('ProductForm — room capacity (landr-knm0)', () => {
  const hotelLocations = [{ id: 'hotel-1', name: 'Hotel Sol' }]

  it('does NOT render the room capacity input for kind=service', () => {
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={() => {}}
      />,
    )
    expect(
      screen.queryByLabelText(/room capacity \(people\)/i),
    ).not.toBeInTheDocument()
  })

  it('renders the capacity input when switching to kind=hotel_room', async () => {
    const user = userEvent.setup()
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={() => {}}
      />,
    )
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    expect(
      screen.getByLabelText(/room capacity \(people\)/i),
    ).toBeInTheDocument()
  })

  it('suggests capacity=2 when the name contains "double"', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )
    // Type a name first so the kind-switch effect can use it for the
    // heuristic.
    await user.type(screen.getByLabelText(/^name$/i), 'Double Room')
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')

    const capacity = screen.getByLabelText(
      /room capacity \(people\)/i,
    ) as HTMLInputElement
    expect(capacity.value).toBe('2')

    await user.selectOptions(screen.getByLabelText(/^hotel$/i), 'hotel-1')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'hotel_room',
      capacity_per_unit: 2,
    })
  })

  it('defaults capacity to 1 when the name has no recognisable token', async () => {
    const user = userEvent.setup()
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={() => {}}
      />,
    )
    // No name typed; switch kind → defaults to 1.
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    const capacity = screen.getByLabelText(
      /room capacity \(people\)/i,
    ) as HTMLInputElement
    expect(capacity.value).toBe('1')
  })

  it('blocks submit on capacity=0 (DB CHECK mirror)', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    await user.type(screen.getByLabelText(/^name$/i), 'Test Room')
    await user.selectOptions(screen.getByLabelText(/^hotel$/i), 'hotel-1')

    const capacity = screen.getByLabelText(
      /room capacity \(people\)/i,
    ) as HTMLInputElement
    await user.clear(capacity)
    await user.type(capacity, '0')

    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(0)
    const messages = await screen.findAllByText(
      /room capacity must be at least 1/i,
    )
    const messageNode = messages.find(
      (n) => n.getAttribute('data-slot') === 'form-message',
    )
    expect(messageNode).toBeDefined()
  })

  it('collapses capacity to null when kind switches away from hotel_room', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    // Capacity input now visible with default value '1'. Switch back to
    // service and submit.
    await user.selectOptions(kind, 'service')
    expect(
      screen.queryByLabelText(/room capacity \(people\)/i),
    ).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^name$/i), 'Tandem Flight')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'service',
      capacity_per_unit: null,
    })
  })

  // landr-8bq9 — DATA-LOSS GUARD: flipping product_kind to peek at another
  // branch and flipping back must NOT wipe operator-edited values. Before
  // the fix, the kind-switch useEffect unconditionally cleared
  // capacity_per_unit, hotel_location_id, and hotel_offering when leaving
  // (or re-entering) hotel_room — so a curious operator lost their work.
  it('preserves operator-edited capacity_per_unit across a kind round trip (landr-8bq9)', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )

    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.type(screen.getByLabelText(/^name$/i), 'Suite Royale')
    await user.selectOptions(kind, 'hotel_room')

    const capacity = screen.getByLabelText(
      /room capacity \(people\)/i,
    ) as HTMLInputElement
    await user.clear(capacity)
    await user.type(capacity, '5')
    await user.selectOptions(screen.getByLabelText(/^hotel$/i), 'hotel-1')

    // Peek at service, then flip back. The operator-edited 5 must survive.
    await user.selectOptions(kind, 'service')
    await user.selectOptions(kind, 'hotel_room')

    const capacityAfter = screen.getByLabelText(
      /room capacity \(people\)/i,
    ) as HTMLInputElement
    expect(capacityAfter.value).toBe('5')

    // hotel_location_id also preserved (the picker re-renders on re-entry).
    const hotelPicker = screen.getByLabelText(/^hotel$/i) as HTMLSelectElement
    expect(hotelPicker.value).toBe('hotel-1')

    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'hotel_room',
      capacity_per_unit: 5,
      hotel_location_id: 'hotel-1',
    })
  })

  it('preserves operator-edited hotel_offering across a service → hotel_room → service round trip (landr-8bq9)', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )

    await user.type(screen.getByLabelText(/^name$/i), 'Guided Dive')
    await user.selectOptions(
      screen.getByLabelText(/includes accommodation/i),
      'optional',
    )

    // Peek at hotel_room, then flip back to service.
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    await user.selectOptions(kind, 'service')

    const offering = screen.getByLabelText(
      /includes accommodation/i,
    ) as HTMLSelectElement
    expect(offering.value).toBe('optional')

    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'service',
      hotel_offering: 'optional',
    })
  })
})

// landr-c53m.4 — includes_breakfast checkbox visible only for hotel_room.
// It has no seeded default in the form and drives booking-email branching
// (landr-api booking_emails.py), not any DB CHECK, so there's no
// validation-error case to mirror from capacity_per_unit.
describe('ProductForm — includes breakfast (landr-c53m.4)', () => {
  const hotelLocations = [{ id: 'hotel-1', name: 'Hotel Sol' }]

  it('does NOT render the includes-breakfast checkbox for kind=service', () => {
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={() => {}}
      />,
    )
    expect(
      screen.queryByLabelText(/includes breakfast/i),
    ).not.toBeInTheDocument()
  })

  it('renders the includes-breakfast checkbox when switching to kind=hotel_room, unchecked by default', async () => {
    const user = userEvent.setup()
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={() => {}}
      />,
    )
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    const breakfast = screen.getByLabelText(
      /includes breakfast/i,
    ) as HTMLInputElement
    expect(breakfast).toBeInTheDocument()
    expect(breakfast.checked).toBe(false)
  })

  it('submits includes_breakfast=true when checked on a hotel_room product', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )
    await user.type(screen.getByLabelText(/^name$/i), 'Double Room')
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'hotel_room')
    await user.selectOptions(screen.getByLabelText(/^hotel$/i), 'hotel-1')
    await user.click(screen.getByLabelText(/includes breakfast/i))
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'hotel_room',
      includes_breakfast: true,
    })
  })

  it('loads includes_breakfast=true from an existing hotel_room product', () => {
    const product: ProductRow = {
      id: 'p-room',
      operator_id: 'op-1',
      product_group_id: null,
      slug: 'double-room',
      name: 'Double Room',
      name_localized: null,
      short_description: null,
      short_description_localized: null,
      description: null,
      product_kind: 'hotel_room',
      service_time_shape: null,
      is_contiguous: false,
      duration_minutes: null,
      fixed_start_date: null,
      fixed_end_date: null,
      default_pricing_scheme_id: null,
      needs_provider: false,
      needs_pickup: false,
      revenue_flows_through_operator: false,
      is_publicly_listed: true,
      active: true,
      sort_order: 0,
      hotel_location_id: 'hotel-1',
      hotel_offering: 'none',
      is_addon_only: false,
      capacity_per_unit: 2,
      includes_breakfast: true,
      deleted_at: null,
      created_at: '2026-05-20T10:00:00Z',
      updated_at: '2026-05-20T10:00:00Z',
      pricing_scheme: null,
      product_group: null,
      hotel_location: null,
    }
    render(
      <ProductForm
        product={product}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={() => {}}
      />,
    )
    const breakfast = screen.getByLabelText(
      /includes breakfast/i,
    ) as HTMLInputElement
    expect(breakfast.checked).toBe(true)
  })

  it('collapses includes_breakfast to false when kind switches away from hotel_room', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    const product: ProductRow = {
      id: 'p-room',
      operator_id: 'op-1',
      product_group_id: null,
      slug: 'double-room',
      name: 'Double Room',
      name_localized: null,
      short_description: null,
      short_description_localized: null,
      description: null,
      product_kind: 'hotel_room',
      service_time_shape: null,
      is_contiguous: false,
      duration_minutes: null,
      fixed_start_date: null,
      fixed_end_date: null,
      default_pricing_scheme_id: null,
      needs_provider: false,
      needs_pickup: false,
      revenue_flows_through_operator: false,
      is_publicly_listed: true,
      active: true,
      sort_order: 0,
      hotel_location_id: 'hotel-1',
      hotel_offering: 'none',
      is_addon_only: false,
      capacity_per_unit: 2,
      includes_breakfast: true,
      deleted_at: null,
      created_at: '2026-05-20T10:00:00Z',
      updated_at: '2026-05-20T10:00:00Z',
      pricing_scheme: null,
      product_group: null,
      hotel_location: null,
    }
    render(
      <ProductForm
        product={product}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service', 'hotel_room']}
        hotelLocations={hotelLocations}
        onSubmit={(v) => {
          submitted.push(v)
        }}
      />,
    )
    const kind = screen.getByLabelText(/product kind/i) as HTMLSelectElement
    await user.selectOptions(kind, 'service')
    expect(
      screen.queryByLabelText(/includes breakfast/i),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      product_kind: 'service',
      includes_breakfast: false,
    })
  })
})

// landr-u34k — is_addon_only checkbox + Add-ons section gating. The
// section is hidden when allProducts is omitted (covers the default test
// setup above + the wizard/legacy callers that don't pass it). When passed
// it appears for EXISTING products but renders a "Save first" hint for new.
describe('ProductForm — addon-only flag + add-ons section (landr-u34k)', () => {
  function makeProduct(): import('@/lib/products').ProductRow {
    return {
      id: 'p-parent',
      operator_id: 'op-1',
      product_group_id: null,
      slug: 'tandem-flight',
      name: 'Tandem Flight',
      name_localized: null,
      short_description: null,
      short_description_localized: null,
      description: null,
      product_kind: 'service',
      service_time_shape: 'days_range',
      is_contiguous: false,
      duration_minutes: null,
      fixed_start_date: null,
      fixed_end_date: null,
      default_pricing_scheme_id: null,
      needs_provider: false,
      needs_pickup: false,
      revenue_flows_through_operator: true,
      is_publicly_listed: true,
      active: true,
      sort_order: 0,
      hotel_location_id: null,
      hotel_offering: 'none',
      is_addon_only: false,
      capacity_per_unit: null,
      includes_breakfast: false,
      deleted_at: null,
      created_at: '2026-05-20T10:00:00Z',
      updated_at: '2026-05-20T10:00:00Z',
      pricing_scheme: null,
      product_group: null,
      hotel_location: null,
    }
  }

  it('renders the Add-on only checkbox in the flags fieldset and submits the value', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    setup({
      allowedKinds: ['service'],
      onSubmit: (v) => {
        submitted.push(v)
      },
    })

    await user.type(screen.getByLabelText(/^name$/i), 'Breakfast')
    const addonOnly = screen.getByLabelText(/add-on only/i)
    expect(addonOnly).toBeInTheDocument()
    await user.click(addonOnly)
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      name: 'Breakfast',
      is_addon_only: true,
    })
  })

  it('shows the Save-first hint instead of the section when creating a new product', async () => {
    render(
      <ProductForm
        product={null}
        pricingSchemes={[]}
        productGroups={[]}
        allowedKinds={['service']}
        allProducts={[]}
        operatorId="op-1"
        onSubmit={() => {}}
      />,
    )
    // Two "save first" hints: one for add-ons, one for images (landr-d8rg.9).
    expect(
      screen.getByText(/save this product first to manage its add-ons/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText(/^add-ons$/i),
    ).not.toBeInTheDocument()
  })

  it('renders the Add-ons section for an existing product when allProducts is passed', async () => {
    // QueryClient required for the manager's useQuery call.
    const { QueryClient, QueryClientProvider } = await import(
      '@tanstack/react-query'
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <ProductForm
          product={makeProduct()}
          pricingSchemes={[]}
          productGroups={[]}
          allowedKinds={['service']}
          allProducts={[
            makeProduct(),
            { ...makeProduct(), id: 'p-other', name: 'Video Package' },
          ]}
          operatorId="op-1"
          onSubmit={() => {}}
        />
      </QueryClientProvider>,
    )

    // The Add-ons section heading (CardTitle) is present.
    expect(
      screen.getAllByText(/^add-ons$/i).length,
    ).toBeGreaterThan(0)
    // The Add-on-product picker option list (when we click + Add) would
    // include "Video Package" and exclude the parent itself; the addon
    // manager isn't expanded by default so we just confirm the action
    // button exists.
    expect(
      screen.getByRole('button', { name: /add add-on/i }),
    ).toBeInTheDocument()
  })

  it('hides the section entirely when allProducts is omitted', async () => {
    setup({ allowedKinds: ['service'], product: makeProduct() })
    expect(
      screen.queryByRole('button', { name: /add add-on/i }),
    ).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0].default_pricing_scheme_id).toBeNull()
  })
})

// landr-14s4 — name + short_description are locale-tabbed. The submit value
// must carry name_localized / short_description_localized with empty
// overrides stripped (absent keys) so the widget base-language fallback
// keeps working. The long Markdown description is intentionally NOT
// translatable yet (no widget RPC), so the form exposes no DE tab for it.
describe('ProductForm — localized fields (landr-14s4)', () => {
  function makeServiceProduct(): ProductRow {
    return {
      id: 'p-loc',
      operator_id: 'op-1',
      product_group_id: null,
      slug: 'tandem-flight',
      name: 'Tandem Flight',
      name_localized: null,
      short_description: 'Fly with a pro',
      short_description_localized: null,
      description: null,
      product_kind: 'service',
      service_time_shape: 'single_date',
      is_contiguous: false,
      duration_minutes: null,
      fixed_start_date: null,
      fixed_end_date: null,
      default_pricing_scheme_id: null,
      needs_provider: true,
      needs_pickup: true,
      revenue_flows_through_operator: true,
      is_publicly_listed: true,
      active: true,
      sort_order: 0,
      hotel_location_id: null,
      hotel_offering: 'none',
      is_addon_only: false,
      capacity_per_unit: null,
      includes_breakfast: false,
      deleted_at: null,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      pricing_scheme: null,
      product_group: null,
      hotel_location: null,
    }
  }

  it('submits name_localized + short_description_localized with the DE override', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    setup({
      allowedKinds: ['service'],
      product: makeServiceProduct(),
      onSubmit: (v) => {
        submitted.push(v)
      },
    })

    // Add a DE name override. The name field is the first locale strip.
    const deTabs = screen.getAllByTestId('locale-tab-de')
    await user.click(deTabs[0])
    await user.type(screen.getByTestId('locale-input-de'), 'Tandemflug')

    // Switch the name strip back to base so the short_description DE editor
    // is the only DE input on screen, then add its override.
    await user.click(screen.getAllByTestId('locale-tab-base')[0])
    const shortDeTab = screen.getAllByTestId('locale-tab-de')[1]
    await user.click(shortDeTab)
    await user.type(screen.getByTestId('locale-input-de'), 'Flieg mit Profi')

    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({
      name: 'Tandem Flight',
      name_localized: { de: 'Tandemflug' },
      short_description: 'Fly with a pro',
      short_description_localized: { de: 'Flieg mit Profi' },
    })
  })

  it('seeds null localized maps and never emits empty-string keys', async () => {
    const user = userEvent.setup()
    const submitted: ProductFormSubmitValue[] = []
    setup({
      allowedKinds: ['service'],
      product: makeServiceProduct(),
      onSubmit: (v) => {
        submitted.push(v)
      },
    })

    // No DE overrides touched → both localized maps stay null.
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(submitted).toHaveLength(1)
    expect(submitted[0].name_localized).toBeNull()
    expect(submitted[0].short_description_localized).toBeNull()
  })

  it('does not offer a translation tab for the long Markdown description', () => {
    setup({ allowedKinds: ['service'], product: makeServiceProduct() })
    // name + short_description each contribute one DE tab → exactly two.
    // The long description renders a MarkdownEditor with no locale strip.
    expect(screen.getAllByTestId('locale-tab-de')).toHaveLength(2)
  })
})
