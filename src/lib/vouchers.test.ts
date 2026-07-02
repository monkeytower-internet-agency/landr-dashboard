/**
 * Tests for lib/vouchers.ts (landr-v198).
 *
 * Covers:
 *   - CRUD wrappers       — URL + method + body shape via mocked api().
 *   - validateVoucherForm — amount > 0, percent <= 100, window order,
 *                           max_uses integer.
 *   - formToInput         — uppercase code, numeric coercion, null-empty.
 *   - format helpers      — amount label, usage label, ISO<->local round-trip.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-client', () => ({
  api: vi.fn(),
}))

import { api } from '@/lib/api-client'
import {
  createVoucher,
  deleteVoucher,
  fetchVouchers,
  formToInput,
  formatUsage,
  formatVoucherAmount,
  isVoucherScopeErrorCode,
  localFromIso,
  patchVoucher,
  validateVoucherForm,
  voucherScopeErrorMessage,
  type Voucher,
  type VoucherFormValues,
} from './vouchers'

beforeEach(() => {
  vi.mocked(api).mockReset()
})

const OP = 'op-1'

function form(overrides: Partial<VoucherFormValues> = {}): VoucherFormValues {
  return {
    code: 'SUMMER25',
    kind: 'percent',
    amount: '25',
    max_uses: '',
    valid_from: '',
    valid_until: '',
    scope: 'booking',
    applies_to_product_id: '',
    campaign_id: '',
    description: '',
    active: true,
    ...overrides,
  }
}

function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v1',
    operator_id: OP,
    code: 'WELCOME10',
    kind: 'percent',
    amount: 10,
    currency: 'EUR',
    max_uses: 100,
    used_count: 3,
    valid_from: null,
    valid_until: null,
    scope: 'booking',
    applies_to_product_id: null,
    campaign_id: null,
    description: null,
    active: true,
    created_at: '2026-05-22T03:00:00Z',
    updated_at: '2026-05-22T03:00:00Z',
    ...overrides,
  }
}

describe('CRUD wrappers', () => {
  it('fetchVouchers calls GET /api/staff/operators/{op}/vouchers', async () => {
    vi.mocked(api).mockResolvedValueOnce([])
    await fetchVouchers(OP)
    expect(api).toHaveBeenCalledWith(
      'GET',
      `/api/staff/operators/${OP}/vouchers`,
    )
  })

  it('createVoucher posts the input payload', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 'v1' })
    await createVoucher(OP, { code: 'SUMMER25', kind: 'percent', amount: 25 })
    expect(api).toHaveBeenCalledWith(
      'POST',
      `/api/staff/operators/${OP}/vouchers`,
      { code: 'SUMMER25', kind: 'percent', amount: 25 },
    )
  })

  it('patchVoucher sends the partial payload', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 'v1' })
    await patchVoucher(OP, 'v1', { amount: 15 })
    expect(api).toHaveBeenCalledWith(
      'PATCH',
      `/api/staff/operators/${OP}/vouchers/v1`,
      { amount: 15 },
    )
  })

  it('deleteVoucher issues a DELETE', async () => {
    vi.mocked(api).mockResolvedValueOnce({ status: 'deleted' })
    await deleteVoucher(OP, 'v1')
    expect(api).toHaveBeenCalledWith(
      'DELETE',
      `/api/staff/operators/${OP}/vouchers/v1`,
    )
  })
})

describe('validateVoucherForm', () => {
  it('accepts a valid percent voucher', () => {
    expect(validateVoucherForm(form())).toEqual({})
  })

  it('requires a code', () => {
    expect(validateVoucherForm(form({ code: '   ' })).code).toBeTruthy()
  })

  it('rejects amount <= 0', () => {
    expect(validateVoucherForm(form({ amount: '0' })).amount).toBeTruthy()
    expect(validateVoucherForm(form({ amount: '-5' })).amount).toBeTruthy()
  })

  it('requires amount', () => {
    expect(validateVoucherForm(form({ amount: '' })).amount).toBeTruthy()
  })

  it('caps percent at 100 but allows flat over 100', () => {
    expect(
      validateVoucherForm(form({ kind: 'percent', amount: '150' })).amount,
    ).toBeTruthy()
    expect(
      validateVoucherForm(form({ kind: 'flat', amount: '150' })).amount,
    ).toBeUndefined()
  })

  it('rejects non-positive / non-integer max_uses', () => {
    expect(validateVoucherForm(form({ max_uses: '0' })).max_uses).toBeTruthy()
    expect(validateVoucherForm(form({ max_uses: '2.5' })).max_uses).toBeTruthy()
    expect(validateVoucherForm(form({ max_uses: '10' })).max_uses).toBeUndefined()
    expect(validateVoucherForm(form({ max_uses: '' })).max_uses).toBeUndefined()
  })

  it('rejects valid_until <= valid_from', () => {
    expect(
      validateVoucherForm(
        form({
          valid_from: '2026-06-01T00:00',
          valid_until: '2026-05-01T00:00',
        }),
      ).valid_until,
    ).toBeTruthy()
  })

  it('accepts valid_until > valid_from', () => {
    expect(
      validateVoucherForm(
        form({
          valid_from: '2026-05-01T00:00',
          valid_until: '2026-06-01T00:00',
        }),
      ).valid_until,
    ).toBeUndefined()
  })
})

describe('formToInput', () => {
  it('uppercases the code and coerces numbers', () => {
    const input = formToInput(form({ code: 'summer25', amount: '25' }))
    expect(input.code).toBe('SUMMER25')
    expect(input.amount).toBe(25)
    expect(input.kind).toBe('percent')
  })

  it('nulls empty optional fields', () => {
    const input = formToInput(form({ max_uses: '', description: '  ' }))
    expect(input.max_uses).toBeNull()
    expect(input.description).toBeNull()
    expect(input.valid_from).toBeNull()
    expect(input.valid_until).toBeNull()
  })

  it('marshals max_uses + description when present', () => {
    const input = formToInput(form({ max_uses: '50', description: 'Promo' }))
    expect(input.max_uses).toBe(50)
    expect(input.description).toBe('Promo')
  })

  it('nulls applies_to_product_id and campaign_id when unset', () => {
    const input = formToInput(form())
    expect(input.applies_to_product_id).toBeNull()
    expect(input.campaign_id).toBeNull()
  })

  it('passes through a selected applies_to_product_id / campaign_id', () => {
    const input = formToInput(
      form({ applies_to_product_id: 'prod-1', campaign_id: 'camp-1' }),
    )
    expect(input.applies_to_product_id).toBe('prod-1')
    expect(input.campaign_id).toBe('camp-1')
  })
})

describe('voucher scope-reference errors', () => {
  it('isVoucherScopeErrorCode recognizes the three server codes', () => {
    expect(isVoucherScopeErrorCode('invalid_applies_to_product_id')).toBe(true)
    expect(isVoucherScopeErrorCode('invalid_campaign_id')).toBe(true)
    expect(isVoucherScopeErrorCode('invalid_scope_reference')).toBe(true)
    expect(isVoucherScopeErrorCode('voucher_code_taken')).toBe(false)
  })

  it('voucherScopeErrorMessage returns friendly copy for each code', () => {
    expect(voucherScopeErrorMessage('invalid_applies_to_product_id')).toMatch(
      /product/i,
    )
    expect(voucherScopeErrorMessage('invalid_campaign_id')).toMatch(/campaign/i)
    expect(voucherScopeErrorMessage('invalid_scope_reference')).toMatch(
      /product or campaign/i,
    )
  })

  it('voucherScopeErrorMessage returns null for unrelated errors', () => {
    expect(voucherScopeErrorMessage('voucher_code_taken')).toBeNull()
    expect(voucherScopeErrorMessage('HTTP 500')).toBeNull()
  })
})

describe('format helpers', () => {
  it('formats percent amount', () => {
    expect(formatVoucherAmount(voucher({ kind: 'percent', amount: 10 }))).toBe(
      '10%',
    )
  })

  it('formats flat EUR amount', () => {
    expect(
      formatVoucherAmount(voucher({ kind: 'flat', amount: 50, currency: 'EUR' })),
    ).toBe('€50')
  })

  it('formats usage with and without a cap', () => {
    expect(formatUsage(voucher({ used_count: 3, max_uses: 100 }))).toBe('3 / 100')
    expect(formatUsage(voucher({ used_count: 7, max_uses: null }))).toBe('7 / ∞')
  })

  it('round-trips an ISO timestamp through localFromIso', () => {
    // localFromIso → datetime-local string; feeding it back through Date
    // should land within the same minute as the original instant.
    const iso = '2026-06-15T14:30:00.000Z'
    const local = localFromIso(iso)
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(new Date(local).getMinutes()).toBe(new Date(iso).getMinutes())
  })

  it('localFromIso returns empty string for null/invalid', () => {
    expect(localFromIso(null)).toBe('')
    expect(localFromIso('not-a-date')).toBe('')
  })
})
