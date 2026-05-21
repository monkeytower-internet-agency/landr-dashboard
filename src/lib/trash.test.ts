import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock() picks them up before module evaluation.
// We swap out the api-client wrapper to capture (method, path) per call and
// pump back a configurable response.
// ---------------------------------------------------------------------------

const { mock } = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ method: string; path: string; body?: unknown }>,
    response: undefined as unknown,
    throwError: null as Error | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/api-client', () => ({
  api: vi.fn(async (method: string, path: string, body?: unknown) => {
    mock.state.calls.push({ method, path, body })
    if (mock.state.throwError) throw mock.state.throwError
    return mock.state.response
  }),
}))

import {
  fetchTrash,
  restoreTrashRow,
  TRASH_KINDS,
  trashDeletedAtDisplay,
  trashRowLabel,
  type BookingTrashRow,
  type ContactTrashRow,
  type OperatorTagTrashRow,
  type PricingSchemeTrashRow,
  type ProductTrashRow,
} from './trash'

beforeEach(() => {
  mock.state.calls = []
  mock.state.response = undefined
  mock.state.throwError = null
})

afterEach(() => {
  vi.clearAllMocks()
})

const OP = 'op-1'
const ROW_ID = 'row-abc-123'

// ---- fetchTrash -----------------------------------------------------------

describe('fetchTrash', () => {
  it.each(TRASH_KINDS)(
    'hits GET /api/staff/operators/{op}/trash/%s',
    async (kind) => {
      mock.state.response = []
      await fetchTrash(OP, kind)
      expect(mock.state.calls).toEqual([
        {
          method: 'GET',
          path: `/api/staff/operators/${OP}/trash/${kind}`,
          body: undefined,
        },
      ])
    },
  )

  it('returns rows from the api wrapper unchanged', async () => {
    const sample: ContactTrashRow[] = [
      {
        id: ROW_ID,
        deleted_at: '2026-05-20T10:00:00.000Z',
        first_name: 'Carol',
        last_name: 'Chen',
        email: 'c@example.com',
        phone: null,
      },
    ]
    mock.state.response = sample
    const out = await fetchTrash(OP, 'contacts')
    expect(out).toEqual(sample)
  })

  it('propagates server errors', async () => {
    mock.state.throwError = new Error('boom')
    await expect(fetchTrash(OP, 'contacts')).rejects.toThrow('boom')
  })
})

// ---- restoreTrashRow ------------------------------------------------------

describe('restoreTrashRow', () => {
  it.each(TRASH_KINDS)(
    'hits POST /api/staff/operators/{op}/trash/%s/{rowId}/restore',
    async (kind) => {
      mock.state.response = { id: ROW_ID, deleted_at: null }
      await restoreTrashRow(OP, kind, ROW_ID)
      expect(mock.state.calls).toEqual([
        {
          method: 'POST',
          path: `/api/staff/operators/${OP}/trash/${kind}/${ROW_ID}/restore`,
          body: undefined,
        },
      ])
    },
  )

  it('returns the restored row from the server', async () => {
    const restored: ContactTrashRow = {
      id: ROW_ID,
      deleted_at: null as unknown as string,
      first_name: 'Carol',
      last_name: 'Chen',
      email: 'c@example.com',
      phone: null,
    }
    mock.state.response = restored
    const out = await restoreTrashRow(OP, 'contacts', ROW_ID)
    expect(out).toEqual(restored)
  })

  it('propagates server errors (e.g. 404 wrong-operator)', async () => {
    mock.state.throwError = new Error('row_not_found')
    await expect(restoreTrashRow(OP, 'contacts', ROW_ID)).rejects.toThrow(
      'row_not_found',
    )
  })
})

// ---- trashRowLabel --------------------------------------------------------

