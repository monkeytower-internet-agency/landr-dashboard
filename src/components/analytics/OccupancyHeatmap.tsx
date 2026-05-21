// Analytics: occupancy heatmap — landr-af6c.
//
// 7-row (Mon..Sun) × 24-col (00..23) grid of cells coloured by booking
// count. Built with plain CSS grid so we avoid pulling in a heavy
// charting dep just for one widget. Tooltip is the native title attribute
// to keep the keyboard / screen-reader story trivially correct.

import { cn } from '@/lib/utils'
import {
  HEATMAP_WEEKDAYS,
  type HeatmapCell,
} from '@/lib/analytics'

export type OccupancyHeatmapLabels = {
  empty: string
  cellAria: (count: number, weekday: string, hour: number) => string
  hourAxisLabel: string
}

export function OccupancyHeatmap({
  cells,
  max,
  labels,
}: {
  cells: HeatmapCell[]
  max: number
  labels: OccupancyHeatmapLabels
}) {
  if (max === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {labels.empty}
      </p>
    )
  }
  // Re-bin into 7×24 rows for rendering. The lib pre-allocates the grid in
  // weekday-major order, so we can slice in 24-cell chunks.
  const rows: HeatmapCell[][] = []
  for (let w = 0; w < 7; w += 1) {
    rows.push(cells.slice(w * 24, w * 24 + 24))
  }
  return (
    <div
      className="flex flex-col gap-1"
      role="figure"
      aria-label={labels.hourAxisLabel}
      data-testid="occupancy-heatmap"
    >
      {/* Hour axis (00..23 with every-3rd label so the strip stays legible
          on small screens). */}
      <div
        className="text-muted-foreground grid grid-cols-[3rem_repeat(24,minmax(0,1fr))] items-end text-[10px]"
        aria-hidden
      >
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center">
            {h % 3 === 0 ? h.toString().padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      {rows.map((row, w) => {
        const weekdayLabel = HEATMAP_WEEKDAYS[w]
        return (
          <div
            key={weekdayLabel}
            className="grid grid-cols-[3rem_repeat(24,minmax(0,1fr))] items-center gap-px"
          >
            <span className="text-muted-foreground text-xs">{weekdayLabel}</span>
            {row.map((cell) => {
              const intensity = max === 0 ? 0 : cell.count / max
              const ariaLabel = labels.cellAria(
                cell.count,
                weekdayLabel,
                cell.hour,
              )
              return (
                <div
                  key={`${cell.weekday}-${cell.hour}`}
                  title={ariaLabel}
                  aria-label={ariaLabel}
                  role="img"
                  className={cn(
                    'h-5 rounded-sm border',
                    cell.count === 0
                      ? 'bg-muted/30 border-border/50'
                      : 'border-primary/20',
                  )}
                  style={
                    cell.count === 0
                      ? undefined
                      : {
                          backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(intensity * 100)}%, transparent)`,
                        }
                  }
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
