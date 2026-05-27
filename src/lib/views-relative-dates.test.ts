// landr-1zxt — relative-date token resolver tests.
//
// Time pinning uses vi.spyOn(Date, 'now') per the
// vitest-react-query-fake-timers-deadlock memory — vi.useFakeTimers
// would deadlock React Query in any test importing TanStack hooks.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCustomNDaysRange,
  CUSTOM_N_DAYS_MAX,
  CUSTOM_N_DAYS_MIN,
  describeCustomNDaysRange,
  describeRelativeToken,
  detectCustomNDaysRange,
  findRangePreset,
  findSinglePreset,
  isRelativeToken,
  resolveRelativeDate,
  RELATIVE_PRESETS,
  validateCustomNDays,
} from '@/lib/views-relative-dates'

// Helper: build a "now" Date for a specific local Y-M-D (months are 0-based).
function localDate(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveRelativeDate — anchors', () => {
  it('today / now → current local date', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('today', now)).toBe('2026-05-21')
    expect(resolveRelativeDate('now', now)).toBe('2026-05-21')
  })

  it('tomorrow / yesterday', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('tomorrow', now)).toBe('2026-05-22')
    expect(resolveRelativeDate('yesterday', now)).toBe('2026-05-20')
  })

  it('start_of_week is Monday (Europe convention)', () => {
    // 2026-05-21 is a Thursday → Monday = 2026-05-18.
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('start_of_week', now)).toBe('2026-05-18')
    expect(resolveRelativeDate('end_of_week', now)).toBe('2026-05-24')
  })

  it('Sunday rolls back to previous Monday', () => {
    // 2026-05-24 is a Sunday → Monday = 2026-05-18.
    const sunday = localDate(2026, 5, 24)
    expect(resolveRelativeDate('start_of_week', sunday)).toBe('2026-05-18')
    expect(resolveRelativeDate('end_of_week', sunday)).toBe('2026-05-24')
  })

  it('Monday returns itself for start_of_week', () => {
    const monday = localDate(2026, 5, 18)
    expect(resolveRelativeDate('start_of_week', monday)).toBe('2026-05-18')
    expect(resolveRelativeDate('end_of_week', monday)).toBe('2026-05-24')
  })

  it('start_of_month / end_of_month', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('start_of_month', now)).toBe('2026-05-01')
    expect(resolveRelativeDate('end_of_month', now)).toBe('2026-05-31')
  })

  it('end_of_month handles February correctly (non-leap)', () => {
    const feb = localDate(2026, 2, 10)
    expect(resolveRelativeDate('end_of_month', feb)).toBe('2026-02-28')
  })

  it('end_of_month handles leap February', () => {
    const feb = localDate(2024, 2, 10)
    expect(resolveRelativeDate('end_of_month', feb)).toBe('2024-02-29')
  })

  it('start_of_year / end_of_year', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('start_of_year', now)).toBe('2026-01-01')
    expect(resolveRelativeDate('end_of_year', now)).toBe('2026-12-31')
  })
})

