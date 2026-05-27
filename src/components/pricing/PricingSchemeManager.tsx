import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  fetchPricingSchemes,
  type PricingSchemeRef,
} from '@/lib/products'
import {
  createPricingScheme,
  deletePricingScheme,
  patchPricingScheme,
} from '@/lib/pricingSchemes'

type Props = {
  operatorId: string
}

/**
 * Minimal discount-scheme manager rendered inside the EditTaxonomyButton
 * sheet next to the ProductForm dropdown (landr-wto). Lets operators
 * create / rename / delete schemes. The full rules + tiers editor lives
 * elsewhere (out of scope for this ticket — file a follow-up if needed).
 */
export function PricingSchemeManager({ operatorId }: Props) {
  const qc = useQueryClient()
  const [draftName, setDraftName] = useState('')
  const [draftCurrency, setDraftCurrency] = useState('EUR')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const schemesQuery = useQuery<PricingSchemeRef[]>({
    queryKey: ['pricing-schemes', operatorId],
    queryFn: () => fetchPricingSchemes(operatorId),
    enabled: !!operatorId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createPricingScheme(operatorId, {
        name: draftName.trim(),
        currency: draftCurrency.trim().toUpperCase(),
      }),
    onSuccess: () => {
      setDraftName('')
      setDraftCurrency('EUR')
      qc.invalidateQueries({ queryKey: ['pricing-schemes', operatorId] })
      toast.success('Discount scheme created')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const patchMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      patchPricingScheme(operatorId, vars.id, { name: vars.name.trim() }),
    onSuccess: () => {
      setEditingId(null)
      setEditingName('')
      qc.invalidateQueries({ queryKey: ['pricing-schemes', operatorId] })
      toast.success('Discount scheme renamed')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePricingScheme(operatorId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-schemes', operatorId] })
      toast.success('Discount scheme deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const schemes = useMemo(() => schemesQuery.data ?? [], [schemesQuery.data])

  return (
    <div className="flex flex-col gap-4">
      {schemesQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : schemesQuery.isError ? (
        <p className="text-destructive text-sm">
          {schemesQuery.error?.message ?? 'Failed to load discount schemes'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {schemes.length === 0 ? (
            <li className="text-muted-foreground text-sm">
              No discount schemes yet — create one below.
            </li>
          ) : (
            schemes.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                {editingId === s.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (editingName.trim())
                        patchMutation.mutate({ id: s.id, name: editingName })
                    }}
                  >
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-8"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={patchMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null)
                        setEditingName('')
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 text-sm">
                      {s.name}{' '}
                      <span className="text-muted-foreground">({s.currency})</span>
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Rename ${s.name}`}
                      onClick={() => {
                        setEditingId(s.id)
                        setEditingName(s.name)
                      }}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${s.name}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete discount scheme "${s.name}"? Products still attached to it will fall back to no discount.`,
                          )
                        ) {
                          deleteMutation.mutate(s.id)
                        }
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 rounded-md border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (draftName.trim()) createMutation.mutate()
        }}
      >
        <p className="text-sm font-medium">New discount scheme</p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="ps-new-name" className="text-xs">
              Name
            </Label>
            <Input
              id="ps-new-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Early-bird 10%"
            />
          </div>
          <div className="w-20">
            <Label htmlFor="ps-new-currency" className="text-xs">
              Currency
            </Label>
            <Input
              id="ps-new-currency"
              value={draftCurrency}
              onChange={(e) => setDraftCurrency(e.target.value)}
              maxLength={3}
            />
          </div>
          <Button
            type="submit"
            disabled={!draftName.trim() || createMutation.isPending}
          >
            <PlusIcon className="size-4" />
            Add
          </Button>
        </div>
      </form>
    </div>
  )
}
