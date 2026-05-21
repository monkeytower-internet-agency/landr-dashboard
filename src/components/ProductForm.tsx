import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CrownIcon, Trash2Icon } from 'lucide-react'

import { ProductAddonsManager } from '@/components/products/ProductAddonsManager'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { EditTaxonomyButton } from '@/components/ui/edit-taxonomy-button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { NativeSelect } from '@/components/ui/native-select'
import { PricingSchemeManager } from '@/components/pricing/PricingSchemeManager'
import { ProductGroupManager } from '@/components/products/ProductGroupManager'
import { useOperator, useOperatorAllowedProductKinds } from '@/lib/operator'
import {
  KIND_DISPLAY_ORDER,
  lowestTierTooltip,
  shouldShowTeasers,
} from '@/lib/package-teasers'
import {
  nameToSlug,
  suggestRoomCapacity,
  type HotelOffering,
  type PricingSchemeRef,
  type ProductGroupRef,
  type ProductKind,
  type ProductRow,
  type ServiceTimeShape,
} from '@/lib/products'
import { t } from '@/lib/strings'

// landr-ssrx — surfaced as an option list in the form. Order mirrors the
// DB-allowed values; 'none' is the default for a fresh service product.
const HOTEL_OFFERINGS: readonly HotelOffering[] = [
  'none',
  'optional',
  'mandatory',
] as const

// Lightweight reference type for the operator's hotel-role locations. The
// caller (ProductsManager) fetches /api/locations + /api/location-role-types
// and computes the hotel subset; the form only needs id+name to render the
// picker.
export type HotelLocationRef = {
  id: string
  name: string
}

// Zod schema for the product form. Mirrors the DB CHECK constraints:
//   - time_slot requires duration_minutes
//   - fixed_window bounds must be paired (both NULL or both NOT NULL)
//   - (product_kind = 'service') = (service_time_shape IS NOT NULL)
//
// All "free-form" fields are kept as strings here (including numbers like
// duration_minutes and sort_order). Coercion happens in handleSubmit so the
// input/output types of the schema stay identical — which avoids a known
// type-incompatibility between zod's "transformed output" types and
// react-hook-form's strict generics.
// landr-c3t — the picker now renders ALL kinds in marketing order; the
// teaser-rendering rules decide which become disabled-with-crown vs
// omitted entirely. The full list lives in KIND_DISPLAY_ORDER; this local
// alias keeps the zod enum literal happy without a runtime mismatch.
const ALL_KINDS: readonly ProductKind[] = KIND_DISPLAY_ORDER

const ALL_SHAPES: readonly ServiceTimeShape[] = [
  'single_date',
  'days_range',
  'fixed_window',
  'time_slot',
] as const

