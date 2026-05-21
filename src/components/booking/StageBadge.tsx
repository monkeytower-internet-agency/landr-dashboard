import type { BookingSemanticState } from '@/lib/bookings'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { explanationFor } from '@/lib/ui-explanations'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type Props = {
  state: BookingSemanticState
  stageCode: string | null
  className?: string
}

// Labels for the 5 Postgres enum values (semantic state)
const SEMANTIC_STATE_LABEL: Record<BookingSemanticState, string> = {
  pending: t.bookings.stage.pending,
  confirmed: t.bookings.stage.confirmed,
  finalised: t.bookings.stage.finalised,
  cancelled: t.bookings.stage.cancelled,
  no_show: t.bookings.stage.noShow,
}

// Labels for known stage codes (operator-customizable free-text)
const STAGE_CODE_LABEL: Record<string, string> = {
  awaiting_general_approval: t.bookings.stage.awaitingGeneralApproval,
  awaiting_secondary_approval: t.bookings.stage.awaitingSecondaryApproval,
  awaiting_hotel_approval: t.bookings.stage.awaitingHotelApproval,
}

// Color comes from semantic state (the 5 enum values)
const SEMANTIC_STATE_TONE: Record<BookingSemanticState, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  confirmed:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  finalised: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  cancelled: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  no_show: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

export function StageBadge({ state, stageCode, className }: Props) {
  const label =
    (stageCode ? STAGE_CODE_LABEL[stageCode] : null) ??
    SEMANTIC_STATE_LABEL[state] ??
    stageCode ??
    state
  const tone = SEMANTIC_STATE_TONE[state] ?? 'bg-muted text-muted-foreground'

  // landr-12ux — prefer the rich (concept, key) explanation: stage codes
  // are the operator-customisable text (e.g. 'awaiting_hotel_approval'),
  // semantic_state is the 5-value enum that drives color. Fall back to
  // the existing `Stage: <code>` debug string when neither lookup hits,
  // so unknown operator-defined stages still get a discoverable title.
  const stageExplanation = explanationFor('approvalStage', stageCode)
  const semanticExplanation = explanationFor('bookingStage', state)
  const explanation = stageExplanation ?? semanticExplanation
  const titleFallback = stageCode
    ? t.bookings.detail.stageTooltip(stageCode)
    : label

  const pill = (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
      // landr-12ux — keep the native title for keyboard / a11y users and
      // for the existing tests that assert the raw stage code is
      // surfaced via `title`.
      title={explanation ?? titleFallback}
      data-state={state}
      data-stage-code={stageCode ?? undefined}
    >
      {label}
    </span>
  )

  if (!explanation) return pill

  // landr-12ux — wrap the pill in an inline-flex span so Radix Tooltip
  // owns the trigger element's data-state (open/closed) without
  // overwriting the pill's semantic `data-state` attribute that the
  // bookings table styling and tests rely on.
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{pill}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-balance">
          {explanation}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
