import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  consecutiveDays,
  ruleKindLabel,
  simulateEstimate,
} from './pricing-simulator'

describe('consecutiveDays', () => {
  it('returns N consecutive ISO dates starting from startISO', () => {
    expect(consecutiveDays('2026-06-10', 3)).toEqual([
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
    ])
  })

  it('handles month rollover (Jan 31 + 2 → Feb 1, Feb 2)', () => {
    expect(consecutiveDays('2026-01-31', 3)).toEqual([
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('handles year rollover (Dec 31 + 1 → Jan 1)', () => {
    expect(consecutiveDays('2026-12-31', 2)).toEqual([
      '2026-12-31',
      '2027-01-01',
    ])
  })

  it('returns [] for count <= 0', () => {
    expect(consecutiveDays('2026-06-10', 0)).toEqual([])
    expect(consecutiveDays('2026-06-10', -1)).toEqual([])
  })

  it('returns [] for malformed startISO', () => {
    expect(consecutiveDays('2026/06/10', 1)).toEqual([])
    expect(consecutiveDays('', 1)).toEqual([])
    expect(consecutiveDays('not-a-date', 1)).toEqual([])
  })

  it('count=1 returns just the start date', () => {
    expect(consecutiveDays('2026-06-10', 1)).toEqual(['2026-06-10'])
  })
})

describe('ruleKindLabel', () => {
  it('maps known rule kinds to human labels', () => {
    expect(ruleKindLabel('per_day_base')).toBe('Base price / day')
    expect(ruleKindLabel('percentage_discount')).toBe('Percentage discount')
    expect(ruleKindLabel('manual_override')).toBe('Manual override')
    expect(ruleKindLabel('voucher_percentage')).toBe('Voucher (percentage)')
  })

  it('falls back to the raw kind for unknown values', () => {
    // Future-proofing: a new engine kind ships before the dashboard
    // adds a label — we still want it to render rather than crash.
    expect(ruleKindLabel('some_brand_new_kind')).toBe('some_brand_new_kind')
  })
})

describe('simulateEstimate', () => {
  const okResponse = {
    line_items: [
      {
        product_id: 'p-1',
        label: 'Paragliding tandem',
        qty: 1,
        units: 3,
        unit_price: '120.00',
        line_total: '360.00',
        paid_to: 'operator',
      },
    ],
    operator_total: '360.00',
    hotel_total: '0.00',
    grand_total: '360.00',
    currency: 'EUR',
    applied_rules: [
      {
        rule_id: 'r-1',
        kind: 'per_day_base',
        before: 0,
        after: 360,
        detail: { tier_amount: 120 },
      },
    ],
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to the public estimate endpoint with the canonical body', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(okResponse), { status: 200 }),
    )

    const result = await simulateEstimate('para42', 'p-1', {
      selected_days: ['2026-06-10', '2026-06-11'],
      participants_count: 2,
    })

    expect(result).toEqual(okResponse)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(
      /\/api\/public\/operators\/para42\/products\/p-1\/estimate$/,
    )
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      selected_days: ['2026-06-10', '2026-06-11'],
      participants_count: 2,
      addon_lines: [],
    })
  })

  it('URL-encodes widget_token and product id', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(okResponse), { status: 200 }),
    )
    await simulateEstimate('weird token/!', 'id with space', {
      selected_days: [],
      participants_count: 1,
    })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('/operators/weird%20token%2F!/')
    expect(url).toContain('/products/id%20with%20space/')
  })

  // landr-wl7h regression guard — the simulator's first argument is the
  // operator's widget_token, NOT the slug (two distinct opaque values;
  // the backend's {token} path segment only ever matches widget_token).
  // Passing a slug-shaped value where a token belongs 404s with "unknown
  // widget token" on every environment — this asserts the built URL's
  // token segment is exactly whatever was passed as widgetToken, so a
  // caller passing `currentOperator.slug` instead of
  // `currentOperator.widget_token` would produce a URL that plainly does
  // NOT match the operator's real widget_token.
  it('builds the token path segment from widgetToken, not any slug-like value', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(okResponse), { status: 200 }),
    )
    const slug = 'para42'
    const widgetToken = 'CNe5RCiMijUjgJrftAwKA'
    await simulateEstimate(widgetToken, 'p-1', {
      selected_days: [],
      participants_count: 1,
    })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain(`/operators/${widgetToken}/`)
    expect(url).not.toContain(`/operators/${slug}/`)
  })

  it('forwards addon_lines verbatim when supplied', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(okResponse), { status: 200 }),
    )
    await simulateEstimate('para42', 'p-1', {
      selected_days: ['2026-06-10'],
      participants_count: 1,
      addon_lines: [{ product_id: 'addon-1', qty: 2 }],
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).addon_lines).toEqual([
      { product_id: 'addon-1', qty: 2 },
    ])
  })

  it('throws with the FastAPI detail string on non-2xx responses', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: 'product not found or not publicly available' }),
        { status: 404 },
      ),
    )
    await expect(
      simulateEstimate('para42', 'p-missing', {
        selected_days: [],
        participants_count: 1,
      }),
    ).rejects.toThrow('product not found or not publicly available')
  })

  it('falls back to "HTTP <status>" when the error body has no detail', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response('not json', { status: 500 }),
    )
    await expect(
      simulateEstimate('para42', 'p-1', {
        selected_days: [],
        participants_count: 1,
      }),
    ).rejects.toThrow('HTTP 500')
  })
})
