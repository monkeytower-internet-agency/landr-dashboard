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

// ---------------------------------------------------------------------------
// landr-hxnb.7 — SettingsPageHeader
// Comic-styled section header: Space Grotesk display font, settings-hue
// accent dot, optional subtitle. Used by settings subsections to give the
// page chrome the comic identity without touching form fields or data cells.
// ---------------------------------------------------------------------------

type SettingsPageHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  /** Optional trailing content (e.g. a CTA button) */
  trailing?: ReactNode
}

export function SettingsPageHeader({
  title,
  subtitle,
  trailing,
}: SettingsPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 pb-1">
      <div className="flex flex-col gap-0.5">
        <h1
          className="font-display text-2xl font-semibold tracking-tight"
          // Settings-hue accent on the heading text keeps it tied to the
          // section identity without boxing it.
        >
          <span
            className="mr-2 inline-block size-2.5 rounded-full align-middle"
            style={{ background: 'var(--hue-settings-vivid)' }}
            aria-hidden="true"
          />
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsSectionHeader — subsection divider (h2) inside a page.
// Smaller than SettingsPageHeader; used for Card headings / panel labels
// that benefit from font-display but don't need the accent dot.
// ---------------------------------------------------------------------------

type SettingsSectionHeaderProps = {
  children: ReactNode
  className?: string
}

export function SettingsSectionHeader({
  children,
  className = '',
}: SettingsSectionHeaderProps) {
  return (
    <h2
      className={`font-display text-lg font-semibold tracking-tight ${className}`}
    >
      {children}
    </h2>
  )
}

// ---------------------------------------------------------------------------
// SettingsEmptyState — playful empty-state card (comic framing, slide-up-fade).
// ---------------------------------------------------------------------------

type SettingsEmptyStateProps = {
  message: ReactNode
  /** Optional icon/illustration above the message */
  icon?: ReactNode
}

export function SettingsEmptyState({ message, icon }: SettingsEmptyStateProps) {
  return (
    <div className="animate-slide-up-fade flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center">
      {icon && (
        <span
          className="flex size-12 items-center justify-center rounded-full text-2xl"
          style={{
            background: 'var(--hue-settings-soft-bg)',
            color: 'var(--hue-settings-vivid)',
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <p className="font-display text-muted-foreground text-sm font-medium">
        {message}
      </p>
    </div>
  )
}

/**
 * Wraps a settings subsection with the operator loader. Renders the
 * standard loading / error / no-operator states so individual subsections
 * only deal with the happy path.
 *
 * landr-hxnb.7 — loading / error / no-operator states use the settings
 * hue soft-bg so they feel at home inside the settings comic chrome.
 */
export function OperatorSection({ children }: OperatorSectionProps) {
  const { currentOperatorId } = useOperator()

  if (!currentOperatorId) {
    return (
      <div
        className="animate-slide-up-fade rounded-xl px-6 py-8 text-center text-sm"
        style={{
          background: 'var(--hue-settings-soft-bg)',
          color: 'var(--hue-settings-vivid)',
        }}
      >
        {t.settings.noOperator}
      </div>
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
    return (
      <div
        className="rounded-xl px-6 py-6 text-sm"
        style={{
          background: 'var(--hue-settings-soft-bg)',
          color: 'var(--hue-settings-vivid)',
        }}
      >
        {t.settings.loading}
      </div>
    )
  if (error || !data)
    return (
      <div className="text-destructive rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm">
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
