import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { AvailabilityCalendar } from '@/components/schedule/AvailabilityCalendar'
import {
  AvailabilityFormSheet,
  type AvailabilityFormSubmit,
} from '@/components/schedule/AvailabilityFormSheet'
import { AvailabilityDayPopover } from '@/components/schedule/AvailabilityDayPopover'
import {
  bulkCreateAvailability,
  createAvailability,
  deleteAvailability,
  fetchAvailability,
  fetchSchedulableProducts,
  patchAvailability,
  type AvailabilityRow,
  type ProductForSchedule,
} from '@/lib/availability'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

function widenForCalendar(d: Date): { from: string; to: string } {
  // FullCalendar dayGrid month shows trailing/leading days from neighbouring
  // months, so widen the fetch window a week on each side.
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  start.setUTCDate(start.getUTCDate() - 7)
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  end.setUTCDate(end.getUTCDate() + 7)
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  }
}

export function Schedule() {
  const { currentOperatorId } = useOperator()
  const queryClient = useQueryClient()

  const [productId, setProductId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formRange, setFormRange] = useState<{
    from?: string
    to?: string
  }>({})
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [popoverDate, setPopoverDate] = useState<string | null>(null)

  const today = useMemo(() => new Date(), [])
  const window = useMemo(() => widenForCalendar(today), [today])

  const productsQuery = useQuery<ProductForSchedule[]>({
    queryKey: ['schedulable-products', currentOperatorId ?? 'none'],
    queryFn: () => fetchSchedulableProducts(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const products = productsQuery.data ?? []
  const resolvedProductId = productId ?? products[0]?.id ?? null
  const selectedProduct = products.find((p) => p.id === resolvedProductId) ?? null

  const availabilityQuery = useQuery<AvailabilityRow[]>({
    queryKey: [
      'availability',
      currentOperatorId ?? 'none',
      resolvedProductId ?? 'none',
      window.from,
      window.to,
    ],
    queryFn: () =>
      fetchAvailability(
        currentOperatorId as string,
        resolvedProductId as string,
        window.from,
        window.to,
      ),
    enabled: !!currentOperatorId && !!resolvedProductId,
  })

  const rows = useMemo(
    () => availabilityQuery.data ?? [],
    [availabilityQuery.data],
  )

  const daySummary = useMemo(() => {
    if (!popoverDate) return null
    const matching = rows.filter((r) => r.date === popoverDate)
    if (matching.length === 0) return null
    return {
      date: popoverDate,
      capacity: matching.reduce((acc, r) => acc + r.capacity, 0),
      reserved: matching.reduce((acc, r) => acc + r.capacity_reserved, 0),
      rows: matching,
      allClosed: matching.every((r) => r.capacity === 0),
    }
  }, [popoverDate, rows])

  function invalidate() {
    if (!currentOperatorId || !resolvedProductId) return
    queryClient.invalidateQueries({
      queryKey: ['availability', currentOperatorId, resolvedProductId],
    })
  }

  const bulkMutation = useMutation({
    mutationFn: async (payload: AvailabilityFormSubmit) => {
      if (!currentOperatorId || !resolvedProductId) {
        throw new Error(t.schedule.formNoProduct)
      }
      return bulkCreateAvailability(currentOperatorId, resolvedProductId, payload)
    },
    onSuccess: (result) => {
      toast.success(t.schedule.toastBulkSuccess(result.inserted))
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.schedule.toastBulkError, { description: err.message })
    },
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, capacity }: { id: string; capacity: number }) =>
      patchAvailability(id, { capacity }),
    onSuccess: () => {
      toast.success(t.schedule.toastSaveSuccess)
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.schedule.toastSaveError, { description: err.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAvailability(id),
    onSuccess: () => {
      toast.success(t.schedule.toastDeleteSuccess)
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.schedule.toastDeleteError, { description: err.message })
    },
  })

  const createMutation = useMutation({
    mutationFn: async ({
      date,
      capacity,
    }: {
      date: string
      capacity: number
    }) => {
      if (!currentOperatorId || !resolvedProductId) {
        throw new Error(t.schedule.formNoProduct)
      }
      return createAvailability(currentOperatorId, resolvedProductId, {
        date,
        capacity,
      })
    },
    onSuccess: () => {
      toast.success(t.schedule.toastSaveSuccess)
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.schedule.toastSaveError, { description: err.message })
    },
  })

  function handleRangeSelect(fromDate: string, toDate: string) {
    setFormRange({ from: fromDate, to: toDate })
    setFormOpen(true)
  }

  function handleDayClick(_summary: unknown, date: string) {
    setPopoverDate(date)
    setPopoverOpen(true)
  }

  function handleAddClick() {
    setFormRange({})
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.schedule.title}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t.schedule.description}
          </p>
        </div>
        <Button
          type="button"
          onClick={handleAddClick}
          disabled={!resolvedProductId}
        >
          {t.schedule.addButton}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.schedule.productLabel}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {products.length === 0 && !productsQuery.isPending ? (
            <p className="text-muted-foreground text-sm">
              {t.schedule.noProducts}
            </p>
          ) : (
            <NativeSelect
              aria-label={t.schedule.productLabel}
              value={resolvedProductId ?? ''}
              onChange={(e) => setProductId(e.target.value || null)}
            >
              <option value="" disabled>
                {t.schedule.productPlaceholder}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <p className="text-muted-foreground text-xs">
            {t.schedule.rangeHint}
          </p>
        </CardContent>
      </Card>

      {availabilityQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.schedule.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {availabilityQuery.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : availabilityQuery.isPending && resolvedProductId ? (
        <p className="text-muted-foreground text-sm">{t.schedule.loading}</p>
      ) : (
        <AvailabilityCalendar
          rows={rows}
          onRangeSelect={handleRangeSelect}
          onDayClick={handleDayClick}
        />
      )}

      <AvailabilityFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        product={selectedProduct}
        defaultFrom={formRange.from}
        defaultTo={formRange.to}
        onSubmit={async (payload) => {
          await bulkMutation.mutateAsync(payload)
        }}
      />

      <AvailabilityDayPopover
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        date={popoverDate}
        summary={daySummary}
        onSave={async (id, capacity) => {
          await patchMutation.mutateAsync({ id, capacity })
        }}
        onBlock={async (id) => {
          await patchMutation.mutateAsync({ id, capacity: 0 })
        }}
        onDelete={async (id) => {
          await deleteMutation.mutateAsync(id)
        }}
        onCreate={async (date, capacity) => {
          await createMutation.mutateAsync({ date, capacity })
        }}
      />
    </div>
  )
}
