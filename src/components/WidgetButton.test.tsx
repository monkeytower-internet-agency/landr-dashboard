// landr-xen4 — WidgetButton unit tests.
//
// Contracts:
//   1. Renders nothing while loading (entitlements or token pending).
//   2. Renders nothing when embed feature is disabled.
//   3. Renders nothing when widget token is null (operator has no token).
//   4. Renders the button when embed is enabled + token is present.
//   5. Opens the correct widget URL for the current tier (dev/staging/prod).
//   6. Button has aria-label "Open booking widget".

import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, afterEach } from 'vitest'

import { WidgetButton } from './WidgetButton'

// ── control state ────────────────────────────────────────────────────────────

const { mockState } = vi.hoisted(() => ({
  mockState: {
    isEnabled: true,
    isLoading: false,
    operatorId: 'op-abc',
    widgetToken: 'tok-xyz' as string | null,
  },
}))

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: (_key: string) => mockState.isEnabled,
    isLoading: mockState.isLoading,
    effectiveIsStaff: false,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: mockState.operatorId,
  }),
}))

vi.mock('@/lib/shortcode', () => ({
  fetchWidgetToken: vi.fn(() => Promise.resolve(mockState.widgetToken)),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderButton(qc = makeQc()) {
  return render(
    <QueryClientProvider client={qc}>
      <WidgetButton />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  mockState.isEnabled = true
  mockState.isLoading = false
  mockState.operatorId = 'op-abc'
  mockState.widgetToken = 'tok-xyz'
})

// ── tests ────────────────────────────────────────────────────────────────────

describe('WidgetButton (landr-xen4)', () => {
  it('renders nothing while entitlements are loading', () => {
    mockState.isLoading = true
    const { container } = renderButton()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when embed feature is disabled', async () => {
    mockState.isEnabled = false
    const { container } = renderButton()
    // Wait for token query to settle; still should be empty
    await waitFor(() => {})
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when widget token is null', async () => {
    mockState.widgetToken = null
    const { container } = renderButton()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders the button when embed is enabled and token present', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    renderButton()
    const btn = await screen.findByTestId('widget-button')
    expect(btn).toBeInTheDocument()
  })

  it('has aria-label "Open booking widget"', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    renderButton()
    const link = await screen.findByRole('link', { name: 'Open booking widget' })
    expect(link).toBeInTheDocument()
  })

  it('builds the dev widget URL on dev tier', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    renderButton()
    const link = await screen.findByRole('link', { name: 'Open booking widget' })
    expect(link).toHaveAttribute('href', expect.stringContaining('bw-dev.landr.de'))
    expect(link).toHaveAttribute('href', expect.stringContaining('tok-xyz'))
  })

  it('builds the staging widget URL on staging tier', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    renderButton()
    const link = await screen.findByRole('link', { name: 'Open booking widget' })
    expect(link).toHaveAttribute('href', expect.stringContaining('bw-staging.landr.de'))
  })

  it('builds the live (prod) widget URL on prod tier', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
    renderButton()
    const link = await screen.findByRole('link', { name: 'Open booking widget' })
    expect(link).toHaveAttribute('href', expect.stringContaining('bw.landr.de'))
    // Must NOT point at the dev or staging host
    expect(link).not.toHaveAttribute('href', expect.stringContaining('bw-dev'))
    expect(link).not.toHaveAttribute('href', expect.stringContaining('bw-staging'))
  })

  it('falls back to dev host when VITE_DEPLOY_TIER is unset', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', '')
    renderButton()
    const link = await screen.findByRole('link', { name: 'Open booking widget' })
    expect(link).toHaveAttribute('href', expect.stringContaining('bw-dev.landr.de'))
  })

  it('opens in a new tab with noopener noreferrer', async () => {
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    renderButton()
    const link = await screen.findByRole('link', { name: 'Open booking widget' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
