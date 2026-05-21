import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PricingSchemeEditorSheet } from '@/components/pricing/PricingSchemeEditorSheet'
import {
  createPricingScheme,
} from '@/lib/pricingSchemes'
import { fetchPricingSchemes, type PricingSchemeRef } from '@/lib/products'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

/**
 * Settings → Pricing subsection.
 *
 * Lists all pricing schemes for the current operator. Operators can:
 * - Create a new scheme (name + currency dialog, then auto-open editor)
 * - Click a scheme to open the full rules+tiers editor sheet
 * - (Delete is handled inside PricingSchemeEditorSheet via PATCH active=false
 *   or from PricingSchemeManager in ProductForm)
 *
 * The query key ['pricing-schemes', operatorId] is shared with
 * PricingSchemeManager (used in ProductForm dropdown) so creating/deleting
 * here also refreshes the product form picker.
 *
 * landr-bcca.
 */
export function PricingSettings() {
  const { currentOperatorId } = useOperator()

  if (!currentOperatorId) {
    return (
      <div className="text-muted-foreground p-6">No operator selected.</div>
    )
  }

  return <PricingSettingsInner operatorId={currentOperatorId} />
}

type InnerProps = {
  operatorId: string
}

function PricingSettingsInner({ operatorId }: InnerProps) {
  const qc = useQueryClient()

  // Scheme list
  const schemesQuery = useQuery<PricingSchemeRef[]>({
    queryKey: ['pricing-schemes', operatorId],
    queryFn: () => fetchPricingSchemes(operatorId),
    enabled: !!operatorId,
  })

  // Sheet state: which scheme is open for editing
  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null)

  // New-scheme form
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState('EUR')
  const [showNewForm, setShowNewForm] = useState(false)

  const createMutation = useMutation({
    mutationFn: () =>
      createPricingScheme(operatorId, {
        name: newName.trim(),
        currency: newCurrency.trim().toUpperCase(),
      }),
    onSuccess: (created) => {
      setNewName('')
      setNewCurrency('EUR')
      setShowNewForm(false)
      qc.invalidateQueries({ queryKey: ['pricing-schemes', operatorId] })
      toast.success('Pricing scheme created.')
      // Immediately open the editor for the newly created scheme
      setEditingSchemeId(created.id)
    },
    onError: (err: Error) => toast.error(`Failed to create scheme: ${err.message}`),
  })

  const schemes = schemesQuery.data ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.pricing },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.pricing}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowNewForm((v) => !v)}
        >
          <PlusIcon className="size-4" />
          New scheme
        </Button>
      </div>

      {/* New scheme form */}
      {showNewForm && (
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">New pricing scheme</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="ps-name" className="text-xs">
                Name
              </Label>
              <Input
                id="ps-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Standard paragliding"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) createMutation.mutate()
                }}
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="ps-currency" className="text-xs">
                Currency
              </Label>
              <Input
                id="ps-currency"
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
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
                setNewCurrency('EUR')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Schemes list */}
      {schemesQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Loading pricing schemes…</p>
      ) : schemesQuery.isError ? (
        <p className="text-destructive text-sm">
          Failed to load pricing schemes:{' '}
          {(schemesQuery.error as Error | null)?.message ?? 'unknown error'}
        </p>
      ) : schemes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No pricing schemes yet — create one to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {schemes.map((scheme) => (
            <li key={scheme.id}>
              {/* landr-i018 — card body wraps both the scheme-edit button
                  and the (interactive) 'Used by' product links. Nesting
                  <Link> inside <button> is invalid HTML, so the card is
                  a flex column with a sibling button for the title row
                  and a non-button block for the metadata. The whole card
                  highlights on hover via group-hover so the affordance
                  reads as a single clickable surface. */}
              <div className="group rounded-md border p-3 hover:bg-muted/50 transition-colors">
                <button
                  type="button"
                  className="w-full text-left cursor-pointer"
                  onClick={() => setEditingSchemeId(scheme.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{scheme.name}</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
                      {scheme.currency}
                    </span>
                    {!scheme.active && (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </div>
                </button>

                {scheme.notes && scheme.notes.trim().length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                    {scheme.notes}
                  </p>
                )}

                <div className="mt-1 text-xs">
                  {scheme.products.length === 0 ? (
                    <span className="text-muted-foreground/70">Not in use</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Used by:{' '}
                      {scheme.products.map((p, i) => (
                        <Fragment key={p.id}>
                          {i > 0 && ', '}
                          <Link
                            to={`/products/${p.id}`}
                            className="underline hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.name}
                          </Link>
                        </Fragment>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor sheet */}
      <PricingSchemeEditorSheet
        schemeId={editingSchemeId}
        operatorId={operatorId}
        onClose={() => setEditingSchemeId(null)}
      />
    </div>
  )
}
