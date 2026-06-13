import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

// landr-jzc0 — `?date=YYYY-MM-DD` deep-link param. Must be both the right
// shape AND a real calendar date (so `?date=2026-02-31` is rejected, not
// silently rolled forward). Returns the parsed UTC date for downstream
// use as the calendar's anchor, or null on any validation failure.
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/
function parseDateParam(raw: string | null): { iso: string; date: Date } | null {
  if (!raw) return null
  if (!DATE_PARAM_RE.test(raw)) return null
  const [y, m, d] = raw.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null
  }
  return { iso: raw, date: dt }
}

// landr-jzc0 — `?product=` accepts any non-empty trimmed string. The
// briefing spec is "uuid OR string id"; we don't enforce uuid shape
// because operator-side product ids are free-form. Invalid (empty after
// trim) silently falls back to the default-selected first product.
function parseProductParam(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
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

  // landr-jzc0 — `?date=YYYY-MM-DD&product=<id>` deep-link params. The
  // URL is the source of truth for the INITIAL state only; subsequent
  // user interactions (product picker, month nav) drive the state, and
  // an effect pushes back to the URL with { replace: true } so the
  // back button doesn't fill with noise. Captured once via a useState
  // initializer so later setSearchParams writes don't re-trigger the
  // URL→state sync (which would create infinite loops).
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialUrlParams] = useState(() => ({
    date: parseDateParam(searchParams.get('date'))?.iso ?? null,
    product: parseProductParam(searchParams.get('product')),
  }))

  const [productId, setProductId] = useState<string | null>(
    initialUrlParams.product,
  )
  // landr-jzc0 — the deep-linked anchor date. Used as FullCalendar's
  // `initialDate` and to seed `calendarWindow` so the first fetch
  // covers that month. Subsequent month nav updates this via
  // `onVisibleRangeChange` and pushes it back to the URL.
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialUrlParams.date,
  )
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
  }>(() => {
    // landr-jzc0 — when a deep-link `?date=` is present, seed the first
    // fetch window around that date so the initial load already covers
    // the right month (avoids a default-month flash → re-fetch after
    // FullCalendar's `datesSet` reports the real window).
    const parsed = parseDateParam(initialUrlParams.date)
    return widenForCalendar(parsed?.date ?? new Date())
  })

  const handleVisibleRangeChange = useCallback((from: string, to: string) => {
    setCalendarWindow((prev) =>
      prev.from === from && prev.to === to ? prev : { from, to },
    )
    // landr-jzc0 — pick a representative date inside the visible month
    // for the deep-link param. The window starts ~7 days before the
    // visible month (FullCalendar's trailing-days padding) so we step
    // in 10 days to reliably land inside it, then snap to the 1st.
    // This gives a stable `?date=` that survives prev/next nav without
    // thrashing the URL with cell-level precision.
    const [y, m, d] = from.split('-').map(Number)
    const probe = new Date(Date.UTC(y, m - 1, d + 10))
    const anchor = `${probe.getUTCFullYear()}-${String(
      probe.getUTCMonth() + 1,
    ).padStart(2, '0')}-01`
    setSelectedDate((prev) => {
      // Preserve the originally deep-linked exact date if it's inside
      // this visible month — otherwise the URL would snap from e.g.
      // `?date=2026-05-15` (incoming pill nav) to `?date=2026-05-01`
      // on first paint, which obscures the link target.
      if (prev && prev.slice(0, 7) === anchor.slice(0, 7)) return prev
      return prev === anchor ? prev : anchor
    })
  }, [])

  const productsQuery = useQuery<ProductForSchedule[]>({
    queryKey: ['schedulable-products', currentOperatorId ?? 'none'],
    queryFn: () => fetchSchedulableProducts(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  // Memoise the empty-array fallback so the URL-sync effect below isn't
  // re-keyed on every render (lint: react-hooks/exhaustive-deps).
  const products = useMemo<ProductForSchedule[]>(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  )

  // landr-jzc0 — once the schedulable-products list lands, drop a
  // deep-linked `?product=` that doesn't match any row. Without this
  // the select renders empty (no option matches) and downstream
  // availability fetches hit a nonexistent product. Silently fall back
  // to the default-first-product behaviour that pre-jzc0 was always
  // the case. URL-param → local-state sync is one of the documented
  // exceptions to the set-state-in-effect rule (see Bookings.tsx).
  useEffect(() => {
    if (!productsQuery.isSuccess) return
    if (!productId) return
    if (products.some((p) => p.id === productId)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProductId(null)
  }, [productsQuery.isSuccess, productId, products])

  const resolvedProductId = productId ?? products[0]?.id ?? null
  const selectedProduct = products.find((p) => p.id === resolvedProductId) ?? null

  // landr-jzc0 — push the current (productId, selectedDate) to the URL
  // so the page is bookmarkable / shareable. `{ replace: true }` keeps
  // the back button useful (prev/next month nav doesn't pile history
  // entries). The effect compares against current URL params before
  // writing to avoid setSearchParams → re-render loops with no real
  // change.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let dirty = false
    if (productId) {
      if (next.get('product') !== productId) {
        next.set('product', productId)
        dirty = true
      }
    } else if (next.has('product')) {
      next.delete('product')
      dirty = true
    }
    if (selectedDate) {
      if (next.get('date') !== selectedDate) {
        next.set('date', selectedDate)
        dirty = true
      }
    } else if (next.has('date')) {
      next.delete('date')
      dirty = true
    }
    if (dirty) {
      setSearchParams(next, { replace: true })
    }
    // setSearchParams identity is unstable across renders; intentionally
    // omitted to keep the effect from re-running after we just wrote
    // (mirrors Bookings.tsx / Contacts.tsx URL-state convention).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, selectedDate])

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
        subtitle={t.settingsHub.sectionDescriptions.schedule}
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground max-w-2xl text-sm">
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
          <Tabs
            value={view}
            onValueChange={(next) => setView(next as ScheduleView)}
            className="mt-1 shrink-0"
          >
            <TabsList variant="pill" aria-label={t.schedule.viewToggleLabel}>
              <TabsTrigger
                variant="pill"
                value="month"
                data-testid="schedule-view-month"
              >
                {t.schedule.viewToggleMonth}
              </TabsTrigger>
              <TabsTrigger
                variant="pill"
                value="list"
                data-testid="schedule-view-list"
              >
                {t.schedule.viewToggleList}
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
          // landr-jzc0 — anchors the dayGridMonth view on the deep-linked
          // date so a pill click from the Calendar page lands on the
          // right month. Falls back to today when no `?date=` was given.
          initialDate={initialUrlParams.date ?? undefined}
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
