import { useQuery } from '@tanstack/react-query'

import {
  fetchAgentEarningsSummary,
  type AgentEarningSummary,
} from '@/lib/commissions'

/**
 * Read-only per-agent commission report. Earnings accrue via server
 * triggers/jobs (Decision #60); this surface only reports the
 * accrued/paid/reversed totals per agent. Empty for operators with no
 * agents (e.g. Para42 v1).
 */

type Props = {
  operatorId: string
}

function fmt(amount: number, currency: string | null): string {
  const value = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${value} ${currency}` : value
}

export function AgentEarningsReport({ operatorId }: Props) {
  const query = useQuery<AgentEarningSummary[]>({
    queryKey: ['agent-earnings-summary', operatorId],
    queryFn: () => fetchAgentEarningsSummary(operatorId),
    enabled: !!operatorId,
  })

  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">Loading agent earnings…</p>
  }

  if (query.isError) {
    return (
      <p className="text-destructive text-sm">
        Failed to load agent earnings:{' '}
        {(query.error as Error | null)?.message ?? 'unknown error'}
      </p>
    )
  }

  const rows = query.data ?? []

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No agent earnings yet. Earnings accrue automatically as bookings with
        agent commissions complete.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground text-xs">
            <th className="px-3 py-2 text-left font-medium">Agent</th>
            <th className="px-3 py-2 text-right font-medium">Accrued</th>
            <th className="px-3 py-2 text-right font-medium">Paid</th>
            <th className="px-3 py-2 text-right font-medium">Reversed</th>
            <th className="px-3 py-2 text-right font-medium">Entries</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agent_user_id} className="border-b last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{row.agent_user_id}</td>
              <td className="px-3 py-2 text-right">
                {fmt(row.accrued_total, row.currency)}
              </td>
              <td className="px-3 py-2 text-right">
                {fmt(row.paid_total, row.currency)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {fmt(row.reversed_total, row.currency)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {row.earning_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
