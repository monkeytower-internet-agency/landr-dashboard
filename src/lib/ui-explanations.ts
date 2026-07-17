// landr-12ux — short plain-English explanations of UI jargon shown as
// shadcn Tooltip content over the components below. The map is keyed by
// (concept, key) so the same string can be reused across pills, headers,
// or filter dropdowns without each call-site re-deriving copy.
//
// Concepts currently surfaced:
//   - bookingStage    — the 5-value `current_semantic_state` enum that
//                       drives StageBadge colors on the Bookings table.
//   - approvalStage   — the three canonical `awaiting_*` stage codes
//                       shown on the Approvals queue (StageChip).
//   - approvalBranch  — `general` vs `secondary` vs `hotel` review roles.
//   - ruleKind        — pricing-rule kinds (per_streak_tier, flat_discount,
//                       …) shown as the rule-header chip in the
//                       PricingSchemeEditorSheet.
//
// Lookup is a plain object access; callers fall back to `null` when no
// entry exists and skip rendering a Tooltip in that case (see
// `tooltipForConcept` below).

export type ExplanationConcept =
  | 'bookingStage'
  | 'approvalStage'
  | 'approvalBranch'
  | 'ruleKind'

export const EXPLANATIONS: Record<ExplanationConcept, Record<string, string>> =
  {
    // Keyed by `current_semantic_state` enum value.
    bookingStage: {
      pending:
        'The booking is created but not yet confirmed — usually awaiting operator approval or customer payment.',
      confirmed:
        'The booking is approved and locked in. The customer (and, where applicable, the hotel) has been notified.',
      finalised:
        'The activity is complete and post-trip steps (final invoice, follow-ups) have run.',
      cancelled:
        'The booking was cancelled. Cancellation emails (if any) were sent at the time of cancellation.',
      no_show:
        'The customer did not show up. The slot was held but never used; revenue policy depends on your terms.',
    },

    // Keyed by stage code (operator-customisable, but the three canonical
    // codes below cover almost every workflow).
    approvalStage: {
      awaiting_general_approval:
        'Waiting on the operator to do the first review of this booking.',
      awaiting_secondary_approval:
        'Operator has approved; now waiting on a second approver (e.g. partner, finance) before it goes to the hotel.',
      awaiting_hotel_approval:
        'Operator has approved; the request is now with the hotel and we are waiting on their confirmation.',
    },

    // Keyed by the three approval-branch buckets used on the Approvals
    // queue stage filter (see APPROVAL_STAGE_BUCKETS in lib/bookings).
    approvalBranch: {
      general:
        'General approval — the operator’s first review of a new booking before it moves further.',
      secondary:
        'Secondary approval — a second internal reviewer (e.g. partner, finance) before the booking is sent on.',
      hotel:
        'Hotel approval — the request is with the hotel and we are waiting on their confirmation.',
    },

    // Keyed by `RuleKind` (see lib/pricingSchemes).
    ruleKind: {
      per_day_base:
        'Base price per day. Tiered by night count, so longer stays can use a different per-night rate.',
      per_streak_tier:
        'Consecutive-day tiers — price per night is picked from the tier matching the booking’s longest consecutive-day streak.',
      per_total_days_tier:
        'Total-days tiers — price per night is picked from the tier matching the total number of nights in the booking.',
      per_participant_tier:
        'Per-participant tiers — price per night is picked from the tier matching the number of participants on the booking.',
      percentage_discount:
        'Percentage discount applied on top of the base price (e.g. 10% off).',
      flat_discount:
        'Flat per-night or per-booking discount subtracted from the base price.',
      fixed_total:
        'Fixed total price for the whole booking — overrides per-night and per-participant pricing.',
      time_of_day_surcharge:
        'Adds a per-day surcharge when the product runs within a configured time-of-day window (e.g. evening slots).',
      manual_override:
        'Manually overrides the computed price with a fixed total, with an optional reason logged for audit — halts all later rules and the voucher path.',
    },
  }

/** Return the explanation string for a (concept, key) pair, or `null` if
 *  no entry exists. Call-sites typically render a Tooltip only when this
 *  returns non-null so unknown / operator-customised keys stay
 *  unannotated rather than showing the raw key as filler. */
export function explanationFor(
  concept: ExplanationConcept,
  key: string | null | undefined,
): string | null {
  if (!key) return null
  return EXPLANATIONS[concept][key] ?? null
}
