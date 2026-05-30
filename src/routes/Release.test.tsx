// landr-7dya.21 — tier-aware /release tests.
//
// The /release console now switches on BOTH the deploy tier (resolved from
// VITE_DEPLOY_TIER or the server's viewer.tier) AND the viewer's role. This
// file asserts the matrix:
//
//   tier=dev     + staff promoter           → Promote-to-staging only
//   tier=dev     + staff approver           → Promote-to-staging only
//   tier=staging + staff promoter           → Production section (no
//                                             dev→staging)
//   tier=staging + staff approver           → Production section + can
//                                             approve pending customer
//                                             request
//   tier=prod    + staff approver           → No-actions card only
//   tier=staging + customer signer (Martin) → Request go-live card
//                                             (sends POST + toasts)
//   tier=staging + non-staff non-signer     → Redirect to home
//   tier unknown + staff                    → Read-only "tier unknown" card
//
// Critical invariant: a "dev → main" button or label NEVER appears on any
// tier/role combination. The `never_dev_to_main` test asserts this directly
// across the entire rendered tree for every staff combo.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ───────────────────────────────────────────────────────────────────

const { mock } = vi.hoisted(() => {
  const state = {
    effectiveIsStaff: true,
    entLoading: false,
    canPromoteStaging: false,
    canProposeProd: false,
    canApproveProd: false,
    serverTier: null as 'dev' | 'staging' | 'prod' | null,
    eligibility: { can_request_golive: false },
    runs: [] as Array<Record<string, unknown>>,
    statusError: null as Error | null,
    promoteCalls: [] as unknown[],
    proposeCalls: [] as unknown[],
    approveCalls: [] as unknown[],
    requestGoLiveCalls: [] as unknown[],
    requestGoLiveResult: { status: 'requested' as 'requested' | 'already_pending' },
  }
  return { mock: { state } }
})

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    isLandrStaff: mock.state.effectiveIsStaff,
    effectiveIsStaff: mock.state.effectiveIsStaff,
    isLoading: mock.state.entLoading,
  }),
}))

