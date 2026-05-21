// Analytics: conversion funnel — landr-af6c.
//
// Pure CSS/HTML "funnel" rather than a recharts visualisation. Three
// stacked bars whose width is proportional to each stage's share of the
// initiated count. Keeps the render dependency-free (no extra recharts
// FunnelChart import) and stays readable on narrow viewports because the
// bars wrap rather than truncate.

import { cn } from '@/lib/utils'
import type { ConversionFunnel as FunnelData } from '@/lib/analytics'

export type ConversionFunnelLabels = {
  initiated: string
  confirmed: string
  completed: string
  cancelledNote: (n: number) => string
  noShowNote: (n: number) => string
  fromTop: (pct: string) => string
  fromPrev: (pct: string) => string
  empty: string
}

export function ConversionFunnel({
  funnel,
  labels,
}: {
  funnel: FunnelData
  labels: ConversionFunnelLabels
}) {
  const initiated = funnel.stages[0]?.count ?? 0
  if (initiated === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {labels.empty}
      </p>
    )
  }
  const stageLabels: Record<string, string> = {
    initiated: labels.initiated,
    confirmed: labels.confirmed,
    completed: labels.completed,
  }
  return (
    <div className="flex flex-col gap-3" data-testid="conversion-funnel">
      {funnel.stages.map((stage, idx) => {
        const widthPct = Math.max(stage.conversionFromTop * 100, 4)
        const fromTopPct = `${(stage.conversionFromTop * 100).toFixed(1)}%`
        const fromPrevPct = `${(stage.conversionFromPrev * 100).toFixed(1)}%`
        return (
          <div
            key={stage.key}
            className="flex flex-col gap-1"
            data-testid={`funnel-stage-${stage.key}`}
          >
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{stageLabels[stage.key]}</span>
              <span className="text-muted-foreground tabular-nums">
                {stage.count.toLocaleString()}
                {idx === 0
                  ? ''
                  : ` · ${labels.fromTop(fromTopPct)} · ${labels.fromPrev(fromPrevPct)}`}
              </span>
            </div>
            <div className="bg-muted h-4 w-full overflow-hidden rounded-md">
              <div
                className={cn(
                  'bg-primary h-full rounded-md transition-[width]',
                  idx === 0 && 'opacity-90',
                  idx === 1 && 'opacity-75',
                  idx === 2 && 'opacity-60',
                )}
                style={{ width: `${widthPct}%` }}
                aria-hidden
              />
            </div>
          </div>
        )
      })}
      {funnel.cancelled > 0 || funnel.noShow > 0 ? (
        <p className="text-muted-foreground text-xs">
          {funnel.cancelled > 0 ? labels.cancelledNote(funnel.cancelled) : ''}
          {funnel.cancelled > 0 && funnel.noShow > 0 ? ' · ' : ''}
          {funnel.noShow > 0 ? labels.noShowNote(funnel.noShow) : ''}
        </p>
      ) : null}
    </div>
  )
}
