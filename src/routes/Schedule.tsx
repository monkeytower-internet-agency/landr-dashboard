import { useCallback, useMemo, useState } from 'react'
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
import { AvailabilityListView } from '@/components/schedule/AvailabilityListView'
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
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

// landr-lp9t — persisted Month/List view toggle. Keyed globally (not per
// operator) because users typically prefer one view across all tenants;
// matches the lightweight pattern used by other UI prefs.
type ScheduleView = 'month' | 'list'
const SCHEDULE_VIEW_STORAGE_KEY = 'landr.dashboard.scheduleView'
const DEFAULT_SCHEDULE_VIEW: ScheduleView = 'month'

function isScheduleView(v: unknown): v is ScheduleView {
  return v === 'month' || v === 'list'
}

function readStoredScheduleView(): ScheduleView {
  if (typeof window === 'undefined') return DEFAULT_SCHEDULE_VIEW
  try {
    const raw = window.localStorage.getItem(SCHEDULE_VIEW_STORAGE_KEY)
    return isScheduleView(raw) ? raw : DEFAULT_SCHEDULE_VIEW
  } catch {
    return DEFAULT_SCHEDULE_VIEW
  }
}

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

  // landr-lp9t — view toggle (Month calendar vs compacted List), persisted
  // to localStorage so a power user who lives in List view doesn't have to
  // re-pick it on every visit.
  const [view, setViewState] = useState<ScheduleView>(() =>
    readStoredScheduleView(),
  )
  const setView = useCallback((next: ScheduleView) => {
    setViewState(next)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SCHEDULE_VIEW_STORAGE_KEY, next)
    } catch {
      /* silently ignore — quota / disabled storage. */
    }
  }, [])

  // landr-0195 — track the visible calendar window in state so prev/next
  // month navigation refetches availability. Previously memoised on
  // mount, which froze the query key to whichever month happened to be
  // current at first paint. AvailabilityCalendar drives updates via the
  // `onVisibleRangeChange` prop (FullCalendar's `datesSet` hook).
  // Initial value uses `widenForCalendar(new Date())` so the first fetch
  // covers the same window as the legacy behaviour; `datesSet` then
  // overwrites it on first paint and on every month nav.
  const [calendarWindow, setCalendarWindow] = useState<{
    from: string
    to: string
  }>(() => widenForCalendar(new Date()))

  const handleVisibleRangeChange = useCallback((from: string, to: string) => {
    setCalendarWindow((prev) =>
      prev.from === from && prev.to === to ? prev : { from, to },
    )
  }, [])

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
      calendarWindow.from,
      calendarWindow.to,
    ],
    queryFn: () =>
      fetchAvailability(
        currentOperatorId as string,
        resolvedProductId as string,
        calendarWindow.from,
        calendarWindow.to,
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
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.schedule },
        ]}
      />
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

      {/* landr-5rsf made the picker Card narrow (max-w-sm) so the right side
          of the page has room for the Month/List toggle (landr-lp9t). Wrap
          both in a flex row that wraps on narrow viewports. */}
      <div className="flex flex-wrap items-start gap-3">
        <Card className="max-w-sm flex-1 min-w-[16rem]">
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

        {/* landr-lp9t — Month/List view toggle. Sits next to (not inside)
            the product picker card so it stays visible without crowding the
            picker. Hidden when no product is pickable — there's nothing to
            view-toggle in that case. */}
        {products.length > 0 || productsQuery.isPending ? (
          <div
            role="tablist"
            aria-label={t.schedule.viewToggleLabel}
            className="border-input bg-background mt-1 inline-flex shrink-0 rounded-md border p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'month'}
              data-testid="schedule-view-month"
              onClick={() => setView('month')}
              className={cn(
                'cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
                view === 'month'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {t.schedule.viewToggleMonth}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              data-testid="schedule-view-list"
              onClick={() => setView('list')}
              className={cn(
                'cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
                view === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {t.schedule.viewToggleList}
            </button>
          </div>
        ) : null}
      </div>

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
      ) : view === 'list' ? (
        <AvailabilityListView
          rows={rows}
          onRangeSelect={handleRangeSelect}
        />
      ) : (
        <AvailabilityCalendar
          rows={rows}
          onRangeSelect={handleRangeSelect}
          onDayClick={handleDayClick}
          onPillClick={handleDayClick}
          onVisibleRangeChange={handleVisibleRangeChange}
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
