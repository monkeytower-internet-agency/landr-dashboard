import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ProductsManager } from '@/components/products/ProductsManager'
import {
  createProduct,
  fetchPricingSchemes,
  fetchProductGroups,
  fetchProducts,
  nameToSlug,
  type ProductRow,
  type ProductWritePayload,
  type ServiceTimeShape,
} from '@/lib/products'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

type Props = {
  operatorId: string
  onAdvance: () => void
  onBack: () => void
}

type Template = {
  key: 'guided' | 'course' | 'hotel'
  name: string
  description: string
  // All onboarding templates are service products today (landr-5eb).
  // Non-service kinds live in the upcoming Shop epic.
  service_time_shape: ServiceTimeShape
  is_contiguous: boolean
  duration_minutes: number | null
  needs_provider: boolean
  needs_pickup: boolean
}

const TEMPLATES: ReadonlyArray<Template> = [
  {
    key: 'guided',
    name: 'Guided day',
    description: 'Single-day guided activity. Time-slot bookable, needs a guide.',
    service_time_shape: 'time_slot',
    is_contiguous: false,
    duration_minutes: 240,
    needs_provider: true,
    needs_pickup: false,
  },
  {
    key: 'course',
    name: 'Multi-day course',
    description: 'Multi-day course over a fixed date range.',
    service_time_shape: 'fixed_window',
    is_contiguous: false,
    duration_minutes: null,
    needs_provider: true,
    needs_pickup: false,
  },
  {
    key: 'hotel',
    name: 'Hotel package',
    description: 'Day activity bundled with hotel pickup.',
    service_time_shape: 'days_range',
    is_contiguous: false,
    duration_minutes: null,
    needs_provider: true,
    needs_pickup: true,
  },
]

function templateLabel(key: Template['key']): string {
  switch (key) {
    case 'guided':
      return t.onboarding.step5.templateGuided
    case 'course':
      return t.onboarding.step5.templateCourse
    case 'hotel':
      return t.onboarding.step5.templateHotel
  }
}

function templateDesc(key: Template['key']): string {
  switch (key) {
    case 'guided':
      return t.onboarding.step5.templateGuidedDesc
    case 'course':
      return t.onboarding.step5.templateCourseDesc
    case 'hotel':
      return t.onboarding.step5.templateHotelDesc
  }
}

export function Step5Products({ operatorId, onAdvance, onBack }: Props) {
  const qc = useQueryClient()
  const [busyKey, setBusyKey] = useState<Template['key'] | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  // Single source of truth for the wizard count: this same TanStack
  // Query key (`['products', operatorId]`) is also used by ProductsManager
  // (mounted inside the overlay) so the count display below and the list
  // the operator sees inside the overlay can never disagree.
  const productsQuery = useQuery<ProductRow[]>({
    queryKey: ['products', operatorId],
    queryFn: () => fetchProducts(operatorId),
    enabled: !!operatorId,
  })

  const pricingQuery = useQuery({
    queryKey: ['pricing_schemes', operatorId],
    queryFn: () => fetchPricingSchemes(operatorId),
    enabled: !!operatorId,
  })

  const groupsQuery = useQuery({
    queryKey: ['product_groups', operatorId],
    queryFn: () => fetchProductGroups(operatorId),
    enabled: !!operatorId,
  })

  const count = productsQuery.data?.length ?? 0
  const existingSlugs = new Set((productsQuery.data ?? []).map((p) => p.slug))

  const mutation = useMutation({
    mutationFn: (payload: ProductWritePayload) => createProduct(payload),
    onSuccess: (row) => {
      toast.success(t.onboarding.step5.created(row.name))
      qc.invalidateQueries({ queryKey: ['products', operatorId] })
    },
    onError: (err: Error) =>
      toast.error(t.onboarding.step5.createError, { description: err.message }),
    onSettled: () => setBusyKey(null),
  })

  function uniqueSlug(base: string): string {
    let candidate = base
    let n = 1
    while (existingSlugs.has(candidate)) {
      n += 1
      candidate = `${base}-${n}`
    }
    return candidate
  }

  function handleCreate(tpl: Template) {
    setBusyKey(tpl.key)
    const baseSlug = nameToSlug(tpl.name) || tpl.key
    const payload: ProductWritePayload = {
      operator_id: operatorId,
      product_group_id: groupsQuery.data?.[0]?.id ?? null,
      slug: uniqueSlug(baseSlug),
      name: tpl.name,
      short_description: tpl.description,
      description: null,
      product_kind: 'service',
      service_time_shape: tpl.service_time_shape,
      is_contiguous: tpl.is_contiguous,
      duration_minutes: tpl.duration_minutes,
      fixed_start_date: null,
      fixed_end_date: null,
      default_pricing_scheme_id:
        pricingQuery.data?.find((p) => p.active)?.id ?? pricingQuery.data?.[0]?.id ?? null,
      needs_provider: tpl.needs_provider,
      needs_pickup: tpl.needs_pickup,
      revenue_flows_through_operator: true,
      is_publicly_listed: true,
      active: true,
      sort_order: (productsQuery.data?.length ?? 0) + 1,
      // landr-ssrx — onboarding only ever creates kind='service' templates,
      // so the hotel link stays null and the offering defaults to 'none'.
      hotel_location_id: null,
      hotel_offering: 'none',
    }
    mutation.mutate(payload)
  }

  function handleManageOpenChange(open: boolean) {
    setManageOpen(open)
    if (!open) {
      // Refresh the wizard's count display when the overlay closes so any
      // create/edit/delete done in the manager is reflected immediately.
      qc.invalidateQueries({ queryKey: ['products', operatorId] })
    }
  }

  return (
    <StepShell heading={t.onboarding.step5.heading} body={t.onboarding.step5.body}>
      <p className="text-sm">{t.onboarding.step5.count(count)}</p>

      <div className="grid gap-3">
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.key}
            className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{templateLabel(tpl.key)}</p>
              <p className="text-xs text-muted-foreground">{templateDesc(tpl.key)}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleCreate(tpl)}
              disabled={busyKey !== null}
            >
              {busyKey === tpl.key ? t.onboarding.step5.creating : t.onboarding.step5.create}
            </Button>
          </div>
        ))}
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setManageOpen(true)}
        >
          {t.onboarding.step5.manage}
        </Button>
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t.onboarding.back}
        </Button>
        <Button type="button" onClick={onAdvance}>
          {count === 0 ? t.onboarding.skip : t.onboarding.next}
        </Button>
      </div>

      <Sheet open={manageOpen} onOpenChange={handleManageOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-3xl"
        >
          <SheetHeader>
            <SheetTitle>{t.products.title}</SheetTitle>
            <SheetDescription>{t.onboarding.step5.body}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ProductsManager operatorId={operatorId} hideHeader />
          </div>
        </SheetContent>
      </Sheet>
    </StepShell>
  )
}
