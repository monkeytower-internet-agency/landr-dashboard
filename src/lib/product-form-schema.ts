// Extracted from ProductForm.tsx (landr-v9e4.9 — pure-helper extraction).
// Zod schema, type exports, and label/default helper functions.
// This module has no React/JSX dependencies so it can be unit-tested cheaply.

import { z } from 'zod'
import { KIND_DISPLAY_ORDER } from '@/lib/package-teasers'
import {
  suggestRoomCapacity,
  type HotelOffering,
  type ProductKind,
  type ProductRow,
  type ServiceTimeShape,
} from '@/lib/products'
import { t } from '@/lib/strings'

// landr-c3t — the picker renders ALL kinds in marketing order; the
// teaser-rendering rules decide which become disabled-with-crown vs
// omitted entirely. The full list lives in KIND_DISPLAY_ORDER; this local
// alias keeps the zod enum literal happy without a runtime mismatch.
export const ALL_KINDS: readonly ProductKind[] = KIND_DISPLAY_ORDER

export const ALL_SHAPES: readonly ServiceTimeShape[] = [
  'single_date',
  'days_range',
  'fixed_window',
  'time_slot',
] as const

// landr-14s4 — per-locale override map ({ locale: text }). Stored alongside
// the base column; the widget falls back to the base when a key is absent.
// Empty overrides are stripped (absent keys) before submit by the
// LocalizedTextField, so this map only ever carries non-empty values.
const localizedMap = z.record(z.string(), z.string()).nullable()

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, t.products.errorNameRequired),
    name_localized: localizedMap,
    slug: z
      .string()
      .trim()
      .min(1, t.products.errorSlugRequired)
      .regex(/^[a-z0-9-]+$/i, t.products.errorSlugFormat),
    short_description: z.string().max(280),
    short_description_localized: localizedMap,
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
    hotel_location_id: z.string(),
    hotel_offering: z.enum(['none', 'optional', 'mandatory']),
    // landr-u34k — hide from main list, restrict to add-on flow.
    is_addon_only: z.boolean(),
    // landr-knm0 — capacity_per_unit.
    capacity_per_unit: z.string(),
    // landr-c53m.4 — hotel_room breakfast-included flag.
    includes_breakfast: z.boolean(),
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
  // landr-14s4 — per-locale overrides.
  name_localized: Record<string, string> | null
  slug: string
  short_description: string | null
  short_description_localized: Record<string, string> | null
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
  // landr-u34k
  is_addon_only: boolean
  // landr-knm0
  capacity_per_unit: number | null
  // landr-c53m.4
  includes_breakfast: boolean
}

// ---------------------------------------------------------------------------
// Label helpers

export function kindLabel(kind: ProductKind): string {
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

export function hotelOfferingLabel(value: HotelOffering): string {
  switch (value) {
    case 'none':
      return t.products.optionHotelOfferingNone
    case 'optional':
      return t.products.optionHotelOfferingOptional
    case 'mandatory':
      return t.products.optionHotelOfferingMandatory
  }
}

export function shapeLabel(shape: ServiceTimeShape): string {
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

// ---------------------------------------------------------------------------
// Default values helper

export function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

export function defaultValues(
  product: ProductRow | null,
  initialKind: ProductKind,
): ProductFormValues {
  if (!product) {
    return {
      name: '',
      name_localized: null,
      slug: '',
      short_description: '',
      short_description_localized: null,
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
      // default for hotel_room is RFTO=false.
      revenue_flows_through_operator: initialKind !== 'hotel_room',
      is_publicly_listed: false,
      active: true,
      sort_order: '0',
      hotel_location_id: '',
      hotel_offering: 'none',
      is_addon_only: false,
      // landr-knm0 — pre-fill a sensible default ONLY for fresh hotel_room rows.
      capacity_per_unit: initialKind === 'hotel_room' ? '1' : '',
      // landr-c53m.4 — no seeded default; the operator opts in explicitly.
      includes_breakfast: false,
    }
  }
  return {
    name: product.name,
    name_localized: product.name_localized ?? null,
    slug: product.slug,
    short_description: product.short_description ?? '',
    short_description_localized: product.short_description_localized ?? null,
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
    hotel_offering: product.hotel_offering ?? 'none',
    is_addon_only: !!product.is_addon_only,
    // landr-knm0 — pre-landr-fi68 rows have no capacity_per_unit column at
    // all; map NULL → '' so the input renders empty.
    capacity_per_unit:
      product.capacity_per_unit == null
        ? ''
        : String(product.capacity_per_unit),
    // landr-c53m.4 — whether the hotel room rate includes breakfast.
    includes_breakfast: !!product.includes_breakfast,
  }
}

// ---------------------------------------------------------------------------
// Submit-time coercion helper (builds the wire payload from validated form values)

export function buildSubmitPayload(values: ProductFormValues): ProductFormSubmitValue {
  const minutesTrimmed = (values.duration_minutes ?? '').trim()
  const sortTrimmed = (values.sort_order ?? '').trim()
  const shape: ServiceTimeShape | null =
    values.product_kind === 'service'
      ? (values.service_time_shape as ServiceTimeShape)
      : null
  return {
    name: values.name.trim(),
    name_localized: values.name_localized ?? null,
    slug: values.slug.trim(),
    short_description: emptyToNull(values.short_description),
    short_description_localized: values.short_description_localized ?? null,
    description: emptyToNull(values.description),
    product_group_id: emptyToNull(values.product_group_id),
    product_kind: values.product_kind,
    service_time_shape: shape,
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
    hotel_location_id:
      values.product_kind === 'hotel_room'
        ? emptyToNull(values.hotel_location_id)
        : null,
    hotel_offering:
      values.product_kind === 'service' ? values.hotel_offering : 'none',
    is_addon_only: values.is_addon_only,
    capacity_per_unit:
      values.product_kind === 'hotel_room'
        ? Number((values.capacity_per_unit ?? '').trim()) || null
        : null,
    // landr-c53m.4 — only meaningful for hotel_room; force false elsewhere
    // so a kind switch away from hotel_room can't leave a stale true value.
    includes_breakfast:
      values.product_kind === 'hotel_room' ? !!values.includes_breakfast : false,
  }
}

// Alias exported to keep ProductForm.tsx import surface clean
export { suggestRoomCapacity }
