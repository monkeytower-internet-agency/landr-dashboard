// landr-qmdo — color-coded "Awaiting X" pill rendered per row on the
// Approvals queue.
//
// Color is keyed off the stage code (NOT the semantic_state — every row
// on the Approvals page is `pending` semantically, so a state-driven
// chip would all light up amber). The three canonical codes map to
// distinct hues so the operator can scan the column for "who's blocking":
//   awaiting_general_approval   → blue   "Operator review"
//   awaiting_secondary_approval → purple "Secondary approver"
//   awaiting_hotel_approval     → amber  "Hotel review"
//
// Unknown / operator-customised stage codes fall back to a muted neutral
// pill with a humanised version of the raw code so they still render.
// We deliberately do NOT reuse src/components/booking/StageBadge.tsx —
// that one colors by semantic_state for the bookings table; here we want
// stage-code-driven hues for the Approvals page.

import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

type Props = {
  code: string | null | undefined
  className?: string
}

// Tailwind tone tokens per stage. Kept inline (not in a theme constant)
// so tests can assert against the exact class fragments.
const STAGE_TONE: Record<string, string> = {
  awaiting_general_approval:
    'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  awaiting_secondary_approval:
    'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-300',
  awaiting_hotel_approval:
    'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
}

const FALLBACK_TONE =
  'bg-muted text-muted-foreground'

// Mirrors KNOWN_STAGE_LABELS in src/components/bookings/BookingsFilters.tsx
// (kept in lockstep — both surface the same three canonical stages).
const STAGE_LABEL: Record<string, string> = {
  awaiting_general_approval: t.generalApprovals.filters.stageLabels.general,
  awaiting_secondary_approval:
    t.generalApprovals.filters.stageLabels.secondary,
  awaiting_hotel_approval: t.generalApprovals.filters.stageLabels.hotel,
}

export function StageChip({ code, className }: Props) {
  const label =
    (code ? STAGE_LABEL[code] : null) ??
    (code ? t.bookings.filters.stageFallback(code) : '—')
  const tone = (code ? STAGE_TONE[code] : null) ?? FALLBACK_TONE
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone,
        className,
      )}
      data-stage-code={code ?? undefined}
      title={code ?? undefined}
    >
      {label}
    </span>
  )
}
