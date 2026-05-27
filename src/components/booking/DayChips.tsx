import { Fragment, useMemo } from 'react'
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

/**
 * Group an already-sorted YYYY-MM-DD array into runs of consecutive calendar
 * days. Two ISO dates are "consecutive" iff their UTC day-difference is
 * exactly 1. Unparseable inputs end the current run (start a new one) so we
 * never silently merge garbage. landr-irz1.
 */
function groupIntoRuns(sortedDays: string[]): string[][] {
  const runs: string[][] = []
  const MS_PER_DAY = 86_400_000
  let prevDate: Date | null = null
  for (const iso of sortedDays) {
    const d = parseDayOnly(iso)
    if (d && prevDate) {
      const diff = Math.round((d.getTime() - prevDate.getTime()) / MS_PER_DAY)
      if (diff === 1) {
        runs[runs.length - 1].push(iso)
        prevDate = d
        continue
      }
    }
    runs.push([iso])
    prevDate = d
  }
  return runs
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

  // Always render a leading month label — even for single-month ranges —
  // so a chip "Mon 8" is never ambiguous (May 8 vs. July 8). Multi-month
  // ranges get one label per month at each boundary (landr-04ec; the
  // multi-month layout itself was introduced in landr-ppf).
  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      role={editable ? 'group' : 'list'}
    >
      {groups.map((g) => {
        const probe = parseDayOnly(g.days[0])
        const label = probe ? monthFmt.format(probe).toUpperCase() : g.key
        // Within each month, split into runs of consecutive days so the
        // discontinuity between runs is visually obvious. landr-irz1.
        const runs = groupIntoRuns(g.days)
        return (
          <div key={g.key} className="flex flex-col gap-1">
            <span
              className="text-muted-foreground text-[10px] tracking-wider uppercase"
              data-month={g.key}
            >
              {label}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {runs.map((run, i) => (
                <Fragment key={run[0]}>
                  {i > 0 ? (
                    <span
                      aria-hidden="true"
                      data-run-separator
                      className="text-muted-foreground px-1 text-sm leading-none select-none"
                    >
                      ·
                    </span>
                  ) : null}
                  <div
                    className="flex flex-wrap gap-1.5"
                    data-run-start={run[0]}
                  >
                    {run.map(renderChip)}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
