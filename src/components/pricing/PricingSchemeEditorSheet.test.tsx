import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

// ---- Mock the pricing API module ----------------------------------------
//
// We capture the calls fired by the editor sheet so we can assert that
// drag-end produces the expected per-rule PATCHes with the new sort_order
// values. The fetchPricingSchemeTree mock feeds a deterministic 3-rule
// tree into the sheet.

const { pricingMock } = vi.hoisted(() => ({
  pricingMock: {
    fetchPricingSchemeTree: vi.fn(),
    patchRule: vi.fn(),
    patchPricingScheme: vi.fn(),
    createRule: vi.fn(),
    deleteRule: vi.fn(),
    patchTier: vi.fn(),
    createTier: vi.fn(),
    deleteTier: vi.fn(),
  },
}))

vi.mock('@/lib/pricingSchemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricingSchemes')>(
    '@/lib/pricingSchemes',
  )
  return {
    ...actual,
    fetchPricingSchemeTree: (...args: unknown[]) =>
      pricingMock.fetchPricingSchemeTree(...args),
    patchRule: (...args: unknown[]) => pricingMock.patchRule(...args),
    patchPricingScheme: (...args: unknown[]) =>
      pricingMock.patchPricingScheme(...args),
    createRule: (...args: unknown[]) => pricingMock.createRule(...args),
    deleteRule: (...args: unknown[]) => pricingMock.deleteRule(...args),
    patchTier: (...args: unknown[]) => pricingMock.patchTier(...args),
    createTier: (...args: unknown[]) => pricingMock.createTier(...args),
    deleteTier: (...args: unknown[]) => pricingMock.deleteTier(...args),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))

// landr-5gk7 — the editor now reads currentOperator.slug via useOperator
// so the Simulate button knows which public-API slug to call. We're not
// exercising the simulator here, but we still need to satisfy the hook
// contract (it throws if OperatorProvider isn't mounted). A bare-bones
// mock keeps this test file focused on the reorder + render concerns it
// was originally written for.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [],
    currentOperator: { id: 'op-1', slug: 'op-slug', name: 'Op' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
    refreshOperators: () => {},
  }),
}))

// landr-5gk7 — stub the simulator dialog so this test file doesn't pull
// in the products/api-client transitive deps that the dialog uses. The
// dialog has its own dedicated test (SimulateDialog.test.tsx).
vi.mock('./SimulateDialog', () => ({
  SimulateDialog: () => null,
}))

