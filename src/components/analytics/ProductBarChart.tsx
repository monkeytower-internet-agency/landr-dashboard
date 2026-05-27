// Analytics: bookings per product (bar chart) — landr-af6c.
//
// Horizontal bars so long product names stay readable. Capped at the top 10
// products by the caller; everything beyond gets bucketed into "(others)"
// before reaching this component so the chart never overflows.

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { ProductBreakdownPoint } from '@/lib/analytics'

const config = {
  bookings: {
    label: 'Bookings',
    theme: { light: 'var(--primary)', dark: 'var(--primary)' },
  },
} satisfies ChartConfig

export function ProductBarChart({
  data,
  emptyLabel,
}: {
  data: ProductBreakdownPoint[]
  emptyLabel: string
}) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        {emptyLabel}
      </p>
    )
  }
  // Horizontal layout — Y axis carries the product name.
  return (
    <ChartContainer
      config={config}
      className="aspect-[16/8] w-full"
      style={{ minHeight: `${Math.max(data.length * 32 + 48, 200)}px` }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tickMargin={8}
        />
        <YAxis
          type="category"
          dataKey="productName"
          tickLine={false}
          axisLine={false}
          width={140}
          tickMargin={8}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar
          dataKey="bookings"
          fill="var(--color-bookings)"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  )
}
