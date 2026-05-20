import type { PricingRule } from '@/lib/pricingSchemes'

/**
 * Pure helpers backing the drag-and-drop reorder flow in
 * PricingSchemeEditorSheet. Kept in their own module so they can be
 * exercised by unit tests without spinning up the full Radix-Sheet +
 * @dnd-kit machinery (which is unfriendly to jsdom).
 */

/**
 * Spaced-by-10 sort_order values for an ordered list of rule ids.
 * Gaps make future inserts cheap: a new rule at the end just claims
 * `max + 10` without renumbering the rest.
 */
export function computeSortOrders(
  orderedIds: string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  orderedIds.forEach((id, idx) => {
    out[id] = (idx + 1) * 10
  })
  return out
}

/**
 * Given the server's current rules and a desired new order (by id),
 * return the minimal set of {id, sort_order} patches that need to be
 * fired — i.e. only rules whose new sort_order differs from their
 * current value. Rules in the desired order that don't exist in the
 * current set are skipped.
 */
export function diffSortChanges(
  currentRules: Pick<PricingRule, 'id' | 'sort_order'>[],
  newOrder: string[],
): { id: string; sort_order: number }[] {
  const next = computeSortOrders(newOrder)
  const byId = new Map(currentRules.map((r) => [r.id, r]))
  const out: { id: string; sort_order: number }[] = []
  for (const id of newOrder) {
    const rule = byId.get(id)
    if (!rule) continue
    const target = next[id]
    if (target !== rule.sort_order) out.push({ id, sort_order: target })
  }
  return out
}

/** Test-only namespace so tests can opt into the helpers explicitly. */
export const __test__ = {
  computeSortOrders,
  diffSortChanges,
}
