import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AvailabilityRow } from '@/lib/availability'
import { t } from '@/lib/strings'

export type DaySummary = {
  date: string
  capacity: number
  reserved: number
  rows: AvailabilityRow[]
  allClosed: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string | null
  summary: DaySummary | null
  onSave: (rowId: string, capacity: number) => Promise<void>
  onBlock: (rowId: string) => Promise<void>
  onDelete: (rowId: string) => Promise<void>
  onCreate: (date: string, capacity: number) => Promise<void>
}

export function AvailabilityDayPopover(props: Props) {
  const { open, onOpenChange, date, summary } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open && date ? (
          <Body
            key={`${date}-${summary?.rows[0]?.id ?? 'none'}`}
            date={date}
            summary={summary}
            onSave={props.onSave}
            onBlock={props.onBlock}
            onDelete={props.onDelete}
            onCreate={props.onCreate}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type BodyProps = {
  date: string
  summary: DaySummary | null
  onSave: (rowId: string, capacity: number) => Promise<void>
  onBlock: (rowId: string) => Promise<void>
  onDelete: (rowId: string) => Promise<void>
  onCreate: (date: string, capacity: number) => Promise<void>
  onClose: () => void
}

function Body({
  date,
  summary,
  onSave,
  onBlock,
  onDelete,
  onCreate,
  onClose,
}: BodyProps) {
  const firstRow = summary?.rows[0]
  const [capacity, setCapacity] = useState<string>(
    firstRow ? String(firstRow.capacity) : '6',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function wrap(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    const capInt = Number.parseInt(capacity, 10)
    if (!Number.isFinite(capInt) || capInt < 0) {
      setError(t.schedule.formCapacityInvalid)
      return
    }
    if (firstRow) {
      await wrap(() => onSave(firstRow.id, capInt))
    } else {
      await wrap(() => onCreate(date, capInt))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.schedule.popoverTitle}</DialogTitle>
        <DialogDescription>{date}</DialogDescription>
      </DialogHeader>

      {summary && summary.rows.length > 1 ? (
        <p className="text-muted-foreground text-xs">
          {t.schedule.popoverMultiSlotsHint(summary.rows.length)}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="popover-capacity">{t.schedule.formCapacityLabel}</Label>
        <Input
          id="popover-capacity"
          type="number"
          min={0}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        {firstRow ? (
          <p className="text-muted-foreground text-xs">
            {t.schedule.popoverReservedHint(
              firstRow.capacity_reserved,
              firstRow.capacity,
            )}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <DialogFooter className="gap-2 sm:gap-2">
        {firstRow ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => wrap(() => onDelete(firstRow.id))}
              disabled={busy}
            >
              {t.schedule.popoverDelete}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => wrap(() => onBlock(firstRow.id))}
              disabled={busy}
            >
              {t.schedule.popoverBlock}
            </Button>
          </>
        ) : null}
        <Button type="button" onClick={handleSave} disabled={busy}>
          {busy ? t.schedule.formSaving : t.schedule.popoverSave}
        </Button>
      </DialogFooter>
    </>
  )
}