describe('trashRowLabel', () => {
  it('bookings → customer name (first + last)', () => {
    const row: BookingTrashRow = {
      id: 'b-abc12345',
      deleted_at: '2026-05-20T10:00:00.000Z',
      created_at: '2026-05-10T10:00:00.000Z',
      currency: 'EUR',
      gross_total: 300,
      customer: {
        id: 'c-1',
        first_name: 'Carol',
        last_name: 'Chen',
        email: 'c@example.com',
      },
    }
    expect(trashRowLabel('bookings', row)).toEqual({
      label: 'Carol Chen',
      sublabel: 'b-abc123',
    })
  })

  it('bookings → falls back to customer email when no name', () => {
    const row: BookingTrashRow = {
      id: 'b-1',
      deleted_at: '2026-05-20T10:00:00.000Z',
      created_at: '2026-05-10T10:00:00.000Z',
      currency: 'EUR',
      gross_total: 0,
      customer: {
        id: 'c-1',
        first_name: null,
        last_name: null,
        email: 'c@example.com',
      },
    }
    expect(trashRowLabel('bookings', row).label).toBe('c@example.com')
  })

  it('bookings → em dash when customer is null', () => {
    const row: BookingTrashRow = {
      id: 'b-1',
      deleted_at: '2026-05-20T10:00:00.000Z',
      created_at: '2026-05-10T10:00:00.000Z',
      currency: 'EUR',
      gross_total: 0,
      customer: null,
    }
    expect(trashRowLabel('bookings', row).label).toBe('—')
  })

  it('contacts → first + last name', () => {
    const row: ContactTrashRow = {
      id: 'c-1',
      deleted_at: '2026-05-20T10:00:00.000Z',
      first_name: 'Carol',
      last_name: 'Chen',
      email: 'c@example.com',
      phone: '+353000000',
    }
    expect(trashRowLabel('contacts', row)).toEqual({
      label: 'Carol Chen',
      sublabel: 'c@example.com',
    })
  })

  it('contacts → falls back to email then phone then dash', () => {
    expect(
      trashRowLabel('contacts', {
        id: 'c-1',
        deleted_at: '',
        first_name: null,
        last_name: null,
        email: 'fallback@example.com',
        phone: null,
      } as ContactTrashRow).label,
    ).toBe('fallback@example.com')

    expect(
      trashRowLabel('contacts', {
        id: 'c-1',
        deleted_at: '',
        first_name: null,
        last_name: null,
        email: null,
        phone: '+353000000',
      } as ContactTrashRow).label,
    ).toBe('+353000000')

    expect(
      trashRowLabel('contacts', {
        id: 'c-1',
        deleted_at: '',
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
      } as ContactTrashRow).label,
    ).toBe('—')
  })

  it('products → name + slug', () => {
    const row: ProductTrashRow = {
      id: 'p-1',
      deleted_at: '2026-05-20T10:00:00.000Z',
      name: 'Tandem Flight',
      slug: 'tandem-flight',
      product_kind: 'service',
    }
    expect(trashRowLabel('products', row)).toEqual({
      label: 'Tandem Flight',
      sublabel: 'tandem-flight',
    })
  })

  it('operator_tags → name + color', () => {
    const row: OperatorTagTrashRow = {
      id: 't-1',
      deleted_at: '2026-05-20T10:00:00.000Z',
      name: 'VIP',
      color: '#3b82f6',
    }
    expect(trashRowLabel('operator_tags', row)).toEqual({
      label: 'VIP',
      sublabel: '#3b82f6',
    })
  })

  it('pricing_schemes → name + currency', () => {
    const row: PricingSchemeTrashRow = {
      id: 'ps-1',
      deleted_at: '2026-05-20T10:00:00.000Z',
      name: 'Standard',
      currency: 'EUR',
    }
    expect(trashRowLabel('pricing_schemes', row)).toEqual({
      label: 'Standard',
      sublabel: 'EUR',
    })
  })
})

// ---- trashDeletedAtDisplay ------------------------------------------------

describe('trashDeletedAtDisplay', () => {
  it('formats a valid ISO timestamp', () => {
    const out = trashDeletedAtDisplay('2026-05-20T10:00:00.000Z')
    // Don't pin the exact locale string; just verify non-empty + not the raw ISO.
    expect(out).not.toBe('2026-05-20T10:00:00.000Z')
    expect(out.length).toBeGreaterThan(0)
  })

  it('returns the input untouched when it cannot be parsed', () => {
    expect(trashDeletedAtDisplay('not-a-date')).toBe('not-a-date')
  })
})
