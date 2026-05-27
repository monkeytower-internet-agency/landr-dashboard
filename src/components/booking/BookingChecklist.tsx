// landr-84n1 / landr-r87i — operator-facing per-booking checklist.
// v1 (84n1) stored every default + done flag + custom in localStorage.
// v2 (r87i) fetches the DEFAULT item set from the operator's server-side
// template (operator_checklist_templates) so each operator can curate
// their own seed list via Settings -> Operations. Per-booking done flags
// + custom items continue to live in localStorage. See
// lib/booking-checklist.ts for the storage contract and
// lib/checklistTemplate.ts for the server fetch.

import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import {
  DEFAULT_CHECKLIST_ITEMS,
  useBookingChecklist,
  type ChecklistTemplateItem,
} from '@/lib/booking-checklist'
import {
  useChecklistTemplate,
  wireItemsToTemplate,
} from '@/lib/checklistTemplate'

type Props = {
  bookingId: string
  /**
   * Operator-tenant id. When null the checklist still renders (so the UI
   * is testable in isolation) but does not persist — the convention
   * matches useCalendarView's null-handling.
   */
  operatorId: string | null
}

export function BookingChecklist({ bookingId, operatorId }: Props) {
  // landr-r87i — fetch the operator's server-side template. While the
  // query is in-flight (or when no operator is signed in) we fall back
  // to the hardcoded V1 defaults so the UI never flashes empty. The
  // server's _V1_DEFAULTS match these ids, so done flags survive the
  // swap from fallback to fetched.
  const { data: templateData } = useChecklistTemplate(operatorId)
  const template: ReadonlyArray<ChecklistTemplateItem> = useMemo(
    () =>
      templateData
        ? wireItemsToTemplate(templateData.items)
        : DEFAULT_CHECKLIST_ITEMS,
    [templateData],
  )

  const { state, progress, toggle, addCustom, removeCustom } =
    useBookingChecklist(operatorId, bookingId, template)
  const [draft, setDraft] = useState('')

  const submitDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    addCustom(trimmed)
    setDraft('')
  }

  const pct = progress.total === 0 ? 0 : (progress.done / progress.total) * 100

  return (
    <div className="flex flex-col gap-4">
      {/* Progress bar. Native <progress> would be tempting but the design
          system uses Tailwind for everything else and shadcn/ui ships no
          progress primitive yet — a styled div pair is the lightest
          equivalent and stays consistent with StageBadge / DayChips. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            {t.bookings.checklist.tabChecklist}
          </span>
          <span
            className="text-sm font-medium"
            data-testid="booking-checklist-progress"
            aria-label={t.bookings.checklist.progressAria(
              progress.done,
              progress.total,
            )}
          >
            {t.bookings.checklist.progress(progress.done, progress.total)}
          </span>
        </div>
        <div
          className="bg-muted relative h-2 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
        >
          <div
            className="bg-primary h-full rounded-full transition-[width]"
            style={{ width: `${pct}%` }}
            data-testid="booking-checklist-bar"
          />
        </div>
      </div>

      {/* Items */}
      {state.items.length === 0 ? (
        <p className="text-muted-foreground text-xs italic">
          {t.bookings.checklist.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" role="list">
          {state.items.map((item) => {
            const checkboxId = `bk-checklist-${item.id}`
            return (
              <li
                key={item.id}
                className="hover:bg-accent/40 group flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <Checkbox
                  id={checkboxId}
                  checked={item.done}
                  onChange={() => toggle(item.id)}
                  aria-label={t.bookings.checklist.itemAria(item.label)}
                  data-testid={`booking-checklist-checkbox-${item.id}`}
                />
                <label
                  htmlFor={checkboxId}
                  className={cn(
                    'flex-1 cursor-pointer select-none text-sm',
                    item.done && 'text-muted-foreground line-through',
                  )}
                >
                  {item.label}
                </label>
                {item.custom ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => removeCustom(item.id)}
                    aria-label={t.bookings.checklist.removeAria(item.label)}
                    data-testid={`booking-checklist-remove-${item.id}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {/* Inline add textbox. Enter submits; the explicit Add button keeps
          mouse-only operators on the same flow. */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submitDraft()
        }}
        aria-label={t.bookings.checklist.addAria}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.bookings.checklist.addPlaceholder}
          aria-label={t.bookings.checklist.addAria}
          data-testid="booking-checklist-add-input"
        />
        <Button
          type="submit"
          disabled={draft.trim().length === 0}
          data-testid="booking-checklist-add-submit"
        >
          {t.bookings.checklist.addAction}
        </Button>
      </form>

      <p className="text-muted-foreground text-xs italic">
        {t.bookings.checklist.footnote}
      </p>
    </div>
  )
}
