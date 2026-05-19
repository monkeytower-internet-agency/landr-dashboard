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

const monthCache = new Map<string, Intl.DateTimeFormat>()
function monthFormatter(locale: string): Intl.DateTimeFormat {
  let fmt = monthCache.get(locale)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { month: 'short' })
    monthCache.set(locale, fmt)
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

/** "YYYY-MM" key used to group chips into month rows. */
function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function DayChips({
  days,
  editable = false,
  onToggle,
  locale = 'en-IE',
  className,
}: Props) {
  const fmt = useMemo(() => weekdayFormatter(locale), [locale])
  const monthFmt = useMemo(() => monthFormatter(locale), [locale])
  const sorted = useMemo(() => {
    return [...new Set(days)].sort()
  }, [days])

  // Group chronologically-sorted days by YYYY-MM so we can render a month
  // label above the first chip of each month. Single-month ranges (the
  // common short-range case) render without month markers to avoid visual
  // noise — see `crossesMonthBoundary` below.
  const groups = useMemo(() => {
    const out: { key: string; days: string[] }[] = []
    for (const iso of sorted) {
      const k = monthKey(iso)
      const last = out[out.length - 1]
      if (last && last.key === k) {
        last.days.push(iso)
      } else {
        out.push({ key: k, days: [iso] })
      }
    }
    return out
  }, [sorted])

  const crossesMonthBoundary = groups.length > 1

  if (sorted.length === 0) {
    return (
      <p className="text-muted-foreground text-xs italic">No days selected.</p>
    )
  }

  const renderChip = (iso: string) => {
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
  }

  // Single-month fast path: original flex-wrap layout, no month markers
  // (skipping the noise when every chip is in the same month).
  if (!crossesMonthBoundary) {
    return (
      <div
        className={cn('flex flex-wrap gap-1.5', className)}
        role={editable ? 'group' : 'list'}
      >
        {sorted.map(renderChip)}
      </div>
    )
  }

  // Multi-month: stack month groups vertically, each row prefixed by a
  // small uppercase month label so MAY/JUN boundaries are obvious in
  // BookingsTable + BookingDetailSheet (landr-ppf).
  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      role={editable ? 'group' : 'list'}
    >
      {groups.map((g) => {
        const probe = parseDayOnly(g.days[0])
        const label = probe ? monthFmt.format(probe).toUpperCase() : g.key
        return (
          <div key={g.key} className="flex flex-col gap-1">
            <span
              className="text-muted-foreground text-[10px] tracking-wider uppercase"
              data-month={g.key}
            >
              {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {g.days.map(renderChip)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