// landr-m4zq — weekStartsOn drives start_of_week / end_of_week.
describe('resolveRelativeDate — weekStartsOn (landr-m4zq)', () => {
  // 2026-05-21 is a Thursday. Wall-clock calendar for context:
  //   Sun 17 · Mon 18 · Tue 19 · Wed 20 · Thu 21 · Fri 22 · Sat 23 · Sun 24
  const thursday = localDate(2026, 5, 21)

  it('weekStartsOn=1 (Monday, default) → previous Monday', () => {
    expect(resolveRelativeDate('start_of_week', thursday, 1)).toBe('2026-05-18')
    expect(resolveRelativeDate('end_of_week', thursday, 1)).toBe('2026-05-24')
  })

  it('weekStartsOn=0 (Sunday) → previous Sunday', () => {
    expect(resolveRelativeDate('start_of_week', thursday, 0)).toBe('2026-05-17')
    expect(resolveRelativeDate('end_of_week', thursday, 0)).toBe('2026-05-23')
  })

  it('weekStartsOn=0 — Sunday returns itself', () => {
    const sunday = localDate(2026, 5, 24)
    expect(resolveRelativeDate('start_of_week', sunday, 0)).toBe('2026-05-24')
    expect(resolveRelativeDate('end_of_week', sunday, 0)).toBe('2026-05-30')
  })

  it('default weekStartsOn is 1 when omitted', () => {
    // Calling with only (token, now) must yield the Monday-first result.
    expect(resolveRelativeDate('start_of_week', thursday)).toBe('2026-05-18')
  })

  it('weekStartsOn flows through anchor+offset tokens', () => {
    expect(resolveRelativeDate('start_of_week+1w', thursday, 0)).toBe('2026-05-24')
    expect(resolveRelativeDate('end_of_week+1w', thursday, 0)).toBe('2026-05-30')
  })

  it('non-week anchors ignore weekStartsOn', () => {
    expect(resolveRelativeDate('today', thursday, 0)).toBe('2026-05-21')
    expect(resolveRelativeDate('start_of_month', thursday, 0)).toBe('2026-05-01')
  })
})

describe('resolveRelativeDate — pure offsets', () => {
  it('+Nd / -Nd from today', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('+7d', now)).toBe('2026-05-28')
    expect(resolveRelativeDate('-7d', now)).toBe('2026-05-14')
    expect(resolveRelativeDate('+30d', now)).toBe('2026-06-20')
  })

  it('+Nw / -Nw from today', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('+1w', now)).toBe('2026-05-28')
    expect(resolveRelativeDate('+2w', now)).toBe('2026-06-04')
    expect(resolveRelativeDate('-1w', now)).toBe('2026-05-14')
  })

  it('+Nm / -Nm from today', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('+1m', now)).toBe('2026-06-21')
    expect(resolveRelativeDate('-1m', now)).toBe('2026-04-21')
    expect(resolveRelativeDate('+12m', now)).toBe('2027-05-21')
  })

  it('+Ny / -Ny from today', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('+1y', now)).toBe('2027-05-21')
    expect(resolveRelativeDate('-1y', now)).toBe('2025-05-21')
  })
})

describe('resolveRelativeDate — anchor + offset', () => {
  it('today+7d / today-30d', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('today+7d', now)).toBe('2026-05-28')
    expect(resolveRelativeDate('today-30d', now)).toBe('2026-04-21')
  })

  it('tomorrow+1d', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('tomorrow+1d', now)).toBe('2026-05-23')
  })

  it('start_of_week+1w shifts to next Monday', () => {
    const now = localDate(2026, 5, 21) // Thursday
    expect(resolveRelativeDate('start_of_week+1w', now)).toBe('2026-05-25')
    expect(resolveRelativeDate('end_of_week+1w', now)).toBe('2026-05-31')
  })

  it('end_of_month-1d', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('end_of_month-1d', now)).toBe('2026-05-30')
  })

  it('start_of_month+1m for next month', () => {
    const now = localDate(2026, 5, 21)
    expect(resolveRelativeDate('start_of_month+1m', now)).toBe('2026-06-01')
    expect(resolveRelativeDate('end_of_month+1m', now)).toBe('2026-06-30')
  })
})

describe('resolveRelativeDate — month-end edge cases', () => {
  it('today+1m on Jan 31 clamps to Feb 28 (non-leap)', () => {
    const jan31 = localDate(2026, 1, 31)
    expect(resolveRelativeDate('today+1m', jan31)).toBe('2026-02-28')
  })

  it('today+1m on Jan 31 clamps to Feb 29 in leap year', () => {
    const jan31 = localDate(2024, 1, 31)
    expect(resolveRelativeDate('today+1m', jan31)).toBe('2024-02-29')
  })

  it('today-1m on Mar 31 clamps to Feb 28', () => {
    const mar31 = localDate(2026, 3, 31)
    expect(resolveRelativeDate('today-1m', mar31)).toBe('2026-02-28')
  })

  it('today+1y on Feb 29 of leap year clamps to Feb 28', () => {
    const feb29 = localDate(2024, 2, 29)
    expect(resolveRelativeDate('today+1y', feb29)).toBe('2025-02-28')
  })
})

