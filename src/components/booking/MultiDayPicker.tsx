import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  addMonths,
  diffDays,
  isShiftish,
  MS_PER_DAY_CONST as MS_PER_DAY,
  nextSelection,
  parseIso,
  startOfMonth,
  todayIso,
  toIso,
} from './multiDayPickerLogic'

type Props = {
  value: string[]
  onChange: (next: string[]) => void
  initialMonth?: string
  minDay?: string
  locale?: string
  numMonths?: 1 | 2
  disabled?: boolean
  className?: string
}

export function MultiDayPicker({
  value,
  onChange,
  initialMonth,
  minDay,
  locale = 'en-IE',
  numMonths = 1,
  disabled = false,
  className,
}: Props) {
  const seedIso = initialMonth ?? value[0] ?? todayIso()
  const seedDate = parseIso(seedIso) ?? parseIso(todayIso())!
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(seedDate))
  const [anchor, setAnchor] = useState<string | null>(() => value[0] ?? null)

  const valueSet = useMemo(() => new Set(value), [value])
  const minDayParsed = minDay ?? null

  function handleClick(day: string, e: React.MouseEvent) {
    if (disabled) return
    if (minDayParsed && diffDays(minDayParsed, day) < 0) return
    const { days, anchor: nextAnchor } = nextSelection(
      value,
      anchor,
      day,
      isShiftish(e),
    )
    setAnchor(nextAnchor)
    onChange(days)
  }

  const months = Array.from({ length: numMonths }, (_, i) =>
    addMonths(viewMonth, i),
  )

  return (
    <div
      className={cn('flex flex-col gap-3', className)}
      data-testid="multi-day-picker"
    >
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
          disabled={disabled}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-6 text-sm font-medium">
          {months.map((m) => (
            <span key={toIso(m)}>
              {m.toLocaleString(locale, {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next month"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          disabled={disabled}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex gap-6">
        {months.map((m) => (
          <MonthGrid
            key={toIso(m)}
            month={m}
            valueSet={valueSet}
            anchor={anchor}
            minDay={minDayParsed}
            disabled={disabled}
            locale={locale}
            onPick={handleClick}
          />
        ))}
      </div>
    </div>
  )
}

type MonthGridProps = {
  month: Date
  valueSet: Set<string>
  anchor: string | null
  minDay: string | null
  disabled: boolean
  locale: string
  onPick: (day: string, e: React.MouseEvent) => void
}

function MonthGrid({
  month,
  valueSet,
  anchor,
  minDay,
  disabled,
  locale,
  onPick,
}: MonthGridProps) {
  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    })
    // 2024-01-01 is a Monday — use it to render Mon-first labels in any locale.
    const monday = new Date(Date.UTC(2024, 0, 1))
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(monday.getTime() + i * MS_PER_DAY)),
    )
  }, [locale])

  const firstOfMonth = month
  const lead = (firstOfMonth.getUTCDay() + 6) % 7
  const daysInMonth = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate()

  const cells: Array<{ iso: string; inMonth: boolean }> = []
  for (let i = lead - 1; i >= 0; i -= 1) {
    const d = new Date(firstOfMonth.getTime() - (i + 1) * MS_PER_DAY)
    cells.push({ iso: toIso(d), inMonth: false })
  }
  for (let i = 1; i <= daysInMonth; i += 1) {
    cells.push({
      iso: toIso(
        new Date(
          Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), i),
        ),
      ),
      inMonth: true,
    })
  }
  while (cells.length < 42) {
    const lastIso = cells[cells.length - 1].iso
    const last = parseIso(lastIso)!
    cells.push({
      iso: toIso(new Date(last.getTime() + MS_PER_DAY)),
      inMonth: false,
    })
  }

  return (
    <div
      className="grid grid-cols-7 gap-1 text-center text-xs"
      role="grid"
      aria-label={month.toLocaleString(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })}
    >
      {weekdayLabels.map((label) => (
        <div
          key={label}
          className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide"
        >
          {label}
        </div>
      ))}
      {cells.map(({ iso, inMonth }) => {
        const selected = valueSet.has(iso)
        const isAnchor = anchor === iso
        const blocked = !!(minDay && diffDays(minDay, iso) < 0)
        const dayNum = parseIso(iso)!.getUTCDate()

        return (
          <button
            type="button"
            key={iso}
            data-day={iso}
            data-selected={selected ? 'true' : undefined}
            data-anchor={isAnchor ? 'true' : undefined}
            aria-pressed={selected}
            aria-label={iso}
            disabled={disabled || blocked}
            onClick={(e) => onPick(iso, e)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !inMonth && 'text-muted-foreground/50',
              blocked && 'cursor-not-allowed opacity-40',
              !selected && !blocked && 'hover:bg-accent hover:text-accent-foreground',
              selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
              isAnchor && 'ring-2 ring-ring',
            )}
          >
            {dayNum}
          </button>
        )
      })}
    </div>
  )
}
