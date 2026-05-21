// landr-p600 — compact revenue sparkline used by the Dashboard home
// "Revenue this week" summary card. Same recharts/shadcn primitives
// the Reporting page uses, sized down to fit a card foot.

import { Area, AreaChart } from 'recharts'
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart'
import type { RevenueDayPoint } from '@/lib/dashboard-home'

const sparkConfig = {
  revenue: {
    label: 'Revenue',
    theme: { light: 'var(--primary)', dark: 'var(--primary)' },
  },
} satisfies ChartConfig

export function DashboardRevenueSpark({ data }: { data: RevenueDayPoint[] }) {
  return (
    <ChartContainer
      config={sparkConfig}
      className="h-12 w-full"
      data-testid="dashboard-revenue-spark"
    >
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="dashSparkRev" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-revenue)"
              stopOpacity={0.35}
            />
            <stop
              offset="100%"
              stopColor="var(--color-revenue)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          fill="url(#dashSparkRev)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