describe('resolveRelativeDate — invalid tokens', () => {
  it.each([
    'not-a-token',
    '',
    'today+abc',
    'today+7',
    '+7',
    '7d',
    'today-7x',
    'lastweek',
  ])('rejects %s', (token) => {
    expect(resolveRelativeDate(token, localDate(2026, 5, 21))).toBeNull()
  })

  it('returns null for non-string inputs', () => {
    // @ts-expect-error — intentionally exercise the runtime guard.
    expect(resolveRelativeDate(null, localDate(2026, 5, 21))).toBeNull()
    // @ts-expect-error — intentionally exercise the runtime guard.
    expect(resolveRelativeDate(42, localDate(2026, 5, 21))).toBeNull()
  })

  it('uses Date.now() when no `now` argument is supplied', () => {
    // Pin Date.now to a known instant; resolver should fall back to it.
    const pinned = localDate(2026, 5, 21)
    vi.spyOn(Date, 'now').mockReturnValue(pinned.getTime())
    expect(resolveRelativeDate('today')).toBe('2026-05-21')
  })
})

describe('isRelativeToken', () => {
  it('returns true for valid tokens', () => {
    expect(isRelativeToken('today')).toBe(true)
    expect(isRelativeToken('+7d')).toBe(true)
    expect(isRelativeToken('start_of_week')).toBe(true)
    expect(isRelativeToken('today+1w')).toBe(true)
  })

  it('returns false for ISO dates and other strings', () => {
    expect(isRelativeToken('2026-05-21')).toBe(false)
    expect(isRelativeToken('hello')).toBe(false)
    expect(isRelativeToken('')).toBe(false)
  })

  it('returns false for non-strings', () => {
    expect(isRelativeToken(42)).toBe(false)
    expect(isRelativeToken(null)).toBe(false)
    expect(isRelativeToken(undefined)).toBe(false)
    expect(isRelativeToken({})).toBe(false)
  })
})

describe('describeRelativeToken', () => {
  it('labels bare anchors', () => {
    expect(describeRelativeToken('today')).toBe('Today')
    expect(describeRelativeToken('tomorrow')).toBe('Tomorrow')
    expect(describeRelativeToken('start_of_week')).toBe('Start of week')
    expect(describeRelativeToken('end_of_month')).toBe('End of month')
  })

  it('labels anchor + offset combos', () => {
    expect(describeRelativeToken('today+7d')).toBe('Today + 7 days')
    expect(describeRelativeToken('tomorrow-1d')).toBe('Tomorrow − 1 day')
    expect(describeRelativeToken('start_of_week+1w')).toBe(
      'Start of week + 1 week',
    )
  })

  it('labels pure offsets', () => {
    expect(describeRelativeToken('+7d')).toBe('In 7 days')
    expect(describeRelativeToken('-1w')).toBe('1 week ago')
    expect(describeRelativeToken('+1m')).toBe('In 1 month')
  })

  it('falls back to the raw token for unknown values', () => {
    expect(describeRelativeToken('garbage')).toBe('garbage')
  })
})

describe('preset registry', () => {
  it('contains the documented presets', () => {
    expect(RELATIVE_PRESETS.length).toBeGreaterThan(0)
    expect(findRangePreset('start_of_week', 'end_of_week')?.label).toBe(
      'This week',
    )
    expect(findRangePreset('start_of_month', 'end_of_month')?.label).toBe(
      'This month',
    )
    expect(findRangePreset('today', '+7d')?.label).toBe('Next 7 days')
    expect(findSinglePreset('today')?.label).toBe('Today')
  })

  it('returns undefined for non-preset combinations', () => {
    expect(findRangePreset('today', '+99d')).toBeUndefined()
    expect(findSinglePreset('+5d')).toBeUndefined()
  })
})

