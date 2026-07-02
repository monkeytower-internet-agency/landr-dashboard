/**
 * Pricing rule simulator (landr-5gk7).
 *
 * Thin typed wrapper around the public estimate endpoint
 *   POST /api/public/operators/{slug}/products/{product_id}/estimate
 * which is the same endpoint the storefront booking widget calls. We
 * reuse it from Settings → Pricing so operators can preview how rules
 * fire on a dummy booking before they ever go live.
 *
 * Why the public endpoint? The server-side compute is the canonical
 * pricing engine (see landr-xbqh in app/routers/public_operators.py) —
 * routing the simulator through anything else would risk preview/submit
 * drift. The only constraint is that the product must be publicly
 * listed + active; the dialog filters the picker accordingly.
 */
import { apiBase } from '@/lib/api-client'

/**
 * landr-y3oj.3 codegen note: these types are deliberately NOT sourced from
 * the generated `components['schemas']['EstimateRequest'|'EstimateResponse'|
 * 'EstimateLineItem'|'EstimateAppliedRule']` (src/types/api.gen.ts), same
 * conclusion as the booking widget's src/api/types.ts (see its matching
 * comments):
 *   - `EstimateResponse`/`EstimateLineItem` (Python) have
 *     `model_config = {"extra": "allow"}`, so openapi-typescript adds a
 *     `& { [key: string]: unknown }` catch-all and marks fields with
 *     Field(default_factory=...) defaults optional even though the router
 *     always serializes them.
 *   - `paid_to`/`kind` are typed `str` in Python (not `Literal[...]`), so
 *     the generated schema can't narrow them the way `SimulateLineItem`
 *     does.
 *   - `EstimateAppliedRule` (Python) is a strict superset — it also
 *     carries rule_id/before/after/skipped/skipped_reason — while
 *     `SimulateAppliedRule` below only declares the fields the simulator
 *     UI reads; already flagged as a divergence in landr-y3oj.1's handoff.
 * Adopting the generated types as-is would lose the literal-union +
 * required-field guarantees for no behavioural gain. Codegen gaps on the
 * API model side, not something to paper over here.
 */

/** Body sent to POST .../estimate. Mirrors EstimateRequest server-side. */
export type SimulateEstimateRequest = {
  selected_days: string[] // ISO YYYY-MM-DD
  participants_count: number
  addon_lines?: Array<{ product_id: string; qty: number }>
}

/** One line item in the response (the main product, plus any add-ons). */
export type SimulateLineItem = {
  product_id: string
  label: string
  qty: number
  units: number
  unit_price: string // Decimal-as-string, currency-formatted by UI.
  line_total: string
  paid_to: 'operator' | 'hotel'
}

/**
 * One applied-rule trace entry. Mirrors the dict appended by
 * app/services/pricing._apply_rule:
 *   { rule_id, kind, before, after, detail }
 * detail is rule-kind specific (tier match, percentage, etc.); we type
 * it as Record<string, unknown> and let the UI render best-effort.
 */
export type SimulateAppliedRule = {
  rule_id: string
  kind: string
  before: number
  after: number
  detail: Record<string, unknown>
}

export type SimulateEstimateResponse = {
  line_items: SimulateLineItem[]
  operator_total: string
  hotel_total: string
  grand_total: string
  currency: string
  applied_rules: SimulateAppliedRule[]
}

/**
 * Call the public estimator. No auth header is sent: the endpoint is
 * public (it's what the storefront widget hits before the customer has
 * signed in). The dashboard simulator is a read-only preview so the
 * lack of staff-scoped auth is fine.
 *
 * Throws an Error carrying the FastAPI `detail` payload when the
 * server responds non-2xx (e.g. 404 for non-publicly-listed products,
 * 400 for unknown add-ons). UI surfaces the message inline.
 */
export async function simulateEstimate(
  operatorSlug: string,
  productId: string,
  body: SimulateEstimateRequest,
): Promise<SimulateEstimateResponse> {
  const url =
    `${apiBase()}/api/public/operators/${encodeURIComponent(operatorSlug)}` +
    `/products/${encodeURIComponent(productId)}/estimate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selected_days: body.selected_days,
      participants_count: body.participants_count,
      addon_lines: body.addon_lines ?? [],
    }),
  })
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d: unknown) => (d as { detail?: unknown }).detail)
      .catch(() => undefined)
    const msg =
      typeof detail === 'string' ? detail : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return (await res.json()) as SimulateEstimateResponse
}

/**
 * Inclusive list of ISO dates from `startISO` for `count` consecutive
 * days. Used by the simulator's "Start date + N days" input — the
 * simplest UX that covers the common case (a multi-day course or a
 * hotel stay). Date math is done via Date arithmetic in UTC to avoid
 * DST quirks that would shift days when the operator is in a timezone
 * with a transition mid-range.
 *
 * Returns an empty array when count <= 0 or startISO is malformed.
 * Exported (not just used internally) so the dialog tests can drive
 * the same date computation without re-implementing it.
 *
 * landr-y3oj.3: this is now byte-for-byte the same algorithm as
 * landr-mobile's consecutiveDays() (src/features/pricing/lib/pricing-model.ts)
 * — aligned during the contracts-adoption pass after an audit found the two
 * repos had independently-drifted implementations. They still can't be a
 * single shared module — the sub-repos are bare gitlinks with no
 * workspace/publishing mechanism (see the landr-y3oj epic) — codegen would
 * need to ship shared TS *snippets* (not just types) for that; until then,
 * keep both copies manually in sync and keep their unit tests identical.
 */
export function consecutiveDays(startISO: string, count: number): string[] {
  if (count <= 0) return []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return []
  const [y, m, d] = startISO.split('-').map(Number)
  // Date.UTC handles month/day rollover (e.g. Jan 31 + 1 → Feb 1).
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const t = Date.UTC(y, m - 1, d + i)
    const dt = new Date(t)
    const yyyy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    out.push(`${yyyy}-${mm}-${dd}`)
  }
  return out
}

/**
 * Human-readable label for a rule_kind. Mirrors RULE_KIND_LABELS in
 * src/lib/pricingSchemes.ts but adds the engine-internal kinds that
 * the editor doesn't expose (voucher_*, applied after the rule pipeline
 * — see pricing.py). We don't import the editor's map directly so future
 * kinds added on the engine side surface gracefully (fall back to the
 * raw kind string) without requiring a coupled change in the editor enum.
 */
export function ruleKindLabel(kind: string): string {
  const map: Record<string, string> = {
    per_day_base: 'Base price / day',
    per_streak_tier: 'Consecutive-day tier',
    per_total_days_tier: 'Total-days tier',
    per_participant_tier: 'Per-participant tier',
    percentage_discount: 'Percentage discount',
    flat_discount: 'Flat discount',
    fixed_total: 'Fixed total',
    time_of_day_surcharge: 'Time-of-day surcharge',
    manual_override: 'Manual override',
    voucher_percentage: 'Voucher (percentage)',
    voucher_flat: 'Voucher (flat)',
  }
  return map[kind] ?? kind
}
