// landr-7dya.19 / landr-hisw / landr-p3b7 — TierBadge unit tests.
//
// Covers:
//   - Plain badge (static; backward-compatible): dev/staging/prod/unset
//   - Switcher dropdown (landr-hisw): opens, lists other tiers, correct hrefs,
//     shows current-tier disabled row, renders on prod when showProd is set
//   - Staff gate (landr-p3b7): non-staff omits Dev; staff includes Dev

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, afterEach } from 'vitest'
import { vi } from 'vitest'

import { TierBadge } from './TierBadge'

afterEach(() => {
  vi.unstubAllEnvs()
})

// ─── Plain badge (backward-compatible) ───────────────────────────────────────

describe('TierBadge plain badge (landr-7dya.19)', () => {
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

  it('renders PROD badge when showProd is true', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
    render(<TierBadge showProd />)
    const badge = screen.getByRole('status', { name: 'Deploy tier: PROD' })
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('PROD')
  })

  it('renders with explicit tier prop (overrides env)', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    render(<TierBadge tier="staging" />)
    expect(screen.getByRole('status', { name: 'Deploy tier: STAGING' })).toBeInTheDocument()
  })

  it('renders nothing when explicit tier is null', () => {
    const { container } = render(<TierBadge tier={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ─── Switcher dropdown (landr-hisw) ─────────────────────────────────────────

describe('TierBadge switcher dropdown (landr-hisw)', () => {
  it('renders a clickable button trigger on dev', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    render(<TierBadge switcher showProd />)
    const trigger = screen.getByTestId('tier-badge-switcher-dev')
    expect(trigger).toBeInTheDocument()
  })

  it('shows current tier as disabled row and other tiers as links on dev', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    render(<TierBadge switcher showProd />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-dev'))

    // Current tier row is disabled
    const currentRow = screen.getByTestId('tier-switch-current-dev')
    expect(currentRow).toBeInTheDocument()
    expect(currentRow).toHaveTextContent('Dev')
    expect(currentRow).toHaveTextContent('(current)')

    // Other tiers present
    const toStaging = screen.getByTestId('tier-switch-to-staging')
    expect(toStaging).toBeInTheDocument()
    const toProd = screen.getByTestId('tier-switch-to-prod')
    expect(toProd).toBeInTheDocument()
  })

  it('links to the correct tier dashboard origin for staging (staff sees dev link)', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    render(<TierBadge switcher showProd isStaff />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-staging'))

    const toDevLink = screen.getByTestId('tier-switch-to-dev')
    expect(toDevLink).toHaveAttribute('href', expect.stringContaining('dashboard.dev.landr.de'))

    const toProdLink = screen.getByTestId('tier-switch-to-prod')
    expect(toProdLink).toHaveAttribute('href', expect.stringContaining('dashboard.landr.de'))
  })

  it('shows switcher on prod when showProd is set (staff sees dev link)', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
    render(<TierBadge switcher showProd isStaff />)
    const trigger = screen.getByTestId('tier-badge-switcher-prod')
    expect(trigger).toBeInTheDocument()

    await userEvent.click(trigger)
    expect(screen.getByTestId('tier-switch-current-prod')).toBeInTheDocument()
    expect(screen.getByTestId('tier-switch-to-dev')).toBeInTheDocument()
    expect(screen.getByTestId('tier-switch-to-staging')).toBeInTheDocument()
  })

  it('renders nothing when tier is null even with switcher=true', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', '')
    const { container } = render(<TierBadge switcher showProd />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders plain badge without switcher prop (backward compat on dev)', () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    render(<TierBadge />)
    // Plain static span, not a button
    expect(screen.getByRole('status', { name: 'Deploy tier: DEV' })).toBeInTheDocument()
    expect(screen.queryByTestId('tier-badge-switcher-dev')).not.toBeInTheDocument()
  })

  it('includes current path in jump link href', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    // jsdom default location is about:blank → pathname='/'
    render(<TierBadge switcher showProd />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-dev'))

    const toStaging = screen.getByTestId('tier-switch-to-staging')
    // href should include the current path (/) appended to the origin
    expect(toStaging).toHaveAttribute('href', 'https://dashboard-staging.landr.de/')
  })
})

// ─── Staff gate (landr-p3b7) ─────────────────────────────────────────────────

describe('TierBadge switcher staff gate (landr-p3b7)', () => {
  it('non-staff on staging: omits Dev, keeps Prod only', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    render(<TierBadge switcher showProd isStaff={false} />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-staging'))

    expect(screen.queryByTestId('tier-switch-to-dev')).not.toBeInTheDocument()
    expect(screen.getByTestId('tier-switch-to-prod')).toBeInTheDocument()
  })

  it('staff on staging: includes Dev and Prod', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    render(<TierBadge switcher showProd isStaff />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-staging'))

    expect(screen.getByTestId('tier-switch-to-dev')).toBeInTheDocument()
    expect(screen.getByTestId('tier-switch-to-prod')).toBeInTheDocument()
  })

  it('non-staff on prod: omits Dev, keeps Staging only', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
    render(<TierBadge switcher showProd isStaff={false} />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-prod'))

    expect(screen.queryByTestId('tier-switch-to-dev')).not.toBeInTheDocument()
    expect(screen.getByTestId('tier-switch-to-staging')).toBeInTheDocument()
  })

  it('staff on prod: includes Dev and Staging', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
    render(<TierBadge switcher showProd isStaff />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-prod'))

    expect(screen.getByTestId('tier-switch-to-dev')).toBeInTheDocument()
    expect(screen.getByTestId('tier-switch-to-staging')).toBeInTheDocument()
  })

  it('non-staff on dev: others are staging+prod (dev is current; no filtering effect)', async () => {
    // When the user IS on dev, dev is the current tier and never appears in
    // others — the filter has no effect here.
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    render(<TierBadge switcher showProd isStaff={false} />)
    await userEvent.click(screen.getByTestId('tier-badge-switcher-dev'))

    expect(screen.getByTestId('tier-switch-to-staging')).toBeInTheDocument()
    expect(screen.getByTestId('tier-switch-to-prod')).toBeInTheDocument()
  })

  it('non-staff on staging: zero-targets edge case does not apply (prod remains)', () => {
    // Prod is always included regardless of staff; only dev is gated.
    // So the "zero targets → plain badge" path is not reachable for staging/prod tiers.
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    render(<TierBadge switcher showProd isStaff={false} />)
    // Still shows as a dropdown button trigger (not collapsed to a plain static badge).
    expect(screen.getByTestId('tier-badge-switcher-staging')).toBeInTheDocument()
  })
})
