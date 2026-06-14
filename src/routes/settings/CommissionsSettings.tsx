import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { AgentEarningsReport } from '@/components/commissions/AgentEarningsReport'
import { CommissionSchemeEditorSheet } from '@/components/commissions/CommissionSchemeEditorSheet'
import {
  RECIPIENT_KIND_LABELS,
  createCommissionScheme,
  fetchCommissionSchemes,
  type CommissionSchemeRef,
  type RecipientKind,
} from '@/lib/commissions'
import { useEntitlements } from '@/lib/entitlements'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

/**
 * Settings → Commissions subsection (landr-9n0l).
 *
 * Two surfaces:
 * 1. Commission scheme list + editor (mirrors PricingSettings):
 *    create a scheme (name + recipient_kind + currency), then open the
 *    rules/tiers editor sheet.
 * 2. Agent-earnings report: read-only per-agent accrued/paid/reversed
 *    totals. Earnings accrue via server triggers/jobs, not this UI.
 */
export function CommissionsSettings() {
  const { currentOperatorId } = useOperator()
  if (!currentOperatorId) {
    return <div className="text-muted-foreground p-6">No operator selected.</div>
  }
  return <CommissionsSettingsInner operatorId={currentOperatorId} />
}

type InnerProps = {
  operatorId: string
}

// recipient_kind 'platform' = the Landr platform commission (the cut Landr
// takes from each booking). This is fixed by contract — operators must NOT
// create/edit platform schemes from the operator-facing UI. Only Landr staff
// (effectiveIsStaff) see the platform option in the create dropdown, and
// platform-kind rows render as read-only chips for non-staff (no editor open).
const STAFF_RECIPIENT_KIND_OPTIONS: RecipientKind[] = [
  'platform',
  'agent',
  'provider',
]
const OPERATOR_RECIPIENT_KIND_OPTIONS: RecipientKind[] = ['agent', 'provider']

function CommissionsSettingsInner({ operatorId }: InnerProps) {
  const qc = useQueryClient()
  const { effectiveIsStaff } = useEntitlements()

  const recipientKindOptions = effectiveIsStaff
    ? STAFF_RECIPIENT_KIND_OPTIONS
    : OPERATOR_RECIPIENT_KIND_OPTIONS

  const schemesQuery = useQuery<CommissionSchemeRef[]>({
    queryKey: ['commission-schemes', operatorId],
    queryFn: () => fetchCommissionSchemes(operatorId),
    enabled: !!operatorId,
  })

  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newRecipientKind, setNewRecipientKind] = useState<RecipientKind>('agent')
  const [newCurrency, setNewCurrency] = useState('EUR')
  const [showNewForm, setShowNewForm] = useState(false)

  const createMutation = useMutation({
    mutationFn: () =>
      createCommissionScheme(operatorId, {
        name: newName.trim(),
        recipient_kind: newRecipientKind,
        currency: newCurrency.trim().toUpperCase(),
      }),
    onSuccess: (created) => {
      setNewName('')
      setNewRecipientKind('agent')
      setNewCurrency('EUR')
      setShowNewForm(false)
      qc.invalidateQueries({ queryKey: ['commission-schemes', operatorId] })
      toast.success('Commission scheme created.')
      setEditingSchemeId(created.id)
    },
    onError: (err: Error) => toast.error(`Failed to create scheme: ${err.message}`),
  })

  const schemes = schemesQuery.data ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.commissions },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.commissions}
      />

      {/* --- Schemes --- */}
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button type="button" size="sm" onClick={() => setShowNewForm((v) => !v)}>
            <PlusIcon className="size-4" />
            New scheme
          </Button>
        </div>

        {showNewForm && (
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">New commission scheme</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-40 space-y-1">
                <Label htmlFor="cs-name" className="text-xs">
                  Name
                </Label>
                <Input
                  id="cs-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Agent base commission"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim()) createMutation.mutate()
                  }}
                />
              </div>
              <div className="w-36 space-y-1">
                <Label htmlFor="cs-recipient" className="text-xs">
                  Recipient
                </Label>
                <NativeSelect
                  id="cs-recipient"
                  value={newRecipientKind}
                  onChange={(e) => setNewRecipientKind(e.target.value as RecipientKind)}
                >
                  {recipientKindOptions.map((k) => (
                    <option key={k} value={k}>
                      {RECIPIENT_KIND_LABELS[k]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor="cs-currency" className="text-xs">
                  Currency
                </Label>
                <Input
                  id="cs-currency"
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowNewForm(false)
                  setNewName('')
                  setNewRecipientKind('agent')
                  setNewCurrency('EUR')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {schemesQuery.isPending ? (
          <p className="text-muted-foreground text-sm">Loading commission schemes…</p>
        ) : schemesQuery.isError ? (
          <p className="text-destructive text-sm">
            Failed to load commission schemes:{' '}
            {(schemesQuery.error as Error | null)?.message ?? 'unknown error'}
          </p>
        ) : schemes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No commission schemes yet — create one to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {schemes.map((scheme) => {
              // Operators can't open the editor on a platform-kind scheme (it
              // would let them change the Landr cut). Staff still can —
              // useful for setting up a contract or correcting a rate. The
              // server-side RLS on commission_schemes is the real gate; the
              // client just hides the affordance to avoid an inviting click.
              const isPlatformLocked =
                !effectiveIsStaff && scheme.recipient_kind === 'platform'
              const body = (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{scheme.name}</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
                      {scheme.currency}
                    </span>
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                      {RECIPIENT_KIND_LABELS[scheme.recipient_kind]}
                    </span>
                    {isPlatformLocked && (
                      <span
                        className="inline-flex items-center rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                        title="Set by your Landr contract — contact Landr to change."
                      >
                        Managed by Landr
                      </span>
                    )}
                    {!scheme.active && (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </div>
                  {scheme.notes && scheme.notes.trim().length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                      {scheme.notes}
                    </p>
                  )}
                  {isPlatformLocked && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      This commission is set by your Landr contract. Contact
                      Landr to change it.
                    </p>
                  )}
                </>
              )
              return (
                <li key={scheme.id}>
                  {isPlatformLocked ? (
                    <div
                      className="w-full rounded-md border bg-muted/20 p-3 text-left"
                      data-testid="commission-scheme-platform-locked"
                    >
                      {body}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="group w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
                      onClick={() => setEditingSchemeId(scheme.id)}
                    >
                      {body}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* --- Agent earnings report --- */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Agent earnings</h2>
          <p className="text-muted-foreground text-sm">
            Per-agent commission totals. Earnings accrue automatically; this
            view is read-only.
          </p>
        </div>
        <AgentEarningsReport operatorId={operatorId} />
      </div>

      <CommissionSchemeEditorSheet
        schemeId={editingSchemeId}
        operatorId={operatorId}
        onClose={() => setEditingSchemeId(null)}
      />
    </div>
  )
}