// landr-qc72 — configurable Next/Last N days range helpers.
describe('validateCustomNDays', () => {
  it('accepts integers within [MIN, MAX]', () => {
    expect(validateCustomNDays(1)).toBe(1)
    expect(validateCustomNDays(14)).toBe(14)
    expect(validateCustomNDays(365)).toBe(365)
    expect(validateCustomNDays('14')).toBe(14)
    expect(validateCustomNDays('  30  ')).toBe(30)
  })

  it('rejects out-of-range values', () => {
    expect(validateCustomNDays(0)).toBeNull()
    expect(validateCustomNDays(-1)).toBeNull()
    expect(validateCustomNDays(366)).toBeNull()
    expect(validateCustomNDays(CUSTOM_N_DAYS_MIN - 1)).toBeNull()
    expect(validateCustomNDays(CUSTOM_N_DAYS_MAX + 1)).toBeNull()
  })

  it('rejects non-integers and garbage', () => {
    expect(validateCustomNDays(1.5)).toBeNull()
    expect(validateCustomNDays('1.5')).toBeNull()
    expect(validateCustomNDays('abc')).toBeNull()
    expect(validateCustomNDays('')).toBeNull()
    expect(validateCustomNDays(null)).toBeNull()
    expect(validateCustomNDays(undefined)).toBeNull()
    expect(validateCustomNDays(Number.NaN)).toBeNull()
  })
})

describe('detectCustomNDaysRange', () => {
  it('detects Next N: today → today+Nd', () => {
    expect(detectCustomNDaysRange('today', 'today+14d')).toEqual({
      kind: 'next',
      n: 14,
    })
    expect(detectCustomNDaysRange('today', 'today+1d')).toEqual({
      kind: 'next',
      n: 1,
    })
    expect(detectCustomNDaysRange('today', 'today+365d')).toEqual({
      kind: 'next',
      n: 365,
    })
  })

  it('detects Last N: today-Nd → today', () => {
    expect(detectCustomNDaysRange('today-7d', 'today')).toEqual({
      kind: 'last',
      n: 7,
    })
    expect(detectCustomNDaysRange('today-30d', 'today')).toEqual({
      kind: 'last',
      n: 30,
    })
  })

  it('returns null for ranges outside [MIN, MAX]', () => {
    expect(detectCustomNDaysRange('today', 'today+0d')).toBeNull()
    expect(detectCustomNDaysRange('today', 'today+999d')).toBeNull()
    expect(detectCustomNDaysRange('today-999d', 'today')).toBeNull()
  })

  it('returns null for tokens that do not match the pattern', () => {
    expect(detectCustomNDaysRange('today', '+14d')).toBeNull()
    expect(detectCustomNDaysRange('start_of_week', 'end_of_week')).toBeNull()
    expect(detectCustomNDaysRange('today', 'tomorrow')).toBeNull()
    expect(detectCustomNDaysRange('today+1d', 'today+14d')).toBeNull()
  })
})

describe('buildCustomNDaysRange', () => {
  it('builds Next N token pairs', () => {
    expect(buildCustomNDaysRange('next', 14)).toEqual(['today', 'today+14d'])
    expect(buildCustomNDaysRange('next', 1)).toEqual(['today', 'today+1d'])
  })

  it('builds Last N token pairs', () => {
    expect(buildCustomNDaysRange('last', 30)).toEqual(['today-30d', 'today'])
  })

  it('roundtrips with detectCustomNDaysRange', () => {
    for (const kind of ['next', 'last'] as const) {
      for (const n of [1, 7, 14, 30, 90, 365]) {
        const [from, to] = buildCustomNDaysRange(kind, n)
        expect(detectCustomNDaysRange(from, to)).toEqual({ kind, n })
      }
    }
  })
})

describe('describeCustomNDaysRange', () => {
  it('formats Next/Last N days', () => {
    expect(describeCustomNDaysRange({ kind: 'next', n: 14 })).toBe(
      'Next 14 days',
    )
    expect(describeCustomNDaysRange({ kind: 'last', n: 30 })).toBe(
      'Last 30 days',
    )
  })
})
