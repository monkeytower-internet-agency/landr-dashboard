import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

// landr-d2uy — PRICING BUG POSTMORTEM: the engine (landr-api/app/services/
// pricing.py) reads fixed strings out of the `pricing_rules.params` jsonb
// column per rule_kind. The dashboard's ParamsEditor read/wrote a DIFFERENT
// key for two of those kinds (fixed_total: `total` vs engine `amount`;
// percentage_discount: `percentage` vs engine `percent`). Because
// `PATCH /pricing-rules/{id}` REPLACES the whole `params` column (see
// staff_pricing.py patch_rule — `sb.table(...).update(updates)`, not a
// jsonb merge), editing the field in the dashboard didn't just fail to
// help — it silently DELETED the engine key, dropping a live price to 0.
//
// This test pins the exact param key set the ParamsEditor WRITES for every
// non-tiered rule_kind, against the engine contract below. If either side
// drifts, this test (or its counterpart on the engine side) should catch
// it before it reaches production data.
//
//   rule_kind              engine reads (pricing.py)      legacy UI alias (read-only fallback)
//   ---------------------  ------------------------------  ------------------------------------
//   fixed_total            amount                           total
//   percentage_discount    percent                          percentage
//   flat_discount          amount                           (none — was always correct)
//   time_of_day_surcharge  window, surcharge_per_day         (none — was unsupported by the UI)
//   manual_override        amount, reason                    (none — was unsupported by the UI)
//
// Tiered kinds (per_day_base, per_streak_tier, per_total_days_tier,
// per_participant_tier) go through TierTable, not ParamsEditor — out of
// scope here (their tier-row shape was already correct; see TierTable.tsx).

const { pricingMock } = vi.hoisted(() => ({
  pricingMock: {
    patchRule: vi.fn(),
    deleteRule: vi.fn(),
  },
}))

