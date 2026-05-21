// Analytics: revenue over time (line chart) — landr-af6c.
//
// Wraps recharts via the shared ChartContainer so colors track the shadcn
// CSS vars. Animations are disabled so the chart doesn't blink whenever
// the parent re-renders (e.g. on a range-preset toggle).

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { RevenueOverTimePoint } from '@/lib/analytics'

const revenueConfig = {
  revenue: {
    label: 'Revenue',
    theme: { light: 'var(--primary)', dark: 'var(--primary)' },
  },
} satisfies ChartConfig

export function RevenueLineChart({
  data,
  currency,
  emptyLabel,
}: {
  data: RevenueOverTimePoint[]
  currency: string
  emptyLabel: string
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {emptyLabel}
      </p>
    )
  }
  return (
    <ChartContainer config={revenueConfig} className="aspect-[16/6] w-full">
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={64}
          tickFormatter={(v) => `${currency} ${v}`}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
