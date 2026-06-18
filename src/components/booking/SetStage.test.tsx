/**
 * Tests for the T8 free-form set-stage data layer (landr-uvfg.8).
 *
 * Covers the two lib/bookings.ts helpers the BookingDetailSheet stage Select
 * is wired to:
 *   - setBookingStage  — POSTs to the operator-scoped set-stage endpoint with
 *                        the target stage code + force flag.
 *   - fetchBookingStages — projects the operator's active lifecycle stages.
 *
 * api() and supabase are mocked so these assert URL/method/body and the
 * Supabase query shape without a live backend.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  api: vi.fn(),
}))

// Chainable Supabase query-builder stub: every filter returns the builder,
// .order() is terminal and resolves to { data, error }. Built inside
// vi.hoisted so the vi.mock factory (hoisted to the top of the file) can
// safely reference it.
const { fromMock, builder, orderMock, stageRows } = vi.hoisted(() => {
  const stageRows = [
    {
      id: 's1',
      code: 'awaiting_payment',
      label: 'Awaiting payment',
      semantic_state: 'pending',
      sort_order: 1,
    },
  ]
  const orderMock = vi.fn(() =>
    Promise.resolve({ data: stageRows, error: null }),
  )
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: orderMock,
  }
  const fromMock = vi.fn((_table: string) => builder)
  return { fromMock, builder, orderMock, stageRows }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}))

import { api } from '@/lib/api-client'
import { setBookingStage, fetchBookingStages } from '@/lib/bookings'

beforeEach(() => {
  vi.mocked(api).mockReset()
  fromMock.mockClear()
  orderMock.mockClear()
  builder.select.mockClear()
  builder.eq.mockClear()
  builder.is.mockClear()
})

const OP = 'op-1'
const BK = 'bk-1'

describe('setBookingStage', () => {
  it('POSTs the target stage code + force:false to the set-stage endpoint', async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ok: true,
      applied: true,
      requires_confirmation: false,
      warning: null,
      side_effects_skipped: [],
      current_stage_code: 'awaiting_payment',
      semantic_state: 'pending',
    })

    await setBookingStage(OP, BK, {
      target_stage_code: 'awaiting_payment',
      force: false,
    })

    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/bookings/${BK}/set-stage`,
      { target_stage_code: 'awaiting_payment', force: false },
    )
  })

  it('forwards force:true on the confirm re-POST', async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ok: true,
      applied: true,
      requires_confirmation: false,
      warning: null,
      side_effects_skipped: [],
      current_stage_code: 'finalised',
      semantic_state: 'finalised',
    })

    await setBookingStage(OP, BK, {
      target_stage_code: 'finalised',
      force: true,
    })

    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/bookings/${BK}/set-stage`,
      { target_stage_code: 'finalised', force: true },
    )
  })

  it('returns the requires_confirmation verdict to the caller', async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ok: true,
      applied: false,
      requires_confirmation: true,
      warning: 'Skipping payment collection.',
      side_effects_skipped: ['invoice_push'],
      current_stage_code: 'awaiting_payment',
      semantic_state: 'pending',
    })

    const result = await setBookingStage(OP, BK, {
      target_stage_code: 'finalised',
      force: false,
    })

    expect(result.requires_confirmation).toBe(true)
    expect(result.warning).toBe('Skipping payment collection.')
    expect(result.side_effects_skipped).toEqual(['invoice_push'])
  })
})

describe('fetchBookingStages', () => {
  it('selects the operator-scoped active lifecycle stages in sort order', async () => {
    const stages = await fetchBookingStages(OP)

    expect(fromMock).toHaveBeenCalledWith('booking_lifecycle_stages')
    expect(builder.eq).toHaveBeenCalledWith('operator_id', OP)
    expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
    expect(builder.eq).toHaveBeenCalledWith('active', true)
    expect(orderMock).toHaveBeenCalledWith('sort_order')
    expect(stages).toEqual(stageRows)
  })
})
