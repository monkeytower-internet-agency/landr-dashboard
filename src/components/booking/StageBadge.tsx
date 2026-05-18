import type { BookingSemanticState } from '@/lib/bookings'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

type Props = {
  state: BookingSemanticState
  stageCode: string | null
  className?: string
}

const STATE_LABEL: Record<BookingSemanticState, string> = {
  pending: t.bookings.stage.pending,
  awaiting_general_approval: t.bookings.stage.awaitingGeneralApproval,
  awaiting_secondary_approval: t.bookings.stage.awaitingSecondaryApproval,
  awaiting_hotel_approval: t.bookings.stage.awaitingHotelApproval,
  confirmed: t.bookings.stage.confirmed,
  finalised: t.bookings.stage.finalised,
  cancelled: t.bookings.stage.cancelled,
  no_show: t.bookings.stage.noShow,
}

const STATE_TONE: Record<BookingSemanticState, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  awaiting_general_approval:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  awaiting_secondary_approval:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  awaiting_hotel_approval:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  confirmed:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  finalised: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  cancelled: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  no_show: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
}

export function StageBadge({ state, stageCode, className }: Props) {
  const label = STATE_LABEL[state] ?? state
  const tone = STATE_TONE[state] ?? 'bg-muted text-muted-foreground'
  const tooltip = stageCode ? t.bookings.detail.stageTooltip(stageCode) : label
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
      title={tooltip}
      data-state={state}
      data-stage-code={stageCode ?? undefined}
    >
      {label}
    </span>
  )
}
