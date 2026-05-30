// landr-7dya.21 — unit tests for deploy-tier detection.
//
// Two layers:
//   - getTier(): reads VITE_DEPLOY_TIER, narrows unknowns to null.
//   - resolveTier(serverTier): prefers a server-reported tier, falls back to
//     getTier(). The /release console uses resolveTier() so a misconfigured
//     static build can still recover from the runtime answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTier, resolveTier } from './tier'

describe('getTier', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEPLOY_TIER', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns dev for "dev"', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    expect(getTier()).toBe('dev')
  })
  it('returns staging for "staging"', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    expect(getTier()).toBe('staging')
  })
  it('returns prod for "prod"', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
    expect(getTier()).toBe('prod')
  })
  it('trims surrounding whitespace', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', '  staging  ')
    expect(getTier()).toBe('staging')
  })
  it('returns null for an unknown value', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'production')
    expect(getTier()).toBeNull()
  })
  it('returns null when unset / empty', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', '')
    expect(getTier()).toBeNull()
  })
})

describe('resolveTier', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefers a valid server-reported tier over the build env', () => {
    expect(resolveTier('staging')).toBe('staging')
    expect(resolveTier('prod')).toBe('prod')
  })
  it('falls back to getTier() when server tier is null', () => {
    expect(resolveTier(null)).toBe('dev')
  })
  it('falls back to getTier() when server tier is undefined', () => {
    expect(resolveTier(undefined)).toBe('dev')
  })
  it('returns null when neither source has a valid value', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', '')
    expect(resolveTier(null)).toBeNull()
    expect(resolveTier(undefined)).toBeNull()
  })
})
