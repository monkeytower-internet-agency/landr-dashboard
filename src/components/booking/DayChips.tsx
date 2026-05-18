import { useMemo } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  /** ISO YYYY-MM-DD strings. Order is preserved in display. */
  days: string[]
  /** When edit mode is on, clicking a chip calls onToggle. */
  editable?: boolean
  onToggle?: (day: string) => void
  /** Locale used for the weekday letters; defaults to current Intl locale. */
  locale?: string
  className?: string
}

const weekdayCache = new Map<string, Intl.DateTimeFormat>()
function weekdayFormatter(locale: string): Intl.DateTimeFormat {
  let fmt = weekdayCache.get(locale)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    weekdayCache.set(locale, fmt)
  }
  return fmt
}

function parseDayOnly(iso: string): Date | null {
  // ISO YYYY-MM-DD — construct at UTC noon so the weekday is stable across TZs.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
  return Number.isNaN(date.getTime()) ? null : date
}

export function DayChips({
  days,
  editable = false,
  onToggle,
  locale = 'en-IE',
  className,
}: Props) {
  const fmt = useMemo(() => weekdayFormatter(locale), [locale])
  const sorted = useMemo(() => {
    return [...new Set(days)].sort()
  }, [days])

  if (sorted.length === 0) {
    return (
      <p className="text-muted-foreground text-xs italic">No days selected.</p>
    )
  }

  return (
    <div
      className={cn('flex flex-wrap gap-1.5', className)}
      role={editable ? 'group' : 'list'}
    >
      {sorted.map((iso) => {
        const d = parseDayOnly(iso)
        const weekday = d ? fmt.format(d) : '?'
        const dayNum = d ? d.getUTCDate() : iso.slice(-2)

        const baseClass = cn(
          'flex flex-col items-center justify-center rounded-md border px-2 py-1 text-center select-none',
          'min-w-[2.5rem] leading-tight',
          'bg-secondary text-secondary-foreground border-border',
        )

        if (editable) {
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onToggle?.(iso)}
              className={cn(
                baseClass,
                'hover:border-destructive hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer',
              )}
              aria-label={`Remove ${iso}`}
              data-day={iso}
            >
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {weekday}
              </span>
              <span className="text-sm font-semibold">{dayNum}</span>
            </button>
          )
        }

        return (
          <span
            key={iso}
            role="listitem"
            className={baseClass}
            data-day={iso}
            title={iso}
          >
            <span className="text-[10px] uppercase tracking-wide opacity-70">
              {weekday}
            </span>
            <span className="text-sm font-semibold">{dayNum}</span>
          </span>
        )
      })}
    </div>
  )
}