vi.mock('@/lib/release-promotion', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/release-promotion')
  >('@/lib/release-promotion')
  return {
    ...actual,
    fetchStatus: vi.fn(async () => {
      if (mock.state.statusError) throw mock.state.statusError
      return {
        repos: [
          {
            repo: 'landr-api',
            dev_sha: 'aaaaaaa1111111',
            staging_sha: 'bbbbbbb2222222',
            main_sha: 'ccccccc3333333',
            dev_to_staging_ahead: 3,
            staging_to_main_ahead: 5,
          },
        ],
        viewer: {
          can_promote_staging: mock.state.canPromoteStaging,
          can_propose_prod: mock.state.canProposeProd,
          can_approve_prod: mock.state.canApproveProd,
          tier: mock.state.serverTier,
        },
      }
    }),
    fetchRuns: vi.fn(async () => mock.state.runs),
    fetchGoLiveEligibility: vi.fn(async () => mock.state.eligibility),
    promoteToStaging: vi.fn(async (body: unknown) => {
      mock.state.promoteCalls.push(body)
      return { id: 'r1' }
    }),
    proposeToProd: vi.fn(async (body: unknown) => {
      mock.state.proposeCalls.push(body)
      return { id: 'r2' }
    }),
    approveRun: vi.fn(async (id: string, body: unknown) => {
      mock.state.approveCalls.push({ id, body })
      return { id }
    }),
    rejectRun: vi.fn(async () => ({})),
    cancelRun: vi.fn(async () => ({})),
    requestGoLive: vi.fn(async (notes?: string) => {
      mock.state.requestGoLiveCalls.push({ notes })
      return mock.state.requestGoLiveResult
    }),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { Release } from './Release'

// ── Test harness ────────────────────────────────────────────────────────────

function renderRoute() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/release']}>
        <Routes>
          <Route path="/release" element={<Release />} />
          <Route path="/" element={<div data-testid="home">home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function resetState() {
  mock.state.effectiveIsStaff = true
  mock.state.entLoading = false
  mock.state.canPromoteStaging = false
  mock.state.canProposeProd = false
  mock.state.canApproveProd = false
  mock.state.serverTier = null
  mock.state.eligibility = { can_request_golive: false }
  mock.state.runs = []
  mock.state.statusError = null
  mock.state.promoteCalls = []
  mock.state.proposeCalls = []
  mock.state.approveCalls = []
  mock.state.requestGoLiveCalls = []
  mock.state.requestGoLiveResult = { status: 'requested' }
}

beforeEach(() => {
  resetState()
  vi.stubEnv('VITE_DEPLOY_TIER', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The "never dev→main" invariant. The page MUST NOT contain any text that
 * names a `dev → main` promotion — that path doesn't exist in the
 * three-stage flow (ADR 0004). Asserted across the rendered document, not
 * just specific elements, so any regression anywhere in the tree fails.
 */
function assertNeverDevToMain() {
  const html = document.body.innerHTML.toLowerCase()
  // Both common renderings: the unicode arrow used in the UI, and the ascii
  // approximation. Either showing up is a regression.
  expect(html).not.toContain('dev → main')
  expect(html).not.toContain('dev -> main')
  expect(html).not.toContain('dev_to_main')
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Release route — guard', () => {
  it('redirects non-staff non-signer to home', async () => {
    mock.state.effectiveIsStaff = false
    mock.state.eligibility = { can_request_golive: false }
    renderRoute()
    await screen.findByTestId('home')
    expect(screen.queryByText(/release promotion/i)).not.toBeInTheDocument()
  })

  it('shows the customer console for a non-staff signer', async () => {
    mock.state.effectiveIsStaff = false
    mock.state.eligibility = { can_request_golive: true }
    renderRoute()
    await screen.findByRole('button', { name: /request go-live/i })
    // The staff env matrix should NOT render for the customer.
    expect(
      screen.queryByText(/environment matrix/i),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })

  it('shows the staff console for staff', async () => {
    mock.state.effectiveIsStaff = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    renderRoute()
    await screen.findByText(/environment matrix/i)
  })
})

describe('Release route — staff dev tier', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
  })

  it('renders the Promote-to-staging section for a promoter and NOTHING about staging→main', async () => {
    mock.state.canPromoteStaging = true
    renderRoute()
    await screen.findByRole('button', { name: /promote dev → staging/i })
    expect(
      screen.queryByRole('button', { name: /propose to production/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/promote to production/i),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })

  it('renders the same section for an approver (approve action is staging-tier only)', async () => {
    mock.state.canPromoteStaging = true
    mock.state.canApproveProd = true // approver on dev → must still NOT see approve here
    renderRoute()
    await screen.findByRole('button', { name: /promote dev → staging/i })
    expect(
      screen.queryByRole('button', { name: /approve & promote/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /propose to production/i }),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })

  it('disables the promote button for a non-promoter staff user', async () => {
    mock.state.canPromoteStaging = false
    renderRoute()
    const btn = await screen.findByRole('button', {
      name: /promote dev → staging/i,
    })
    expect(btn).toBeDisabled()
    assertNeverDevToMain()
  })
})

describe('Release route — staff staging tier', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
  })

  it('renders the production section for a promoter (no dev→staging here)', async () => {
    mock.state.canProposeProd = true
    renderRoute()
    await screen.findByRole('button', { name: /propose to production/i })
    expect(
      screen.queryByRole('button', { name: /promote dev → staging/i }),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })

  it('an approver sees pending Martin request and can approve it', async () => {
    mock.state.canProposeProd = true
    mock.state.canApproveProd = true
    mock.state.runs = [
      {
        id: 'run-1',
        kind: 'staging_to_main',
        status: 'proposed',
        requested_by: 'martin@para42.com',
        requested_at: new Date().toISOString(),
        notes: 'UAT pass on staging',
        repos: [],
        signoff_source: 'customer',
        signoff_by_label: 'Para42',
      },
    ]
    renderRoute()
    // The customer badge should surface so the approver knows who asked.
    await screen.findByText(/requested by para42/i)
    const approveBtn = await screen.findByRole('button', {
      name: /^approve & promote$/i,
    })
    expect(approveBtn).toBeInTheDocument()

    // Click → confirm dialog → final approve.
    const user = userEvent.setup()
    await user.click(approveBtn)
    // The confirm dialog has its own "Approve & promote" button.
    const dialogApprove = await screen.findByRole('button', {
      name: /approve & promote/i,
    })
    await user.click(dialogApprove)

    await waitFor(() => {
      expect(mock.state.approveCalls.length).toBeGreaterThanOrEqual(1)
    })
    expect(mock.state.approveCalls[0]).toMatchObject({ id: 'run-1' })
    assertNeverDevToMain()
  })

  it('a non-approver staff sees the pending Martin request but no approve button', async () => {
    mock.state.canProposeProd = true
    mock.state.canApproveProd = false
    mock.state.runs = [
      {
        id: 'run-2',
        kind: 'staging_to_main',
        status: 'proposed',
        requested_by: 'martin@para42.com',
        requested_at: new Date().toISOString(),
        notes: 'UAT pass',
        repos: [],
        signoff_source: 'customer',
        signoff_by_label: 'Para42',
      },
    ]
    renderRoute()
    await screen.findByText(/requested by para42/i)
    expect(
      screen.queryByRole('button', { name: /approve & promote/i }),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })
})

describe('Release route — prod tier', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = true
    mock.state.canPromoteStaging = true
    mock.state.canProposeProd = true
    mock.state.canApproveProd = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'prod')
  })

  it('renders the no-actions card and exposes NO action buttons', async () => {
    renderRoute()
    await screen.findByText(/no further promotions from production/i)
    expect(
      screen.queryByRole('button', { name: /promote dev → staging/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /propose to production/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /approve & promote/i }),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })
})

describe('Release route — server tier overrides build env', () => {
  it('prefers viewer.tier=staging even when VITE_DEPLOY_TIER=dev', async () => {
    mock.state.effectiveIsStaff = true
    mock.state.canPromoteStaging = true
    mock.state.canProposeProd = true
    mock.state.serverTier = 'staging'
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
    renderRoute()
    // Server says staging → staging-only section renders.
    await screen.findByRole('button', { name: /propose to production/i })
    expect(
      screen.queryByRole('button', { name: /promote dev → staging/i }),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })
})

describe('Release route — unknown tier', () => {
  it('renders the read-only "tier unknown" card with no actions', async () => {
    mock.state.effectiveIsStaff = true
    mock.state.canPromoteStaging = true
    mock.state.canProposeProd = true
    mock.state.canApproveProd = true
    mock.state.serverTier = null
    vi.stubEnv('VITE_DEPLOY_TIER', '')
    renderRoute()
    await screen.findByText(/deploy tier unknown/i)
    expect(
      screen.queryByRole('button', { name: /promote dev → staging/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /propose to production/i }),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })
})

describe('Release route — Martin customer signer', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = false
    mock.state.eligibility = { can_request_golive: true }
    // Customer console doesn't fetch status, so tier doesn't matter for it —
    // but the eligibility endpoint already enforces staging on the server.
  })

  it('shows the Request go-live form and submits with notes', async () => {
    renderRoute()
    const btn = await screen.findByRole('button', { name: /request go-live/i })
    const notes = screen.getByLabelText(/notes \(optional\)/i)
    const user = userEvent.setup()
    await user.type(notes, 'Booking flow validated end-to-end')
    await user.click(btn)
    await waitFor(() => {
      expect(mock.state.requestGoLiveCalls.length).toBe(1)
    })
    expect(mock.state.requestGoLiveCalls[0]).toEqual({
      notes: 'Booking flow validated end-to-end',
    })
    // After success, the form flips to the pending-state message.
    await screen.findByTestId('customer-request-pending')
    assertNeverDevToMain()
  })

  it('submits with notes=undefined when the field is blank', async () => {
    renderRoute()
    const btn = await screen.findByRole('button', { name: /request go-live/i })
    const user = userEvent.setup()
    await user.click(btn)
    await waitFor(() => {
      expect(mock.state.requestGoLiveCalls.length).toBe(1)
    })
    expect(mock.state.requestGoLiveCalls[0]).toEqual({ notes: undefined })
    assertNeverDevToMain()
  })

  it('handles already_pending response by flipping into the pending state', async () => {
    mock.state.requestGoLiveResult = { status: 'already_pending' }
    renderRoute()
    const btn = await screen.findByRole('button', { name: /request go-live/i })
    const user = userEvent.setup()
    await user.click(btn)
    await screen.findByTestId('customer-request-pending')
    assertNeverDevToMain()
  })

  it('never exposes any staff promotion control to the customer', async () => {
    renderRoute()
    await screen.findByRole('button', { name: /request go-live/i })
    expect(
      screen.queryByRole('button', { name: /promote dev → staging/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /propose to production/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /approve & promote/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/environment matrix/i),
    ).not.toBeInTheDocument()
    assertNeverDevToMain()
  })
})
