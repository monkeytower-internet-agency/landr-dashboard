// Unit tests for release-promotion.ts pure/display helpers.
// landr-v9e4.10 coverage pass.
//
// Covers:
//   - fetchRuns: unwraps {runs}/bare-array/garbage/null → []
//   - fetchLocalWorktree: missing-repos fallback → {enabled:false, repos:[]}
//   - relativeTime: en-US pinned, null/invalid → '', past/future units
//   - shortSha: 7-char truncation, empty/null → '—'
//   - kindLabel: returns correct strings for both kinds

import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock api-client so we don't need a real HTTP stack
// ---------------------------------------------------------------------------

const { mockApi } = vi.hoisted(() => {
  return { mockApi: vi.fn() }
})

vi.mock('@/lib/api-client', () => ({ api: mockApi }))

import {
  fetchLocalWorktree,
  fetchRuns,
  kindLabel,
  relativeTime,
  shortSha,
} from '@/lib/release-promotion'

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// fetchRuns — unwrapping logic
// ---------------------------------------------------------------------------

describe('fetchRuns — unwraps various API shapes', () => {
  it('returns the array when the API returns a bare array', async () => {
    const runs = [{ id: 'run-1' }, { id: 'run-2' }]
    mockApi.mockResolvedValue(runs)
    const result = await fetchRuns()
    expect(result).toEqual(runs)
  })

  it('unwraps { runs: [...] } envelope', async () => {
    const runs = [{ id: 'run-1' }]
    mockApi.mockResolvedValue({ runs })
    const result = await fetchRuns()
    expect(result).toEqual(runs)
  })

  it('returns [] when API returns null', async () => {
    mockApi.mockResolvedValue(null)
    const result = await fetchRuns()
    expect(result).toEqual([])
  })

  it('returns [] when API returns undefined', async () => {
    mockApi.mockResolvedValue(undefined)
    const result = await fetchRuns()
    expect(result).toEqual([])
  })

  it('returns [] when API returns a non-array object without .runs', async () => {
    // This is the "garbage" shape — an object with no .runs array.
    // Previously caused "runs.filter is not a function" (documented incident).
    mockApi.mockResolvedValue({ other: 'field' })
    const result = await fetchRuns()
    expect(result).toEqual([])
  })

  it('returns [] for an empty {runs:[]} envelope', async () => {
    mockApi.mockResolvedValue({ runs: [] })
    const result = await fetchRuns()
    expect(result).toEqual([])
  })

  it('returns [] for an empty bare array', async () => {
    mockApi.mockResolvedValue([])
    const result = await fetchRuns()
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// fetchLocalWorktree — missing-repos fallback
// ---------------------------------------------------------------------------

describe('fetchLocalWorktree — repos fallback', () => {
  it('returns the full response when repos is a valid array', async () => {
    const resp = { enabled: true, repos: [{ repo: 'landr-api', branch: 'dev', uncommitted_count: 0, untracked_count: 0, ahead: 0, behind: 0, dirty: false }] }
    mockApi.mockResolvedValue(resp)
    const result = await fetchLocalWorktree()
    expect(result).toEqual(resp)
  })

  it('falls back to {enabled:false, repos:[]} when API returns null', async () => {
    mockApi.mockResolvedValue(null)
    const result = await fetchLocalWorktree()
    expect(result).toEqual({ enabled: false, repos: [] })
  })

  it('falls back when the response has no repos array', async () => {
    mockApi.mockResolvedValue({ enabled: true })
    const result = await fetchLocalWorktree()
    expect(result).toEqual({ enabled: false, repos: [] })
  })

  it('falls back when repos is not an array (e.g. null)', async () => {
    mockApi.mockResolvedValue({ enabled: true, repos: null })
    const result = await fetchLocalWorktree()
    expect(result).toEqual({ enabled: false, repos: [] })
  })
})

// ---------------------------------------------------------------------------
// relativeTime — pinned to en-US, null/invalid → ''
// ---------------------------------------------------------------------------

describe('relativeTime', () => {
  it('returns "" for null input', () => {
    expect(relativeTime(null)).toBe('')
  })

  it('returns "" for undefined input', () => {
    expect(relativeTime(undefined)).toBe('')
  })

  it('returns "" for an invalid ISO string', () => {
    expect(relativeTime('not-a-date')).toBe('')
  })

  it('returns "" for an empty string', () => {
    expect(relativeTime('')).toBe('')
  })

  it('returns a non-empty string for a past date ~25 hours ago', () => {
    const past = new Date(Date.now() - 25 * 3600_000).toISOString()
    const result = relativeTime(past)
    expect(result.length).toBeGreaterThan(0)
    // en-US pinned: should contain English words
    expect(result).toMatch(/yesterday|day|hour/i)
  })

  it('returns a non-empty string for a future date ~25 hours from now', () => {
    const future = new Date(Date.now() + 25 * 3600_000).toISOString()
    const result = relativeTime(future)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toMatch(/tomorrow|day|hour/i)
  })

  it('returns a string with minutes for a date ~45 minutes ago', () => {
    const past = new Date(Date.now() - 45 * 60_000).toISOString()
    const result = relativeTime(past)
    expect(result).toMatch(/minute/i)
  })

  it('returns a "now"-like string for a date very close to now', () => {
    const now = new Date(Date.now() - 5_000).toISOString() // 5 seconds ago
    const result = relativeTime(now)
    expect(result.length).toBeGreaterThan(0)
    // "now" or "0 seconds ago" etc.
  })

  it('is pinned to en-US — does not emit German words', () => {
    const past = new Date(Date.now() - 26 * 3600_000).toISOString()
    const result = relativeTime(past)
    // de-DE would say "vor X Stunden" — should NOT appear
    expect(result).not.toMatch(/vor\s/)
    expect(result).not.toMatch(/Stunden/)
    expect(result).not.toMatch(/Tagen/)
  })
})

// ---------------------------------------------------------------------------
// shortSha
// ---------------------------------------------------------------------------

describe('shortSha', () => {
  it('returns the first 7 characters of a full SHA', () => {
    expect(shortSha('abc1234def5678')).toBe('abc1234')
  })

  it('returns exactly 7 chars for a 40-char SHA', () => {
    const sha = '0'.repeat(40)
    expect(shortSha(sha)).toBe('0000000')
  })

  it('returns the full string when it is shorter than 7 chars', () => {
    expect(shortSha('abc')).toBe('abc')
  })

  it('returns "—" for null', () => {
    expect(shortSha(null)).toBe('—')
  })

  it('returns "—" for undefined', () => {
    expect(shortSha(undefined)).toBe('—')
  })

  it('returns "—" for an empty string', () => {
    expect(shortSha('')).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// kindLabel
// ---------------------------------------------------------------------------

describe('kindLabel', () => {
  it('returns "dev → staging" for dev_to_staging', () => {
    expect(kindLabel('dev_to_staging')).toBe('dev → staging')
  })

  it('returns "staging → main" for staging_to_main', () => {
    expect(kindLabel('staging_to_main')).toBe('staging → main')
  })
})
