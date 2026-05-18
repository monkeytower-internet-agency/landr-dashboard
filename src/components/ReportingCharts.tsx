// Reporting charts — landr-m05.9.
//
// Two shadcn/charts-wrapped recharts panels: an area chart for revenue over
// time and a bar chart for bookings per ISO week. Colors come from the
// shadcn primary/accent CSS vars so dark mode just works.

import {
  Area,
  AreaChart,
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
import type {
  BookingsPerWeekPoint,
  RevenuePoint,
} from '@/lib/reporting'

const revenueConfig = {
  revenue: {
    label: 'Revenue',
    theme: { light: 'var(--primary)', dark: 'var(--primary)' },
  },
} satisfies ChartConfig

const bookingsConfig = {
  bookings: {
    label: 'Bookings',
    theme: { light: 'var(--primary)', dark: 'var(--primary)' },
  },
} satisfies ChartConfig

function formatShortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso
  // YYYY-MM-DD -> MMM-DD (locale-agnostic to keep snapshot tests stable).
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${months[m - 1]} ${d}`
}

export function RevenueAreaChart({
  data,
  currency,
  emptyLabel,
}: {
  data: RevenuePoint[]
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
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={formatShortDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={56}
          tickFormatter={(v) => `${currency} ${v}`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                typeof value === 'string' ? formatShortDate(value) : value
              }
            />
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          fill="url(#revGradient)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

export function BookingsBarChart({
  data,
  emptyLabel,
}: {
  data: BookingsPerWeekPoint[]
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
    <ChartContainer config={bookingsConfig} className="aspect-[16/6] w-full">
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="week"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
          width={32}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent />}
        />
        <Bar
          dataKey="bookings"
          fill="var(--color-bookings)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  )
}