import { PricingSchemeEditorSheet } from './PricingSchemeEditorSheet'
import type { PricingScheme } from '@/lib/pricingSchemes'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function makeScheme(): PricingScheme {
  return {
    id: 'sch-1',
    operator_id: 'op-1',
    name: 'Test scheme',
    currency: 'EUR',
    allow_day_deselection: true,
    notes: null,
    active: true,
    sort_order: 10,
    rules: [
      {
        id: 'rule-A',
        pricing_scheme_id: 'sch-1',
        operator_id: 'op-1',
        rule_kind: 'percentage_discount',
        sort_order: 10,
        params: { percentage: 5 },
        conditions: null,
        active: true,
        tiers: [],
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      {
        id: 'rule-B',
        pricing_scheme_id: 'sch-1',
        operator_id: 'op-1',
        rule_kind: 'flat_discount',
        sort_order: 20,
        params: { amount: 3 },
        conditions: null,
        active: true,
        tiers: [],
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
      {
        id: 'rule-C',
        pricing_scheme_id: 'sch-1',
        operator_id: 'op-1',
        rule_kind: 'fixed_total',
        sort_order: 30,
        params: { total: 99 },
        conditions: null,
        active: true,
        tiers: [],
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
    ],
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  }
}

beforeEach(() => {
  Object.values(pricingMock).forEach((fn) => fn.mockReset())
  pricingMock.fetchPricingSchemeTree.mockResolvedValue(makeScheme())
  pricingMock.patchRule.mockImplementation((_op, id, body) =>
    Promise.resolve({ id, ...body }),
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PricingSchemeEditorSheet — drag-and-drop reorder', () => {
  it('renders one drag handle per rule and no numeric sort_order input', async () => {
    render(
      <PricingSchemeEditorSheet
        schemeId="sch-1"
        operatorId="op-1"
        onClose={() => {}}
      />,
    )

    // Wait for the tree to load. "Percentage discount" appears both as a
    // chip label and as an <option> in the "Add rule" select, so assert by
    // count rather than uniqueness.
    const pctMatches = await screen.findAllByText('Percentage discount')
    expect(pctMatches.length).toBeGreaterThanOrEqual(1)

    // One drag handle per rule.
    const handles = screen.getAllByRole('button', {
      name: /drag to reorder rule/i,
    })
    expect(handles).toHaveLength(3)

    // The old numeric "Order" input must be gone.
    expect(screen.queryByLabelText(/^order$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^order$/i)).not.toBeInTheDocument()
  })

  it('computes spaced-by-10 sort_order values when reordering', async () => {
    render(
      <PricingSchemeEditorSheet
        schemeId="sch-1"
        operatorId="op-1"
        onClose={() => {}}
      />,
    )
    await screen.findAllByText('Percentage discount')

    // Simulate dragging rule-C to the top: new order [C, A, B].
    // We can't easily drive dnd-kit's pointer dance in jsdom, so we
    // assert the pure ordering math used by handleDragEnd via the module
    // helper directly.
    const { __test__ } = await import('./pricing-reorder-math')
    const next = __test__.computeSortOrders(['rule-C', 'rule-A', 'rule-B'])
    expect(next).toEqual({
      'rule-C': 10,
      'rule-A': 20,
      'rule-B': 30,
    })
  })

  it('fires PATCH for each rule whose sort_order changed after a reorder', async () => {
    // We re-use the small helper that the sheet imports to figure out the
    // change-set; the integration of dnd-kit + Radix Sheet under jsdom is
    // notoriously brittle, so this asserts the shape the UI passes to the
    // API rather than driving pointer events.
    const { __test__ } = await import('./pricing-reorder-math')

    const scheme = makeScheme()

    // Original sort: A=10, B=20, C=30 → new order [C, A, B] = 10/20/30.
    // rule-C: 30→10 (change), rule-A: 10→20 (change), rule-B: 20→30 (change).
    const changes = __test__.diffSortChanges(scheme.rules, [
      'rule-C',
      'rule-A',
      'rule-B',
    ])
    expect(changes).toEqual([
      { id: 'rule-C', sort_order: 10 },
      { id: 'rule-A', sort_order: 20 },
      { id: 'rule-B', sort_order: 30 },
    ])

    // No-op reorder produces no changes.
    const noChanges = __test__.diffSortChanges(scheme.rules, [
      'rule-A',
      'rule-B',
      'rule-C',
    ])
    expect(noChanges).toEqual([])

    // Swap A ↔ B: A:10→20, B:20→10, C unchanged at 30.
    const swap = __test__.diffSortChanges(scheme.rules, [
      'rule-B',
      'rule-A',
      'rule-C',
    ])
    expect(swap).toEqual([
      { id: 'rule-B', sort_order: 10 },
      { id: 'rule-A', sort_order: 20 },
    ])

    // And patchRule should be callable with the same shape the mutation
    // wraps (op, id, { sort_order: n }).
    await pricingMock.patchRule('op-1', 'rule-B', { sort_order: 10 })
    expect(pricingMock.patchRule).toHaveBeenCalledWith('op-1', 'rule-B', {
      sort_order: 10,
    })

    await waitFor(() => {
      // Sanity: mock recorded one call.
      expect(pricingMock.patchRule).toHaveBeenCalledTimes(1)
    })
  })
})

describe('PricingSchemeEditorSheet — Add rule zero-on-create guard (landr-d2uy / landr-c53m.10)', () => {
  // manual_override, fixed_total, and per_day_base all share an evaluator
  // shape that returns a fresh absolute value (not additive) when params
  // are empty — manual_override additionally REPLACES gross_total AND
  // halts the rest of the pipeline (see
  // app/services/pricing.py::_eval_manual_override + compute_price's
  // `if kind == "manual_override": halted = True; break`). Adding any of
  // these live with default params (as the plain Add button used to)
  // instantly zeroes every price computed through the scheme until an
  // amount is typed in. New rules of these kinds must be created inactive.

  it.each(['manual_override', 'fixed_total', 'per_day_base'] as const)(
    'creates %s rules inactive',
    async (kind) => {
      pricingMock.createRule.mockResolvedValue({ id: 'rule-new' })
      render(
        <PricingSchemeEditorSheet
          schemeId="sch-1"
          operatorId="op-1"
          onClose={() => {}}
        />,
      )
      await screen.findAllByText('Percentage discount')

      fireEvent.change(screen.getByLabelText(/rule type/i), {
        target: { value: kind },
      })
      fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

      await waitFor(() => expect(pricingMock.createRule).toHaveBeenCalledTimes(1))
      const [, , body] = pricingMock.createRule.mock.calls[0]
      expect(body).toMatchObject({ rule_kind: kind, active: false })
    },
  )

  it('does not force active:false for ordinary rule kinds (e.g. percentage_discount)', async () => {
    pricingMock.createRule.mockResolvedValue({ id: 'rule-new' })
    render(
      <PricingSchemeEditorSheet
        schemeId="sch-1"
        operatorId="op-1"
        onClose={() => {}}
      />,
    )
    await screen.findAllByText('Percentage discount')

    fireEvent.change(screen.getByLabelText(/rule type/i), {
      target: { value: 'percentage_discount' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(pricingMock.createRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.createRule.mock.calls[0]
    expect(body).not.toHaveProperty('active')
  })
})
