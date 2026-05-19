import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ProductForSchedule, SlotTime } from '@/lib/availability'
import { t } from '@/lib/strings'

export type AvailabilityFormSubmit = {
  from: string
  to: string
  capacity: number
  slot_times?: SlotTime[]
  notes?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ProductForSchedule | null
  defaultFrom?: string
  defaultTo?: string
  onSubmit: (payload: AvailabilityFormSubmit) => Promise<void>
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Outer component drives Sheet open-state; the inner body remounts on every
// open transition (via key) so useState seeds from fresh defaults without
// needing a useEffect — same pattern as StaffEditSheet.
export function AvailabilityFormSheet(props: Props) {
  const { open, onOpenChange, product, defaultFrom, defaultTo } = props
  // Bump a counter every time we open so the inner body remounts.
  const [openSeq, setOpenSeq] = useState(0)

  function handleOpenChange(next: boolean) {
    if (next) setOpenSeq((n) => n + 1)
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {open ? (
          <Body
            key={`${openSeq}-${defaultFrom ?? ''}-${defaultTo ?? ''}-${
              product?.id ?? ''
            }`}
            product={product}
            defaultFrom={defaultFrom}
            defaultTo={defaultTo}
            onSubmit={props.onSubmit}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  product: ProductForSchedule | null
  defaultFrom?: string
  defaultTo?: string
  onSubmit: (payload: AvailabilityFormSubmit) => Promise<void>
  onClose: () => void
}

function Body({
  product,
  defaultFrom,
  defaultTo,
  onSubmit,
  onClose,
}: BodyProps) {
  const [fromDate, setFromDate] = useState<string>(defaultFrom ?? todayIso())
  const [toDate, setToDate] = useState<string>(
    defaultTo ?? plusDays(defaultFrom ?? todayIso(), 6),
  )
  const [capacity, setCapacity] = useState<string>('6')
  const [notes, setNotes] = useState('')
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([
    { start: '09:00', end: '11:00' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isTimeSlot = product?.service_time_shape === 'time_slot'

  function addSlot() {
    setSlots((prev) => [...prev, { start: '09:00', end: '11:00' }])
  }

  function removeSlot(idx: number) {
    setSlots((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateSlot(idx: number, field: 'start' | 'end', value: string) {
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    )
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)

    if (!product) {
      setError(t.schedule.formNoProduct)
      return
    }
    if (!fromDate || !toDate) {
      setError(t.schedule.formDatesRequired)
      return
    }
    if (toDate < fromDate) {
      setError(t.schedule.formRangeInverted)
      return
    }
    const capInt = Number.parseInt(capacity, 10)
    if (!Number.isFinite(capInt) || capInt < 0) {
      setError(t.schedule.formCapacityInvalid)
      return
    }

    let slotTimes: SlotTime[] | undefined
    if (isTimeSlot) {
      for (const s of slots) {
        if (!HHMM_RE.test(s.start) || !HHMM_RE.test(s.end)) {
          setError(t.schedule.formSlotInvalid)
          return
        }
        if (s.end <= s.start) {
          setError(t.schedule.formSlotInverted)
          return
        }
      }
      slotTimes = slots.map((s) => ({
        start_time: `${s.start}:00`,
        end_time: `${s.end}:00`,
      }))
    }

    try {
      setSubmitting(true)
      await onSubmit({
        from: fromDate,
        to: toDate,
        capacity: capInt,
        slot_times: slotTimes,
        notes: notes.trim() ? notes.trim() : null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{t.schedule.formTitle}</SheetTitle>
        <SheetDescription>
          {product ? product.name : t.schedule.formNoProduct}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from">{t.schedule.formFromLabel}</Label>
            <Input
              id="from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to">{t.schedule.formToLabel}</Label>
            <Input
              id="to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="capacity">{t.schedule.formCapacityLabel}</Label>
          <Input
            id="capacity"
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
          <p className="text-muted-foreground text-xs">
            {t.schedule.formCapacityHint}
          </p>
        </div>

        {isTimeSlot ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{t.schedule.formSlotsLabel}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addSlot}
              >
                {t.schedule.formSlotAdd}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {slots.map((slot, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`slot-start-${idx}`} className="text-xs">
                      {t.schedule.formSlotStartLabel}
                    </Label>
                    <Input
                      id={`slot-start-${idx}`}
                      type="time"
                      value={slot.start}
                      onChange={(e) => updateSlot(idx, 'start', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`slot-end-${idx}`} className="text-xs">
                      {t.schedule.formSlotEndLabel}
                    </Label>
                    <Input
                      id={`slot-end-${idx}`}
                      type="time"
                      value={slot.end}
                      onChange={(e) => updateSlot(idx, 'end', e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSlot(idx)}
                    disabled={slots.length === 1}
                  >
                    {t.schedule.formSlotRemove}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label htmlFor="notes">{t.schedule.formNotesLabel}</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>

      <SheetFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={submitting}
        >
          {t.schedule.formCancel}
        </Button>
        <Button type="submit" disabled={submitting || !product}>
          {submitting ? t.schedule.formSaving : t.schedule.formSubmit}
        </Button>
      </SheetFooter>
    </form>
  )
}