vi.mock('@/lib/pricingSchemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricingSchemes')>(
    '@/lib/pricingSchemes',
  )
  return {
    ...actual,
    patchRule: (...args: unknown[]) => pricingMock.patchRule(...args),
    deleteRule: (...args: unknown[]) => pricingMock.deleteRule(...args),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { PricingRuleEditor } from './PricingRuleEditor'
import type { PricingRule, RuleKind } from '@/lib/pricingSchemes'

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

function makeRule(kind: RuleKind, params: Record<string, unknown>): PricingRule {
  return {
    id: `rule-${kind}`,
    pricing_scheme_id: 'sch-1',
    operator_id: 'op-1',
    rule_kind: kind,
    sort_order: 10,
    params,
    conditions: null,
    active: true,
    tiers: [],
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  }
}

beforeEach(() => {
  pricingMock.patchRule.mockReset()
  pricingMock.deleteRule.mockReset()
  pricingMock.patchRule.mockImplementation((_op, id, body) =>
    Promise.resolve({ id, ...body }),
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PricingRuleEditor ParamsEditor — engine params contract', () => {
  it('fixed_total: writes ONLY {amount} to the engine, never {total}', async () => {
    const rule = makeRule('fixed_total', { amount: 1200 })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const input = screen.getByLabelText(/fixed total/i)
    fireEvent.change(input, { target: { value: '1500' } })
    fireEvent.blur(input)

    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({ params: { amount: 1500 } })
    expect(body.params).not.toHaveProperty('total')
  })

  it('fixed_total: displays legacy-keyed rows (read back-compat) and re-normalises on save', async () => {
    // Simulates a row corrupted by the pre-fix bug: engine key missing,
    // only the wrong legacy key present. The seeded SIV rule from the bug
    // report is {"amount": 1200} (already correct); this covers rows that
    // were edited through the buggy UI before the fix shipped.
    const rule = makeRule('fixed_total', { total: 1200 })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const input = screen.getByLabelText(/fixed total/i) as HTMLInputElement
    // The 1200 EUR SIV price must be VISIBLE, not render as 0.
    expect(input.value).toBe('1200')

    fireEvent.change(input, { target: { value: '1200' } })
    fireEvent.blur(input)
    // No-op edit (same value) — should not fire a patch.
    expect(pricingMock.patchRule).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '1300' } })
    fireEvent.blur(input)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({ params: { amount: 1300 } })
    expect(body.params).not.toHaveProperty('total')
  })

  it('percentage_discount: writes ONLY {percent} to the engine, never {percentage}', async () => {
    const rule = makeRule('percentage_discount', { percent: 10 })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const input = screen.getByLabelText(/percentage/i)
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)

    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({ params: { percent: 15 } })
    expect(body.params).not.toHaveProperty('percentage')
  })

  it('percentage_discount: displays legacy-keyed rows and re-normalises on save', async () => {
    const rule = makeRule('percentage_discount', { percentage: 10 })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const input = screen.getByLabelText(/percentage/i) as HTMLInputElement
    expect(input.value).toBe('10')

    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.blur(input)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({ params: { percent: 20 } })
    expect(body.params).not.toHaveProperty('percentage')
  })

  it('flat_discount: writes {amount} (was already correct; guards against regression)', async () => {
    const rule = makeRule('flat_discount', { amount: 5 })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const input = screen.getByLabelText(/discount amount/i)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.blur(input)

    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({ params: { amount: 7 } })
  })

  it('time_of_day_surcharge: writes {window, surcharge_per_day} together (full-replace PATCH)', async () => {
    // The API PATCH replaces the whole params column (no jsonb merge), so
    // editing just one of the two fields must still send BOTH keys or the
    // untouched field is silently dropped from the row.
    const rule = makeRule('time_of_day_surcharge', {
      window: '18:00-22:00',
      surcharge_per_day: 10,
    })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const surchargeInput = screen.getByLabelText(/surcharge \/ day/i)
    fireEvent.change(surchargeInput, { target: { value: '15' } })
    fireEvent.blur(surchargeInput)

    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({
      params: { window: '18:00-22:00', surcharge_per_day: 15 },
    })
  })

  it('manual_override: writes {amount, reason} together (full-replace PATCH)', async () => {
    const rule = makeRule('manual_override', { amount: 1200, reason: 'VIP comp' })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const amountInput = screen.getByLabelText(/override total/i)
    fireEvent.change(amountInput, { target: { value: '1000' } })
    fireEvent.blur(amountInput)

    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({ params: { amount: 1000, reason: 'VIP comp' } })
  })

  // ---- composite two-field race regression (landr-d2uy fix-forward) -----
  //
  // rule.params only refreshes once the PATCH's onSuccess -> onRefetch
  // round-trip resolves. Before the fix, editing field A then field B
  // BEFORE that round-trip resolved composed PATCH 2 from field A's STALE
  // pre-edit value (read straight off the `rule` prop) instead of the
  // value PATCH 1 actually just sent — silently reverting field A on save,
  // because the API PATCH replaces the whole params jsonb column. These
  // tests never resolve PATCH 1, modelling "blur field B before the
  // refetch delivers new props" exactly.

  it('time_of_day_surcharge: editing window then surcharge before PATCH 1 resolves keeps window (race regression)', async () => {
    const rule = makeRule('time_of_day_surcharge', {
      window: '18:00-22:00',
      surcharge_per_day: 10,
    })
    const firstPatch = new Promise(() => {
      /* never resolves — PATCH 1 stays in flight for the whole test */
    })
    pricingMock.patchRule.mockImplementationOnce(() => firstPatch)
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const windowInput = screen.getByLabelText(/window/i)
    const surchargeInput = screen.getByLabelText(/surcharge \/ day/i)

    // Field A: edit + blur -> PATCH 1 fires and stays pending.
    fireEvent.change(windowInput, { target: { value: '09:00-12:00' } })
    fireEvent.blur(windowInput)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))

    // Field B: edit + blur BEFORE PATCH 1's refetch ever delivers new props.
    fireEvent.change(surchargeInput, { target: { value: '20' } })
    fireEvent.blur(surchargeInput)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(2))

    const [, , body2] = pricingMock.patchRule.mock.calls[1]
    // PATCH 2 must carry field A's NEW value, not the stale prop value.
    expect(body2).toEqual({
      params: { window: '09:00-12:00', surcharge_per_day: 20 },
    })
  })

  it('manual_override: editing amount then reason before PATCH 1 resolves keeps amount (race regression)', async () => {
    const rule = makeRule('manual_override', { amount: 1200, reason: 'VIP comp' })
    const firstPatch = new Promise(() => {
      /* never resolves — PATCH 1 stays in flight for the whole test */
    })
    pricingMock.patchRule.mockImplementationOnce(() => firstPatch)
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const amountInput = screen.getByLabelText(/override total/i)
    const reasonInput = screen.getByLabelText(/reason/i)

    // Field A: edit + blur -> PATCH 1 fires and stays pending.
    fireEvent.change(amountInput, { target: { value: '999' } })
    fireEvent.blur(amountInput)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))

    // Field B: edit + blur BEFORE PATCH 1's refetch ever delivers new props.
    fireEvent.change(reasonInput, { target: { value: 'Updated reason' } })
    fireEvent.blur(reasonInput)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(2))

    const [, , body2] = pricingMock.patchRule.mock.calls[1]
    // PATCH 2 must carry field A's NEW value, not the stale prop value.
    expect(body2).toEqual({
      params: { amount: 999, reason: 'Updated reason' },
    })
  })
})
