// Unit tests for product-form-schema.ts (landr-v9e4.9 — cheap coverage for
// extracted schema validation + helper functions).

import { describe, expect, it } from 'vitest'
import {
  buildSubmitPayload,
  defaultValues,
  hotelOfferingLabel,
  kindLabel,
  productFormSchema,
  shapeLabel,
  type ProductFormValues,
} from './product-form-schema'

// ---------------------------------------------------------------------------
// Schema validation — happy paths

describe('productFormSchema', () => {
  const baseService: ProductFormValues = {
    name: 'Test Service',
    name_localized: null,
    slug: 'test-service',
    short_description: '',
    short_description_localized: null,
    description: '',
    product_group_id: '',
    product_kind: 'service',
    service_time_shape: 'days_range',
    is_contiguous: false,
    duration_minutes: '',
    fixed_start_date: '',
    fixed_end_date: '',
    default_pricing_scheme_id: '',
    needs_provider: true,
    needs_pickup: false,
    revenue_flows_through_operator: true,
    is_publicly_listed: false,
    active: true,
    sort_order: '0',
    hotel_location_id: '',
    hotel_offering: 'none',
    is_addon_only: false,
    capacity_per_unit: '',
  }

  it('accepts a valid service product', () => {
    const result = productFormSchema.safeParse(baseService)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = productFormSchema.safeParse({ ...baseService, name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0])
      expect(fields).toContain('name')
    }
  })

  it('rejects invalid slug format', () => {
    const result = productFormSchema.safeParse({ ...baseService, slug: 'has spaces!' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0])
      expect(fields).toContain('slug')
    }
  })

  it('requires service_time_shape for service kind', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      service_time_shape: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('service_time_shape')
    }
  })

  it('requires duration_minutes for time_slot shape', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      service_time_shape: 'time_slot',
      duration_minutes: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('duration_minutes')
    }
  })

  it('accepts valid time_slot shape with duration', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      service_time_shape: 'time_slot',
      duration_minutes: '90',
    })
    expect(result.success).toBe(true)
  })

  it('requires both fixed window dates or neither', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      service_time_shape: 'fixed_window',
      fixed_start_date: '2025-01-01',
      fixed_end_date: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('fixed_end_date')
    }
  })

  it('accepts fixed_window with both dates provided', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      service_time_shape: 'fixed_window',
      fixed_start_date: '2025-06-01',
      fixed_end_date: '2025-06-07',
    })
    expect(result.success).toBe(true)
  })

  it('requires hotel_location_id for hotel_room kind', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      product_kind: 'hotel_room',
      service_time_shape: '',
      hotel_location_id: '',
      capacity_per_unit: '2',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('hotel_location_id')
    }
  })

  it('requires capacity_per_unit >= 1 for hotel_room kind', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      product_kind: 'hotel_room',
      service_time_shape: '',
      hotel_location_id: 'some-uuid',
      capacity_per_unit: '0',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('capacity_per_unit')
    }
  })

  it('accepts hotel_room with valid location + capacity', () => {
    const result = productFormSchema.safeParse({
      ...baseService,
      product_kind: 'hotel_room',
      service_time_shape: '',
      hotel_location_id: 'some-uuid',
      capacity_per_unit: '2',
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// defaultValues

describe('defaultValues', () => {
  it('seeds an empty form for a new service product', () => {
    const vals = defaultValues(null, 'service')
    expect(vals.product_kind).toBe('service')
    expect(vals.service_time_shape).toBe('days_range')
    expect(vals.revenue_flows_through_operator).toBe(true)
    expect(vals.capacity_per_unit).toBe('')
  })

  it('seeds hotel_room defaults with RFTO=false and capacity=1', () => {
    const vals = defaultValues(null, 'hotel_room')
    expect(vals.product_kind).toBe('hotel_room')
    expect(vals.revenue_flows_through_operator).toBe(false)
    expect(vals.capacity_per_unit).toBe('1')
    expect(vals.service_time_shape).toBe('')
  })
})

// ---------------------------------------------------------------------------
// buildSubmitPayload

describe('buildSubmitPayload', () => {
  const baseValues: ProductFormValues = {
    name: 'River Kayaking',
    name_localized: null,
    slug: 'river-kayaking',
    short_description: 'Paddle the river',
    short_description_localized: null,
    description: '',
    product_group_id: '',
    product_kind: 'service',
    service_time_shape: 'days_range',
    is_contiguous: true,
    duration_minutes: '',
    fixed_start_date: '',
    fixed_end_date: '',
    default_pricing_scheme_id: '',
    needs_provider: true,
    needs_pickup: true,
    revenue_flows_through_operator: true,
    is_publicly_listed: false,
    active: true,
    sort_order: '0',
    hotel_location_id: '',
    hotel_offering: 'none',
    is_addon_only: false,
    capacity_per_unit: '',
  }

  it('collapses hotel_location_id to null for non-hotel_room kinds', () => {
    const payload = buildSubmitPayload({
      ...baseValues,
      hotel_location_id: 'some-uuid',
    })
    expect(payload.hotel_location_id).toBeNull()
  })

  it('preserves hotel_location_id for hotel_room kind', () => {
    const payload = buildSubmitPayload({
      ...baseValues,
      product_kind: 'hotel_room',
      service_time_shape: '',
      hotel_location_id: 'some-uuid',
      capacity_per_unit: '2',
    })
    expect(payload.hotel_location_id).toBe('some-uuid')
  })

  it('collapses capacity_per_unit to null for non-hotel_room kinds', () => {
    const payload = buildSubmitPayload({
      ...baseValues,
      capacity_per_unit: '4',
    })
    expect(payload.capacity_per_unit).toBeNull()
  })

  it('collapses is_contiguous to false for non-days_range shapes', () => {
    const payload = buildSubmitPayload({
      ...baseValues,
      service_time_shape: 'time_slot',
      is_contiguous: true,
      duration_minutes: '60',
    })
    expect(payload.is_contiguous).toBe(false)
  })

  it('keeps is_contiguous for days_range', () => {
    const payload = buildSubmitPayload({
      ...baseValues,
      service_time_shape: 'days_range',
      is_contiguous: true,
    })
    expect(payload.is_contiguous).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Label helpers

describe('kindLabel', () => {
  it('returns a non-empty string for every kind', () => {
    const kinds = [
      'service',
      'subscription',
      'digital_good',
      'physical_good',
      'gift_card',
      'hotel_room',
    ] as const
    for (const k of kinds) {
      expect(kindLabel(k).length).toBeGreaterThan(0)
    }
  })
})

describe('hotelOfferingLabel', () => {
  it('returns a non-empty string for each offering value', () => {
    expect(hotelOfferingLabel('none').length).toBeGreaterThan(0)
    expect(hotelOfferingLabel('optional').length).toBeGreaterThan(0)
    expect(hotelOfferingLabel('mandatory').length).toBeGreaterThan(0)
  })
})

describe('shapeLabel', () => {
  it('returns a non-empty string for each shape', () => {
    const shapes = ['single_date', 'days_range', 'fixed_window', 'time_slot'] as const
    for (const s of shapes) {
      expect(shapeLabel(s).length).toBeGreaterThan(0)
    }
  })
})
