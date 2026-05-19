import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOperator } from '@/lib/operator'
import {
  fetchOperator,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { t } from '@/lib/strings'

// Shared loader used by every settings subsection that reads or writes
// the operator row. Each subsection runs the same query; React Query
// dedupes via the shared key so we only round-trip once per page view.
export const OPERATOR_QUERY_KEY = (operatorId: string) => [
  'operator-settings',
  operatorId,
] as const

type OperatorSectionRenderProps = {
  operator: OperatorSettings
  operatorId: string
  invalidate: () => void
}

type OperatorSectionProps = {
  children: (props: OperatorSectionRenderProps) => ReactNode
}

/**
 * Wraps a settings subsection with the operator loader. Renders the
 * standard loading / error / no-operator states so individual subsections
 * only deal with the happy path.
 */
export function OperatorSection({ children }: OperatorSectionProps) {
  const { currentOperatorId } = useOperator()

  if (!currentOperatorId) {
    return (
      <div className="text-muted-foreground p-6">{t.settings.noOperator}</div>
    )
  }

  return <OperatorSectionInner operatorId={currentOperatorId}>{children}</OperatorSectionInner>
}

function OperatorSectionInner({
  operatorId,
  children,
}: OperatorSectionProps & { operatorId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: OPERATOR_QUERY_KEY(operatorId),
    queryFn: () => fetchOperator(operatorId),
  })

  if (isLoading)
    return <div className="text-muted-foreground p-6">{t.settings.loading}</div>
  if (error || !data)
    return (
      <div className="text-destructive p-6">
        {t.settings.error}
        {error ? ` — ${(error as Error).message}` : ''}
      </div>
    )

  return (
    <>
      {children({
        operator: data,
        operatorId,
        invalidate: () =>
          qc.invalidateQueries({ queryKey: OPERATOR_QUERY_KEY(operatorId) }),
      })}
    </>
  )
}