const productFormSchema = z
  .object({
    name: z.string().trim().min(1, t.products.errorNameRequired),
    slug: z
      .string()
      .trim()
      .min(1, t.products.errorSlugRequired)
      .regex(/^[a-z0-9-]+$/i, t.products.errorSlugFormat),
    short_description: z.string().max(280),
    description: z.string(),
    product_group_id: z.string(),
    product_kind: z.enum(ALL_KINDS as unknown as [ProductKind, ...ProductKind[]]),
    service_time_shape: z.union([
      z.enum(ALL_SHAPES as unknown as [ServiceTimeShape, ...ServiceTimeShape[]]),
      z.literal(''),
    ]),
    is_contiguous: z.boolean(),
    duration_minutes: z.string(),
    fixed_start_date: z.string(),
    fixed_end_date: z.string(),
    default_pricing_scheme_id: z.string(),
    needs_provider: z.boolean(),
    needs_pickup: z.boolean(),
    revenue_flows_through_operator: z.boolean(),
    is_publicly_listed: z.boolean(),
    active: z.boolean(),
    sort_order: z.string(),
    // landr-ssrx — hotel-room linkage + service-only accommodation toggle.
    // Stored as a free-form string here ('' = unset) and coerced in
    // handleSubmit; hotel_offering is constrained to the three DB values.
    hotel_location_id: z.string(),
    hotel_offering: z.enum(['none', 'optional', 'mandatory']),
    // landr-u34k — hide from main list, restrict to add-on flow.
    is_addon_only: z.boolean(),
    // landr-knm0 — capacity_per_unit. Stored as a free-form string here
    // (same convention as duration_minutes/sort_order) and coerced in
    // handleSubmit. Only surfaced for kind='hotel_room'; collapsed to null
    // for other kinds before the API call.
    capacity_per_unit: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.product_kind === 'hotel_room') {
      // landr-knm0 — DB CHECK forbids 0/negative; require an integer >=1.
      const trimmed = (data.capacity_per_unit ?? '').trim()
      if (!trimmed) {
        ctx.addIssue({
          code: 'custom',
          message: t.products.errorRoomCapacityRequired,
          path: ['capacity_per_unit'],
        })
      } else {
        const n = Number(trimmed)
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
          ctx.addIssue({
            code: 'custom',
            message: t.products.errorRoomCapacityRequired,
            path: ['capacity_per_unit'],
          })
        }
      }
    }
    if (data.product_kind === 'hotel_room' && !data.hotel_location_id) {
      // landr-ssrx — mirror the DB CHECK
      //   (product_kind='hotel_room') = (hotel_location_id IS NOT NULL)
      // so the form blocks submit before the API rejects the row.
      ctx.addIssue({
        code: 'custom',
        message: 'Pick the hotel this room belongs to.',
        path: ['hotel_location_id'],
      })
    }
    if (data.product_kind === 'service') {
      if (!data.service_time_shape) {
        ctx.addIssue({
          code: 'custom',
          message: 'Service products must pick a time model.',
          path: ['service_time_shape'],
        })
      }
      if (data.service_time_shape === 'time_slot') {
        const trimmed = (data.duration_minutes ?? '').trim()
        const n = Number(trimmed)
        if (!trimmed || !Number.isFinite(n) || n < 1) {
          ctx.addIssue({
            code: 'custom',
            message: t.products.errorDurationRequired,
            path: ['duration_minutes'],
          })
        }
      }
      if (data.service_time_shape === 'fixed_window') {
        const a = (data.fixed_start_date ?? '').trim()
        const b = (data.fixed_end_date ?? '').trim()
        if ((a && !b) || (!a && b)) {
          ctx.addIssue({
            code: 'custom',
            message: t.products.errorDateRangePaired,
            path: ['fixed_end_date'],
          })
        }
      }
    }
    if (data.sort_order && !Number.isFinite(Number(data.sort_order))) {
      ctx.addIssue({
        code: 'custom',
        message: 'Sort order must be a number.',
        path: ['sort_order'],
      })
    }
  })

export type ProductFormValues = z.infer<typeof productFormSchema>

export type ProductFormSubmitValue = {
  name: string
  slug: string
  short_description: string | null
  description: string | null
  product_group_id: string | null
  product_kind: ProductKind
  service_time_shape: ServiceTimeShape | null
  is_contiguous: boolean
  duration_minutes: number | null
  fixed_start_date: string | null
  fixed_end_date: string | null
  default_pricing_scheme_id: string | null
  needs_provider: boolean
  needs_pickup: boolean
  revenue_flows_through_operator: boolean
  is_publicly_listed: boolean
  active: boolean
  sort_order: number
  hotel_location_id: string | null
  hotel_offering: HotelOffering
  // landr-u34k — hide-from-main-list flag. Persisted on the products row,
  // edited via the main form (not the add-ons section, which manages link
  // rows on a DIFFERENT parent product).
  is_addon_only: boolean
  // landr-knm0 — max sleepers per unit. NULL on non-room kinds (the form
  // collapses to null before submit so the API never receives a stray
  // value); >=1 integer on hotel_room.
  capacity_per_unit: number | null
}

