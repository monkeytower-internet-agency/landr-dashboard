// landr-7dya.19 — TierBadge unit tests.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, afterEach } from 'vitest'
import { vi } from 'vitest'

import { TierBadge } from './TierBadge'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('TierBadge (landr-7dya.19)', () => {
  it('renders nothing when VITE_DEPLOY_TIER is prod', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
    const { container } = render(<TierBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when VITE_DEPLOY_TIER is undefined', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', '')
    const { container } = render(<TierBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders DEV badge when VITE_DEPLOY_TIER is dev', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    render(<TierBadge />)
    const badge = screen.getByRole('status', { name: 'Deploy tier: DEV' })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('DEV')
  })

  it('renders STAGING badge when VITE_DEPLOY_TIER is staging', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    render(<TierBadge />)
    const badge = screen.getByRole('status', { name: 'Deploy tier: STAGING' })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('STAGING')
  })
})
