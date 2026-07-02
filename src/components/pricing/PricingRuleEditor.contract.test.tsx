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
// per_participant_tier) go through TierTable, not ParamsEditor, for their
// tier rows (already correct; see TierTable.tsx) — but per_day_base,
// per_streak_tier, and per_total_days_tier ALSO read params.per_participant
// as an opt-in headcount multiplier, which TierTable never rendered
// (landr-c53m.3 fix-forward). See the "tiered-kind per_participant toggle"
// tests below for that contract.

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

import { toast } from 'sonner'
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

  // ---- tiered-kind per_participant toggle (landr-c53m.3) -----------------
  //
  // per_day_base, per_streak_tier, and per_total_days_tier all read
  // params.per_participant as an opt-in headcount multiplier (see
  // landr-api/app/services/pricing.py). The tiered branch renders TierTable
  // instead of ParamsEditor, so this bool was previously unreachable from
  // the UI. Toggling it must still full-replace-PATCH the whole params
  // object, carrying forward every OTHER key already on the row (e.g.
  // per_day_base's amount_per_day) — same full-replace contract as the
  // composite kinds above.

  it('per_day_base (tiered): toggling per_participant preserves other params keys', async () => {
    const rule = makeRule('per_day_base', {
      amount_per_day: 42,
      per_participant: false,
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
    const toggle = screen.getByRole('switch', {
      name: /scale by participant count/i,
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)

    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    const [, , body] = pricingMock.patchRule.mock.calls[0]
    expect(body).toEqual({
      params: { amount_per_day: 42, per_participant: true },
    })
  })

  it('per_streak_tier (tiered): toggling per_participant off preserves tiers + other params, round-trips', async () => {
    // Para42's guided-day per_streak_tier rules seed per_participant=true —
    // this pins the round-trip (on -> off -> on) survives with tiers intact
    // (tiers live on a separate resource/table, untouched by this PATCH;
    // this test only guards the params column itself).
    const rule: PricingRule = {
      ...makeRule('per_streak_tier', { per_participant: true }),
      tiers: [
        {
          id: 'tier-1',
          pricing_rule_id: 'rule-per_streak_tier',
          operator_id: 'op-1',
          threshold_min: 1,
          threshold_max: 2,
          amount_per_unit: 90,
          amount_total: null,
          currency: 'EUR',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ],
    }
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const toggle = screen.getByRole('switch', {
      name: /scale by participant count/i,
    })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(toggle)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    expect(pricingMock.patchRule.mock.calls[0][2]).toEqual({
      params: { per_participant: false },
    })

    fireEvent.click(toggle)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(2))
    expect(pricingMock.patchRule.mock.calls[1][2]).toEqual({
      params: { per_participant: true },
    })

    // Tier row (rendered by TierTable, untouched by the params toggle)
    // is still on screen — the toggle write didn't clobber tiers.
    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
  })

  it('per_total_days_tier (tiered): toggling per_participant preserves tiers + other params, round-trips', async () => {
    // The third engine-consulted kind (_eval_per_total_days_tier also reads
    // params.per_participant) — the earlier round-trip coverage only
    // exercised per_day_base and per_streak_tier; this closes the gap.
    const rule: PricingRule = {
      ...makeRule('per_total_days_tier', {
        per_participant: false,
        rounding: 'up',
      }),
      tiers: [
        {
          id: 'tier-1',
          pricing_rule_id: 'rule-per_total_days_tier',
          operator_id: 'op-1',
          threshold_min: 1,
          threshold_max: 3,
          amount_per_unit: 50,
          amount_total: null,
          currency: 'EUR',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ],
    }
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const toggle = screen.getByRole('switch', {
      name: /scale by participant count/i,
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(1))
    expect(pricingMock.patchRule.mock.calls[0][2]).toEqual({
      params: { per_participant: true, rounding: 'up' },
    })

    fireEvent.click(toggle)
    await waitFor(() => expect(pricingMock.patchRule).toHaveBeenCalledTimes(2))
    expect(pricingMock.patchRule.mock.calls[1][2]).toEqual({
      params: { per_participant: false, rounding: 'up' },
    })

    // Tier row (rendered by TierTable, untouched by the params toggle)
    // is still on screen — the toggle write didn't clobber tiers or the
    // other params key (`rounding`).
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
  })

  it('per_participant_tier: the per_participant toggle is NOT rendered (engine never reads it for this kind)', () => {
    // _eval_per_participant_tier never consults params.per_participant — the
    // rule is already inherently participant-scoped. Rendering the toggle
    // here would be a reachable-but-inert control (phantom config).
    const rule = makeRule('per_participant_tier', { per_participant: true })
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    expect(
      screen.queryByRole('switch', { name: /scale by participant count/i }),
    ).not.toBeInTheDocument()
  })

  // ---- double-submit race + rollback (fix-forward review findings, #356) -

  it('per_day_base: overlapping double-click while a PATCH is in flight fires only ONE PATCH', async () => {
    const rule = makeRule('per_day_base', {
      amount_per_day: 42,
      per_participant: false,
    })
    let resolveFirstPatch!: (value: unknown) => void
    const firstPatch = new Promise((resolve) => {
      resolveFirstPatch = resolve
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
    const toggle = screen.getByRole('switch', {
      name: /scale by participant count/i,
    })

    // Click 1 fires PATCH 1 and stays pending — we do NOT await the PATCH
    // itself (it never resolves until below), only let the isPending flag
    // from TanStack Query's internal notifyManager (a real macrotask, not a
    // React-only re-render) reach the DOM before the second click, exactly
    // as it would for a real user's double-click (input events are always
    // separated by at least one task-queue turn, unlike two `fireEvent`
    // calls in the same synchronous script).
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeDisabled())

    // Click 2 fires while PATCH 1 is still in flight (unresolved) — a real
    // browser refuses to dispatch `click` on a disabled button and jsdom
    // mirrors that, so this must NOT fire a second PATCH.
    fireEvent.click(toggle)

    // Only now does PATCH 1 resolve — after the second click attempt.
    resolveFirstPatch({})

    await waitFor(() => expect(toggle).not.toBeDisabled())
    expect(pricingMock.patchRule).toHaveBeenCalledTimes(1)
  })

  it('per_day_base: a failed PATCH rolls the toggle back and toasts an error', async () => {
    const rule = makeRule('per_day_base', {
      amount_per_day: 42,
      per_participant: false,
    })
    pricingMock.patchRule.mockRejectedValueOnce(new Error('network blip'))
    render(
      <PricingRuleEditor
        rule={rule}
        operatorId="op-1"
        currency="EUR"
        onDeleted={() => {}}
        onRefetch={() => {}}
      />,
    )
    const toggle = screen.getByRole('switch', {
      name: /scale by participant count/i,
    })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    // Optimistic flip is immediate.
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    // Rolled back to the last-known-good (pre-optimistic) value.
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'false'),
    )
  })
})