type Props = {
  product: ProductRow | null
  pricingSchemes: PricingSchemeRef[]
  productGroups: ProductGroupRef[]
  onSubmit: (values: ProductFormSubmitValue) => Promise<void> | void
  onDelete?: () => void
  submitting?: boolean
  deleting?: boolean
  /** Override the operator's allow-list (for tests / wizards). */
  allowedKinds?: ProductKind[]
  /** Operator id — required to render the inline discount-scheme manager.
   *  Omitted in tests/wizards that don't need the pen-icon affordance. */
  operatorId?: string
  /** landr-ssrx — operator's hotel-role locations, used to populate the
   *  hotel_location_id picker when kind='hotel_room'. Pass [] if none
   *  exist; the form renders a helpful empty-state hint. */
  hotelLocations?: HotelLocationRef[]
  /** landr-u34k — full operator product roster, used by the Add-ons section
   *  to populate the addon-product picker (filtered to other products on
   *  the same operator, excluding the parent itself). Pass `undefined` to
   *  hide the Add-ons section entirely (e.g. tests / wizards that don't
   *  load products). */
  allProducts?: ProductRow[]
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

function defaultValues(
  product: ProductRow | null,
  initialKind: ProductKind,
): ProductFormValues {
  if (!product) {
    return {
      name: '',
      slug: '',
      short_description: '',
      description: '',
      product_group_id: '',
      product_kind: initialKind,
      service_time_shape: initialKind === 'service' ? 'days_range' : '',
      is_contiguous: false,
      duration_minutes: '',
      fixed_start_date: '',
      fixed_end_date: '',
      default_pricing_scheme_id: '',
      needs_provider: true,
      needs_pickup: true,
      // landr-ssrx — hotel rooms are paid to the hotel directly, so the
      // default for hotel_room is RFTO=false. All other kinds keep the
      // historical default of true (operator collects the money).
      revenue_flows_through_operator: initialKind !== 'hotel_room',
      is_publicly_listed: false,
      active: true,
      sort_order: '0',
      hotel_location_id: '',
      hotel_offering: 'none',
      is_addon_only: false,
      // landr-knm0 — pre-fill a sensible default ONLY for fresh hotel_room
      // rows (the input is hidden for other kinds, and existing rows are
      // loaded from the server). The suggestRoomCapacity heuristic returns
      // null on empty names; we fall back to '1' so the field starts valid
      // and the operator can type over it.
      capacity_per_unit: initialKind === 'hotel_room' ? '1' : '',
    }
  }
  return {
    name: product.name,
    slug: product.slug,
    short_description: product.short_description ?? '',
    description: product.description ?? '',
    product_group_id: product.product_group_id ?? '',
    product_kind: product.product_kind,
    service_time_shape: product.service_time_shape ?? '',
    is_contiguous: !!product.is_contiguous,
    duration_minutes:
      product.duration_minutes == null ? '' : String(product.duration_minutes),
    fixed_start_date: product.fixed_start_date ?? '',
    fixed_end_date: product.fixed_end_date ?? '',
    default_pricing_scheme_id: product.default_pricing_scheme_id ?? '',
    needs_provider: product.needs_provider,
    needs_pickup: product.needs_pickup,
    revenue_flows_through_operator: product.revenue_flows_through_operator,
    is_publicly_listed: product.is_publicly_listed,
    active: product.active,
    sort_order: String(product.sort_order ?? 0),
    hotel_location_id: product.hotel_location_id ?? '',
    // Defensive: pre-landr-ssrx rows wouldn't carry these columns. The DB
    // default is 'none', so we fall back to that if the server response is
    // missing the field for any reason.
    hotel_offering: product.hotel_offering ?? 'none',
    is_addon_only: !!product.is_addon_only,
    // landr-knm0 — pre-landr-fi68 rows have no capacity_per_unit column at
    // all; map NULL → '' so the input renders empty and the operator can
    // type a value. The zod refine catches the empty case for hotel_room
    // on submit.
    capacity_per_unit:
      product.capacity_per_unit == null
        ? ''
        : String(product.capacity_per_unit),
  }
}

function kindLabel(kind: ProductKind): string {
  switch (kind) {
    case 'service':
      return t.products.kindService
    case 'subscription':
      return t.products.kindSubscription
    case 'digital_good':
      return t.products.kindDigitalGood
    case 'physical_good':
      return t.products.kindPhysicalGood
    case 'gift_card':
      return t.products.kindGiftCard
    case 'hotel_room':
      return t.products.kindHotelRoom
  }
}

function hotelOfferingLabel(value: HotelOffering): string {
  switch (value) {
    case 'none':
      return t.products.optionHotelOfferingNone
    case 'optional':
      return t.products.optionHotelOfferingOptional
    case 'mandatory':
      return t.products.optionHotelOfferingMandatory
  }
}

function shapeLabel(shape: ServiceTimeShape): string {
  switch (shape) {
    case 'single_date':
      return t.products.shapeSingleDate
    case 'days_range':
      return t.products.shapeDaysRange
    case 'fixed_window':
      return t.products.shapeFixedWindow
    case 'time_slot':
      return t.products.shapeTimeSlot
  }
}

export function ProductForm({
  product,
  pricingSchemes,
  productGroups,
  onSubmit,
  onDelete,
  submitting,
  deleting,
  allowedKinds,
  operatorId,
  hotelLocations = [],
  allProducts,
}: Props) {
  const operatorAllowedKinds = useOperatorAllowedProductKinds()
  // The form prop overrides the operator context — useful in tests + the
  // onboarding wizard, where the operator context is mocked / not loaded.
  const allowList = useMemo<ProductKind[]>(() => {
    const source = allowedKinds ?? operatorAllowedKinds
    return ALL_KINDS.filter((k) => source.includes(k))
  }, [allowedKinds, operatorAllowedKinds])

  // landr-c3t — premium-tease UX. Render disabled-with-crown options for
  // kinds outside the allow-list when shouldShowTeasers() is true. Free-tier
  // operators always see teasers; paid tiers can toggle via Settings.
  // The teaser decision reads operator context independently of the
  // allowedKinds prop (which only overrides the allow-list itself) so tests
  // and wizards can mix-and-match.
  const { currentOperator } = useOperator()
  const showTeasers = useMemo(
    () => shouldShowTeasers(currentOperator),
    [currentOperator],
  )

  const teasedKinds = useMemo<ProductKind[]>(() => {
    if (!showTeasers) return []
    return ALL_KINDS.filter((k) => !allowList.includes(k))
  }, [showTeasers, allowList])

  // Pick the first allowed kind as the default for a new product. If the
  // operator has zero allowed kinds (defensive: schema rejects empty arrays)
  // we still default to 'service' so the form doesn't crash.
  const defaultKind: ProductKind = allowList[0] ?? 'service'

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaultValues(product, defaultKind),
    mode: 'onBlur',
  })

  // Reset when switching selected product. We key on id (and 'new' sentinel)
  // so editing one product then clicking another swaps the form state.
  useEffect(() => {
    form.reset(defaultValues(product, defaultKind))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id ?? 'new', defaultKind])

  const productKind = form.watch('product_kind')
  const serviceTimeShape = form.watch('service_time_shape')

  // When the operator changes product_kind away from 'service', clear the
  // shape so the DB CHECK ((kind='service') = (shape IS NOT NULL)) is
  // satisfied. When they switch back, default to days_range.
  //
  // landr-ssrx — also flip RFTO when entering 'hotel_room' on a FRESH
  // product (existing rows keep their stored value).
  //
  // landr-8bq9 — DATA-LOSS GUARD: this effect must only SEED defaults for
  // empty fields, never overwrite a value the operator already entered.
  // Earlier revisions unconditionally cleared hotel_location_id and
  // capacity_per_unit when leaving hotel_room and forced hotel_offering to
  // 'none' when entering it. That meant a "flip kind to peek, flip back"
  // round trip silently wiped operator edits. The DB CHECKs those clears
  // were defending against are already mirrored in handleSubmit (lines
  // ~534–548), which collapses each field to null/'none' based on the
  // CURRENT kind at submit time — so stale-but-hidden values never reach
  // the API. Stale values therefore live harmlessly in form state until
  // the operator either flips back to the relevant kind (and sees their
  // edits intact) or submits (and the collapse step nulls them).
  useEffect(() => {
    if (productKind === 'service' && !serviceTimeShape) {
      form.setValue('service_time_shape', 'days_range')
    } else if (productKind !== 'service' && serviceTimeShape) {
      // service_time_shape has no operator-edited "preserve" semantics —
      // it is an internal discriminator the operator can re-pick from the
      // shape select on the way back into 'service'.
      form.setValue('service_time_shape', '')
    }
    if (productKind === 'hotel_room') {
      // RFTO defaults to false for hotel rooms — guests pay the hotel directly.
      // We only flip it for fresh products; existing rows keep whatever the
      // operator stored. The defaultValues() seed handles the create path.
      // landr-8bq9 — also skip if the operator already touched RFTO this
      // session, so a peek-and-flip-back keeps their choice intact.
      if (!product && !form.formState.dirtyFields.revenue_flows_through_operator) {
        form.setValue('revenue_flows_through_operator', false)
      }
      // landr-knm0 — when entering hotel_room on a fresh product, seed a
      // capacity default if the field is empty. The name-based heuristic
      // (single→1, double→2, etc.) wins when the operator has already
      // typed a meaningful name; otherwise default to 1 so the input
      // starts in a valid state. For existing products that arrive with
      // capacity_per_unit=NULL we ALSO apply the heuristic on entry so
      // the operator isn't forced to invent a number from scratch.
      //
      // landr-8bq9 — the empty-only guard below is load-bearing: a non-empty
      // capacity means the operator either loaded a stored value or already
      // typed one. Either way, preserve it.
      const currentCap = (form.getValues('capacity_per_unit') ?? '').trim()
      if (!currentCap) {
        const nameOrSlug =
          form.getValues('name') || form.getValues('slug') || ''
        const suggested = suggestRoomCapacity(nameOrSlug) ?? 1
        form.setValue('capacity_per_unit', String(suggested))
      }
      // hotel_offering on non-service rows must be 'none' per DB CHECK, but
      // we no longer clobber an operator-edited value on entry — handleSubmit
      // collapses to 'none' for non-service kinds. Leaving the form state
      // alone here means a service→hotel_room→service round trip preserves
      // the operator's hotel_offering choice.
    }
    // landr-8bq9 — REMOVED: the previous "leaving hotel_room" branch cleared
    // hotel_location_id and capacity_per_unit unconditionally. Both are now
    // preserved in form state; handleSubmit nulls them at submit time when
    // the current kind isn't 'hotel_room'. Same story for hotel_offering on
    // entering non-service kinds — handleSubmit collapses to 'none' at
    // submit, the in-form state stays put so the operator can flip back
    // without losing their choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKind])

  const isServiceKind = productKind === 'service'
  const isHotelRoomKind = productKind === 'hotel_room'
  const nonServiceBody =
    productKind === 'physical_good'
      ? t.products.physicalGoodComingSoonBody
      : t.products.nonServiceComingSoonBody

  async function handleSubmit(values: ProductFormValues) {
    const minutesTrimmed = (values.duration_minutes ?? '').trim()
    const sortTrimmed = (values.sort_order ?? '').trim()
    const shape: ServiceTimeShape | null =
      values.product_kind === 'service'
        ? (values.service_time_shape as ServiceTimeShape)
        : null
    const payload: ProductFormSubmitValue = {
      name: values.name.trim(),
      slug: values.slug.trim(),
      short_description: emptyToNull(values.short_description),
      description: emptyToNull(values.description),
      product_group_id: emptyToNull(values.product_group_id),
      product_kind: values.product_kind,
      service_time_shape: shape,
      // is_contiguous is only meaningful for service + days_range; for
      // everything else we collapse to false so we never store a stray true.
      is_contiguous: shape === 'days_range' ? !!values.is_contiguous : false,
      duration_minutes:
        shape === 'time_slot' && minutesTrimmed ? Number(minutesTrimmed) : null,
      fixed_start_date:
        shape === 'fixed_window' ? emptyToNull(values.fixed_start_date) : null,
      fixed_end_date:
        shape === 'fixed_window' ? emptyToNull(values.fixed_end_date) : null,
      default_pricing_scheme_id: emptyToNull(values.default_pricing_scheme_id),
      needs_provider: values.needs_provider,
      needs_pickup: values.needs_pickup,
      revenue_flows_through_operator: values.revenue_flows_through_operator,
      is_publicly_listed: values.is_publicly_listed,
      active: values.active,
      sort_order: sortTrimmed ? Number(sortTrimmed) : 0,
      // landr-ssrx — collapse to null/'none' on every kind except where
      // the field is actually meaningful. The DB CHECKs would catch a
      // stale value from a kind-switch race, but we'd rather not even
      // send one.
      hotel_location_id:
        values.product_kind === 'hotel_room'
          ? emptyToNull(values.hotel_location_id)
          : null,
      hotel_offering:
        values.product_kind === 'service' ? values.hotel_offering : 'none',
      is_addon_only: values.is_addon_only,
      // landr-knm0 — capacity is meaningful only for hotel_room today.
      // Collapse to null on every other kind so the API never receives a
      // stray value (the DB column accepts NULL but the column comment
      // documents the convention).
      capacity_per_unit:
        values.product_kind === 'hotel_room'
          ? Number((values.capacity_per_unit ?? '').trim()) || null
          : null,
    }
    await onSubmit(payload)
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-6"
        aria-label={
          product ? t.products.formEditLabel : t.products.formCreateLabel
        }
      >
        <FormField
          control={form.control}
          name="product_kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.products.fieldProductKind}</FormLabel>
              <FormControl>
                {/*
                  landr-c3t — Render every kind in marketing order; mark
                  non-allowed kinds as disabled+teased when shouldShowTeasers()
                  is true, or omit them entirely otherwise. Disabled <option>
                  elements cannot be selected (HTML native semantics), so the
                  defence-in-depth API gate is never tripped from the picker.
                */}
                <NativeSelect {...field}>
                  {ALL_KINDS.map((k) => {
                    const allowed = allowList.includes(k)
                    const teased = !allowed && teasedKinds.includes(k)
                    if (!allowed && !teased) return null
                    return (
                      <option
                        key={k}
                        value={k}
                        disabled={!allowed}
                        title={!allowed ? lowestTierTooltip(k) : undefined}
                      >
                        {allowed ? kindLabel(k) : `${kindLabel(k)} 👑`}
                      </option>
                    )
                  })}
                </NativeSelect>
              </FormControl>
              {teasedKinds.length > 0 ? (
                <FormDescription>
                  <span className="inline-flex items-center gap-1">
                    <CrownIcon className="size-3" aria-hidden="true" />
                    {t.products.fieldProductKindTeaserHint}
                  </span>
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* landr-ssrx — hotel_room ships with full editing support, so we
            only render the "Coming soon" placeholder for the still-unsupported
            kinds (subscription, digital_good, physical_good, gift_card). */}
        {!isServiceKind && !isHotelRoomKind ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.products.nonServiceComingSoonTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">{nonServiceBody}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* landr-ssrx — hotel_room helper card. Sits above the hotel picker
            so operators understand the RFTO+per-night semantics before they
            commit to creating the product. */}
        {isHotelRoomKind ? (
          <Card>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t.products.hotelRoomHelperBody}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldName}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(e) => {
                      field.onChange(e)
                      // Auto-fill slug when creating a new product and slug
                      // is either empty or still matches the slugified name.
                      if (!product) {
                        const current = form.getValues('slug')
                        if (!current || current === nameToSlug(field.value)) {
                          form.setValue('slug', nameToSlug(e.target.value))
                        }
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>{t.products.fieldNameHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldSlug}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>{t.products.fieldSlugHint}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="short_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.products.fieldShortDescription}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>
                {t.products.fieldShortDescriptionHelp}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.products.fieldDescription}</FormLabel>
              <FormControl>
                <MarkdownEditor
                  value={field.value}
                  onChange={(val) => field.onChange(val ?? '')}
                  onBlur={field.onBlur}
                  preview="edit"
                  height={240}
                />
              </FormControl>
              <FormDescription>
                {t.products.fieldDescriptionHelp}{' '}
                {t.products.fieldDescriptionHint}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* landr-ssrx — hotel_location_id picker. Required when
            product_kind='hotel_room' (the DB CHECK rejects otherwise) and
            hidden / cleared on every other kind. */}
        {isHotelRoomKind ? (
          <FormField
            control={form.control}
            name="hotel_location_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldHotelLocation}</FormLabel>
                <FormControl>
                  <NativeSelect
                    {...field}
                    value={field.value ?? ''}
                    disabled={hotelLocations.length === 0}
                  >
                    <option value="">
                      {t.products.fieldHotelLocationEmpty}
                    </option>
                    {hotelLocations.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormDescription>
                  {hotelLocations.length === 0
                    ? t.products.fieldHotelLocationNoneAvailable
                    : t.products.fieldHotelLocationHint}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {/* landr-knm0 — capacity_per_unit input. Visible only on
            kind='hotel_room'; defaults are seeded by the kind-switch
            effect above so the operator just confirms or overrides. */}
        {isHotelRoomKind ? (
          <FormField
            control={form.control}
            name="capacity_per_unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldRoomCapacity}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>
                  {t.products.fieldRoomCapacityHint}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {/* landr-ssrx — hotel_offering only matters on kind='service'
            (DB CHECK forces 'none' elsewhere). Drives whether the widget
            renders the accommodation step on top of the service. */}
        {isServiceKind ? (
          <FormField
            control={form.control}
            name="hotel_offering"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldHotelOffering}</FormLabel>
                <FormControl>
                  <NativeSelect {...field} value={field.value}>
                    {HOTEL_OFFERINGS.map((o) => (
                      <option key={o} value={o}>
                        {hotelOfferingLabel(o)}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormDescription>
                  {t.products.fieldHotelOfferingHint}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {isServiceKind ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="service_time_shape"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.products.fieldServiceTimeShape}</FormLabel>
                    <FormControl>
                      <NativeSelect {...field} value={field.value ?? ''}>
                        {ALL_SHAPES.map((s) => (
                          <option key={s} value={s}>
                            {shapeLabel(s)}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serviceTimeShape === 'time_slot' ? (
                <FormField
                  control={form.control}
                  name="duration_minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.products.fieldDurationMinutes}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>

            {serviceTimeShape === 'days_range' ? (
              <FormField
                control={form.control}
                name="is_contiguous"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <div className="flex flex-col gap-1">
                      <FormLabel className="cursor-pointer text-sm font-normal">
                        {t.products.fieldIsContiguous}
                      </FormLabel>
                      <FormDescription>
                        {t.products.fieldIsContiguousHint}
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            ) : null}

            {serviceTimeShape === 'fixed_window' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fixed_start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.products.fieldFixedStartDate}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>
                        {t.products.fieldFixedDatesHint}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fixed_end_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.products.fieldFixedEndDate}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="default_pricing_scheme_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldPricingScheme}</FormLabel>
                <div className="flex items-center gap-1">
                  <FormControl>
                    <NativeSelect {...field} value={field.value ?? ''}>
                      <option value="">{t.products.optionNone}</option>
                      {pricingSchemes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.currency})
                        </option>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  {operatorId ? (
                    <EditTaxonomyButton
                      title={t.products.fieldPricingScheme}
                      description={t.products.fieldPricingSchemeHint}
                      ariaLabel={t.products.manageDiscountSchemes}
                    >
                      <PricingSchemeManager operatorId={operatorId} />
                    </EditTaxonomyButton>
                  ) : null}
                </div>
                <FormDescription>
                  {t.products.fieldPricingSchemeHint}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="product_group_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldProductGroup}</FormLabel>
                <div className="flex items-center gap-1">
                  <FormControl>
                    <NativeSelect {...field} value={field.value ?? ''}>
                      <option value="">{t.products.optionNone}</option>
                      {productGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  {operatorId ? (
                    <EditTaxonomyButton
                      title={t.products.productGroupManagerTitle}
                      description={t.products.productGroupManagerDescription}
                      ariaLabel={t.products.manageProductGroups}
                    >
                      <ProductGroupManager operatorId={operatorId} />
                    </EditTaxonomyButton>
                  ) : null}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="sort_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldSortOrder}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <fieldset className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">
            {t.products.legendFlags}
          </legend>
          {(
            [
              ['active', t.products.flagActive],
              ['is_publicly_listed', t.products.flagPubliclyListed],
              ['needs_provider', t.products.flagNeedsProvider],
              ['needs_pickup', t.products.flagNeedsPickup],
              [
                'revenue_flows_through_operator',
                t.products.flagRevenueThroughOperator,
              ],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormLabel className="cursor-pointer text-sm font-normal">
                    {label}
                  </FormLabel>
                </FormItem>
              )}
            />
          ))}
          {/* landr-u34k — is_addon_only spans both columns so the helper
              text has room to breathe; sits at the bottom of the flags
              fieldset because it changes how the product is surfaced in
              both the main list and the add-on flow. */}
          <FormField
            control={form.control}
            name="is_addon_only"
            render={({ field }) => (
              <FormItem className="sm:col-span-2 flex flex-row items-start gap-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <div className="flex flex-col gap-1">
                  <FormLabel className="cursor-pointer text-sm font-normal">
                    {t.products.flagAddonOnly}
                  </FormLabel>
                  <FormDescription>
                    {t.products.flagAddonOnlyHint}
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </fieldset>

        {/* landr-u34k — Add-ons management section. Only meaningful for
            existing products (the link rows reference parent_product_id,
            which doesn't exist until the parent has been saved). For new
            products we render a small hint instead so the operator knows
            to save first; for tests that don't pass `allProducts` the
            entire section is hidden. */}
        {allProducts !== undefined && operatorId ? (
          product ? (
            <ProductAddonsManager
              operatorId={operatorId}
              parentProduct={product}
              allProducts={allProducts}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t.products.addonsSectionTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {t.products.addonsSaveFirstHint}
                </p>
              </CardContent>
            </Card>
          )
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {product && onDelete ? (
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              disabled={!!deleting}
              className="text-destructive"
            >
              <Trash2Icon className="size-4" />
              {deleting ? t.products.deleting : t.products.delete}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            // landr-ssrx — service + hotel_room are both fully editable. The
            // still-unsupported kinds (subscription, *_good, gift_card) keep
            // the upgrade-prompt tooltip from the prior package-gating work.
            disabled={!!submitting || (!isServiceKind && !isHotelRoomKind)}
            title={
              !isServiceKind && !isHotelRoomKind
                ? t.products.nonServiceDisabledTooltip
                : undefined
            }
          >
            {submitting
              ? t.products.saving
              : product
                ? t.products.save
                : t.products.create}
          </Button>
        </div>
      </form>
    </Form>
  )
}
