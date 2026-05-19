import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

type ChannelHandle = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

type ProductFixture = {
  id: string
  operator_id: string
  product_group_id: string | null
  slug: string
  name: string
  short_description: string | null
  description: string | null
  duration_kind: 'single_days_range' | 'fixed_date_range' | 'time_slot'
  duration_minutes: number | null
  fixed_start_date: string | null
  fixed_end_date: string | null
  default_pricing_scheme_id: string | null
  needs_provider: boolean
  needs_pickup: boolean
  revenue_flows_through_operator: boolean
  is_publicly_listed: boolean
  active: boolean
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
  pricing_scheme: { id: string; name: string; currency: string } | null
  product_group: { id: string; name: string; slug: string } | null
}

const { mock } = vi.hoisted(() => {
  type Row = ProductFixture
  const state = {
    products: [] as Row[],
    pricingSchemes: [] as Array<{
      id: string
      name: string
      currency: string
      active: boolean
    }>,
    productGroups: [] as Array<{ id: string; name: string; slug: string }>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  }

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation(() => channel)

  function makeBuilder(table: string) {
    type Builder = Record<string, unknown> & {
      _table: string
      _filters: Array<{ col: string; op: string; value: unknown }>
      _updatePayload?: Record<string, unknown>
      _insertPayload?: Record<string, unknown>
      _singleAfter?: 'insert' | 'update'
      then: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
      ) => Promise<unknown>
    }
    const builder = {
      _table: table,
      _filters: [],
      _updatePayload: undefined,
      _insertPayload: undefined,
      _singleAfter: undefined,
    } as unknown as Builder

    const list = () => {
      if (table === 'products') return state.products
      if (table === 'pricing_schemes') return state.pricingSchemes
      if (table === 'product_groups') return state.productGroups
      return []
    }

    Object.assign(builder, {
      select: vi.fn(() => builder),
      insert: vi.fn((payload: Record<string, unknown>) => {
        builder._insertPayload = payload
        state.inserts.push(payload)
        return builder
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        builder._updatePayload = payload
        return builder
      }),
      eq: vi.fn((col: string, value: unknown) => {
        builder._filters.push({ col, op: 'eq', value })
        return builder
      }),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: list(), error: null })),
      single: vi.fn(async () => {
        if (builder._insertPayload && table === 'products') {
          const payload = builder._insertPayload as Record<string, unknown>
          const created: ProductFixture = {
            id: `p-new-${state.products.length + 1}`,
            operator_id: payload.operator_id as string,
            product_group_id: (payload.product_group_id as string | null) ?? null,
            slug: payload.slug as string,
            name: payload.name as string,
            short_description:
              (payload.short_description as string | null) ?? null,
            description: (payload.description as string | null) ?? null,
            duration_kind: payload.duration_kind as
              | 'single_days_range'
              | 'fixed_date_range'
              | 'time_slot',
            duration_minutes:
              (payload.duration_minutes as number | null) ?? null,
            fixed_start_date:
              (payload.fixed_start_date as string | null) ?? null,
            fixed_end_date: (payload.fixed_end_date as string | null) ?? null,
            default_pricing_scheme_id:
              (payload.default_pricing_scheme_id as string | null) ?? null,
            needs_provider: payload.needs_provider as boolean,
            needs_pickup: payload.needs_pickup as boolean,
            revenue_flows_through_operator:
              payload.revenue_flows_through_operator as boolean,
            is_publicly_listed: payload.is_publicly_listed as boolean,
            active: payload.active as boolean,
            sort_order: (payload.sort_order as number) ?? 0,
            deleted_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            pricing_scheme: null,
            product_group: null,
          }
          state.products = [created, ...state.products]
          return { data: created, error: null }
        }
        if (builder._updatePayload && table === 'products') {
          const idFilter = builder._filters.find(
            (f) => f.col === 'id' && f.op === 'eq',
          )
          const id = idFilter?.value as string
          state.updates.push({ id, payload: builder._updatePayload })
          const idx = state.products.findIndex((p) => p.id === id)
          if (idx >= 0) {
            state.products[idx] = {
              ...state.products[idx],
              ...builder._updatePayload,
            } as ProductFixture
          }
          return { data: state.products[idx] ?? null, error: null }
        }
        return { data: null, error: null }
      }),
      then(resolve) {
        // Used for queries that don't terminate with limit/single (e.g.
        // pricing_schemes / product_groups + plain update on delete).
        if (builder._updatePayload && table === 'products') {
          const idFilter = builder._filters.find(
            (f) => f.col === 'id' && f.op === 'eq',
          )
          const id = idFilter?.value as string
          state.updates.push({ id, payload: builder._updatePayload })
          if (builder._updatePayload.deleted_at) {
            state.products = state.products.filter((p) => p.id !== id)
          }
          return Promise.resolve(resolve({ data: null, error: null }))
        }
        return Promise.resolve(resolve({ data: list(), error: null }))
      },
    } satisfies Partial<Builder>)
    return builder
  }

  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }
  return { mock: { state, supabase, channel } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

import { Products } from './Products'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

function makeProduct(over: Partial<ProductFixture> = {}): ProductFixture {
  return {
    id: 'p-1',
    operator_id: 'op-1',
    product_group_id: null,
    slug: 'tandem-flight',
    name: 'Tandem Flight',
    short_description: 'Fly with a pro',
    description: null,
    duration_kind: 'single_days_range',
    duration_minutes: null,
    fixed_start_date: null,
    fixed_end_date: null,
    default_pricing_scheme_id: null,
    needs_provider: true,
    needs_pickup: true,
    revenue_flows_through_operator: true,
    is_publicly_listed: false,
    active: true,
    sort_order: 0,
    deleted_at: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    pricing_scheme: null,
    product_group: null,
    ...over,
  }
}

beforeEach(() => {
  mock.state.products = []
  mock.state.pricingSchemes = [
    { id: 'ps-1', name: 'Standard', currency: 'EUR', active: true },
  ]
  mock.state.productGroups = [
    { id: 'pg-1', name: 'Flights', slug: 'flights' },
  ]
  mock.state.inserts = []
  mock.state.updates = []
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Products route', () => {
  it('renders the list and auto-selects the first product', async () => {
    mock.state.products = [
      makeProduct({ id: 'p-1', name: 'Tandem Flight' }),
      makeProduct({ id: 'p-2', name: 'Solo Course', slug: 'solo-course' }),
    ]
    render(<Products />)

    await screen.findByRole('option', { name: /Tandem Flight/i })
    expect(
      screen.getByRole('option', { name: /Solo Course/i }),
    ).toBeInTheDocument()

    // The auto-selected product appears as the form heading + has its name
    // pre-filled in the Name input.
    const nameInput = (await screen.findByLabelText(
      /^Name$/i,
    )) as HTMLInputElement
    expect(nameInput.value).toBe('Tandem Flight')
  })

  it('creates a new product via the form', async () => {
    mock.state.products = [makeProduct({ id: 'p-1', name: 'Existing' })]

    const user = userEvent.setup()
    render(<Products />)

    await screen.findByRole('option', { name: /Existing/i })
    await user.click(screen.getByRole('button', { name: /new product/i }))

    // Form is now in "create" mode — Name is empty.
    const nameInput = (await screen.findByLabelText(
      /^Name$/i,
    )) as HTMLInputElement
    expect(nameInput.value).toBe('')

    await user.type(nameInput, 'Beginner Kayak')
    // Slug should auto-fill from the name.
    const slugInput = screen.getByLabelText(/slug/i) as HTMLInputElement
    expect(slugInput.value).toBe('beginner-kayak')

    await user.click(screen.getByRole('button', { name: /create product/i }))

    await waitFor(() => {
      expect(mock.state.inserts.length).toBe(1)
    })
    expect(mock.state.inserts[0]).toMatchObject({
      operator_id: 'op-1',
      name: 'Beginner Kayak',
      slug: 'beginner-kayak',
      duration_kind: 'single_days_range',
      active: true,
    })

    // The list now shows the new product.
    await screen.findByRole('option', { name: /Beginner Kayak/i })
  })

  it('updates an existing product via the form', async () => {
    mock.state.products = [makeProduct({ id: 'p-1', name: 'Tandem Flight' })]

    const user = userEvent.setup()
    render(<Products />)

    const nameInput = (await screen.findByLabelText(
      /^Name$/i,
    )) as HTMLInputElement
    expect(nameInput.value).toBe('Tandem Flight')

    await user.clear(nameInput)
    await user.type(nameInput, 'Tandem Flight Deluxe')

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mock.state.updates.length).toBeGreaterThanOrEqual(1)
    })
    const lastUpdate = mock.state.updates[mock.state.updates.length - 1]
    expect(lastUpdate.id).toBe('p-1')
    expect(lastUpdate.payload).toMatchObject({
      name: 'Tandem Flight Deluxe',
    })
  })

  it('renders duration-specific fields when time_slot is selected', async () => {
    mock.state.products = [makeProduct({ id: 'p-1', name: 'Tandem Flight' })]

    const user = userEvent.setup()
    render(<Products />)

    await screen.findByLabelText(/^Name$/i)
    const durationSelect = screen.getByLabelText(
      /duration model/i,
    ) as HTMLSelectElement
    await user.selectOptions(durationSelect, 'time_slot')

    expect(screen.getByLabelText(/duration \(minutes\)/i)).toBeInTheDocument()
  })

  it('filters the list by name', async () => {
    mock.state.products = [
      makeProduct({ id: 'p-1', name: 'Tandem Flight' }),
      makeProduct({ id: 'p-2', name: 'Solo Course', slug: 'solo-course' }),
    ]
    const user = userEvent.setup()
    render(<Products />)

    const list = await screen.findByRole('listbox')
    expect(
      within(list).getByRole('option', { name: /Solo Course/i }),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search products/i), 'Solo')
    await waitFor(() =>
      expect(
        within(list).queryByRole('option', { name: /Tandem Flight/i }),
      ).not.toBeInTheDocument(),
    )
    expect(
      within(list).getByRole('option', { name: /Solo Course/i }),
    ).toBeInTheDocument()
  })
})
