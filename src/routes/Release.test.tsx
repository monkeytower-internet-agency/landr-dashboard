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
    // Optional env-matrix commit-metadata decoration merged onto the single
    // status repo. Default {} ⇒ older-backend shape (no decoration); a test
    // sets this to assert the head-commit + GitHub-link rendering.
    statusReposExtra: {} as Record<string, unknown>,
    promoteCalls: [] as unknown[],
    proposeCalls: [] as unknown[],
    approveCalls: [] as unknown[],
    requestGoLiveCalls: [] as unknown[],
    requestGoLiveResult: { status: 'requested' as 'requested' | 'already_pending' },
    // landr-a99u.14.6 — preview migrations stub. Default is the quiet
    // "nothing pending" case; tests override per-scenario.
    previewMigrationsResult: {
      pending_count: 0 as number,
      files: [] as string[],
    },
    previewMigrationsError: null as Error | null,
    previewMigrationsCalls: [] as unknown[],
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
            dev_to_staging_ahead_by: 3,
            staging_to_main_ahead_by: 5,
            ...mock.state.statusReposExtra,
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
    fetchPreviewMigrations: vi.fn(async (kind: unknown) => {
      mock.state.previewMigrationsCalls.push(kind)
      if (mock.state.previewMigrationsError) {
        throw mock.state.previewMigrationsError
      }
      return mock.state.previewMigrationsResult
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
  mock.state.statusReposExtra = {}
  mock.state.promoteCalls = []
  mock.state.proposeCalls = []
  mock.state.approveCalls = []
  mock.state.requestGoLiveCalls = []
  mock.state.requestGoLiveResult = { status: 'requested' }
  mock.state.previewMigrationsResult = { pending_count: 0, files: [] }
  mock.state.previewMigrationsError = null
  mock.state.previewMigrationsCalls = []
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

describe('Release route — env-matrix commit decoration', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
  })

  it('renders head commit, compare link and history link when decorated', async () => {
    mock.state.statusReposExtra = {
      dev_head_message: 'fix the booking widget date bug',
      dev_head_author: 'Ada Lovelace',
      dev_head_date: new Date(Date.now() - 3 * 3600_000).toISOString(),
      dev_head_url: 'https://github.com/o/landr-api/commit/aaaaaaa1111111',
      staging_head_message: 'bump deps',
      staging_head_author: 'Grace Hopper',
      staging_head_date: new Date(Date.now() - 2 * 86400_000).toISOString(),
      staging_head_url: 'https://github.com/o/landr-api/commit/bbbbbbb2222222',
      dev_to_staging_compare_url:
        'https://github.com/o/landr-api/compare/staging...dev',
      staging_to_main_compare_url:
        'https://github.com/o/landr-api/compare/main...staging',
      dev_history_url: 'https://github.com/o/landr-api/commits/dev',
      staging_history_url: 'https://github.com/o/landr-api/commits/staging',
    }
    renderRoute()
    await screen.findByText(/environment matrix/i)

    // Head commit message + author rendered.
    await screen.findByText(/fix the booking widget date bug/i)
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument()
    expect(screen.getByText(/grace hopper/i)).toBeInTheDocument()

    // The ahead-count is now a compare link, opening a safe new tab.
    const compareLink = screen
      .getAllByRole('link')
      .find(
        (a) =>
          a.getAttribute('href') ===
          'https://github.com/o/landr-api/compare/staging...dev',
      )
    expect(compareLink).toBeDefined()
    expect(compareLink).toHaveAttribute('target', '_blank')
    expect(compareLink).toHaveAttribute('rel', 'noopener noreferrer')

    // History links present for both source branches.
    const historyLinks = screen
      .getAllByRole('link', { name: /history/i })
      .map((a) => a.getAttribute('href'))
    expect(historyLinks).toContain('https://github.com/o/landr-api/commits/dev')
    expect(historyLinks).toContain(
      'https://github.com/o/landr-api/commits/staging',
    )
  })

  it('degrades to a plain ahead-count when the backend omits decoration', async () => {
    // statusReposExtra defaults to {} ⇒ no optional fields.
    renderRoute()
    await screen.findByText(/environment matrix/i)
    // Ahead counts still render…
    expect(screen.getByText(/3 commits/i)).toBeInTheDocument()
    // …but there is no compare/history link in the matrix.
    expect(
      screen.queryByRole('link', { name: /history/i }),
    ).not.toBeInTheDocument()
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

// ── landr-a99u.14.6 — preview migrations in propose + promote dialogs ───────
//
// Always-on (no checkbox), informational only: the preview NEVER disables
// the submit button. Per the parent contract on landr-a99u.14, the executor
// (landr-a99u.14.4) is the actual gate.

describe('Release route — preview migrations in propose dialog (staging tier)', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = true
    mock.state.canProposeProd = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
  })

  it('shows "will apply 2 migrations" when the endpoint returns 2 files', async () => {
    mock.state.previewMigrationsResult = {
      pending_count: 2,
      files: [
        '20260530120000_add_signoff.sql',
        '20260531100000_add_migrations_audit.sql',
      ],
    }
    renderRoute()
    const open = await screen.findByRole('button', {
      name: /propose to production/i,
    })
    const user = userEvent.setup()
    await user.click(open)

    await screen.findByText(/will apply 2 migrations/i)
    expect(
      screen.getByText('20260530120000_add_signoff.sql'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('20260531100000_add_migrations_audit.sql'),
    ).toBeInTheDocument()

    // The dialog's submit button is just labelled "Propose"; type notes
    // (required field is the only natural gate) then assert the preview
    // didn't introduce a NEW disabled state.
    const notes = screen.getByLabelText(/proposal notes/i)
    await user.type(notes, 'Schema additive — safe to ship')
    const dialogSubmit = screen.getByRole('button', { name: /^propose$/i })
    expect(dialogSubmit).not.toBeDisabled()
    assertNeverDevToMain()
  })

  it('shows the amber warning when the API returns 503 migration_target_not_configured', async () => {
    mock.state.previewMigrationsError = new Error(
      'migration_target_not_configured',
    )
    renderRoute()
    const open = await screen.findByRole('button', {
      name: /propose to production/i,
    })
    const user = userEvent.setup()
    await user.click(open)

    const warning = await screen.findByTestId(
      'migrations-preview-not-configured',
    )
    expect(warning).toHaveTextContent(/not configured for this tier/i)

    // Submit button (dialog inner "Propose") is still enabled once notes
    // are filled — preview is informational only, never gates the submit.
    const notes = screen.getByLabelText(/proposal notes/i)
    await user.type(notes, 'OK to ship')
    const dialogSubmit = screen.getByRole('button', { name: /^propose$/i })
    expect(dialogSubmit).not.toBeDisabled()
    assertNeverDevToMain()
  })
})

describe('Release route — preview migrations in promote-to-staging dialog (dev tier)', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = true
    mock.state.canPromoteStaging = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
  })

  it('shows "No pending migrations." when the endpoint returns 0 files', async () => {
    mock.state.previewMigrationsResult = { pending_count: 0, files: [] }
    renderRoute()
    const open = await screen.findByRole('button', {
      name: /promote dev → staging/i,
    })
    const user = userEvent.setup()
    await user.click(open)

    await screen.findByTestId('migrations-preview-empty')
    expect(
      screen.getByText(/no pending migrations\./i),
    ).toBeInTheDocument()

    // The dialog's submit button is labelled just "Promote" — confirm it
    // is enabled (the preview is informational only).
    const dialogSubmit = screen.getByRole('button', { name: /^promote$/i })
    expect(dialogSubmit).not.toBeDisabled()
    assertNeverDevToMain()
  })

  it('keeps the submit enabled even when the preview surfaces a 502 unreachable error', async () => {
    mock.state.previewMigrationsError = new Error(
      'migration_target_unreachable: connection refused',
    )
    renderRoute()
    const open = await screen.findByRole('button', {
      name: /promote dev → staging/i,
    })
    const user = userEvent.setup()
    await user.click(open)

    const err = await screen.findByTestId('migrations-preview-error')
    expect(err).toHaveTextContent(/could not load pending migrations/i)
    expect(err).toHaveTextContent(/connection refused/i)

    // Submit button stays enabled — never gated by the preview.
    const dialogSubmit = screen.getByRole('button', { name: /^promote$/i })
    expect(dialogSubmit).not.toBeDisabled()
    assertNeverDevToMain()
  })
})

// ── landr-a99u.14.7 — run-detail migration stage block ──────────────────────
//
// Surfaces the new promotion_runs.migration_status / migrations_applied /
// migration_log columns on each run's detail card in the /release history.
// Four states: pending / applied / failed / skipped (the last is also the
// default for legacy runs that predate landr-a99u.14.1).

describe('Release route — run detail migrations section', () => {
  beforeEach(() => {
    mock.state.effectiveIsStaff = true
    mock.state.canProposeProd = true
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
  })

  it('renders the pending spinner when migration_status="pending"', async () => {
    mock.state.runs = [
      {
        id: 'r-pending',
        kind: 'staging_to_main',
        status: 'executing',
        requested_by: 'ok@monkeytower.net',
        requested_at: new Date().toISOString(),
        repos: [],
        migration_status: 'pending',
        migrations_applied: [],
        migration_log: '',
      },
    ]
    renderRoute()
    const block = await screen.findByTestId('run-migrations-pending')
    expect(block).toHaveTextContent(/applying migrations/i)
    assertNeverDevToMain()
  })

  it('renders the applied summary + file list when migration_status="applied"', async () => {
    mock.state.runs = [
      {
        id: 'r-applied',
        kind: 'staging_to_main',
        status: 'completed',
        requested_by: 'ok@monkeytower.net',
        requested_at: new Date().toISOString(),
        repos: [],
        migration_status: 'applied',
        migrations_applied: [
          '20260528100000_x.sql',
          '20260528110000_y.sql',
        ],
        migration_log:
          '--- apply 20260528100000_x.sql ---\nOK\n--- apply 20260528110000_y.sql ---\nOK\n',
      },
    ]
    renderRoute()
    const block = await screen.findByTestId('run-migrations-applied')
    expect(block).toHaveTextContent(/applied 2 migrations/i)
    expect(
      screen.getByText('20260528100000_x.sql'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('20260528110000_y.sql'),
    ).toBeInTheDocument()
    // "View log" toggle exists; the log content is inside it.
    expect(screen.getByText(/view log/i)).toBeInTheDocument()
    assertNeverDevToMain()
  })

  it('renders the failed block with the log visible by default', async () => {
    mock.state.runs = [
      {
        id: 'r-failed',
        kind: 'staging_to_main',
        status: 'failed',
        requested_by: 'ok@monkeytower.net',
        requested_at: new Date().toISOString(),
        repos: [],
        migration_status: 'failed',
        migrations_applied: ['20260528100000_x.sql'],
        migration_log:
          '--- apply 20260528120000_z.sql ---\nERROR: syntax error at or near "FORM"\n',
      },
    ]
    renderRoute()
    const block = await screen.findByTestId('run-migrations-failed')
    expect(block).toHaveTextContent(/migrations failed/i)
    // The log MUST be visible without any toggle interaction.
    expect(block).toHaveTextContent(/syntax error at or near "FORM"/i)
    // Applied-before-failure list shows.
    expect(block).toHaveTextContent(/applied 1 before the failure/i)
    expect(
      screen.getByText('20260528100000_x.sql'),
    ).toBeInTheDocument()
    // No "View log" toggle on the failed surface.
    expect(screen.queryByText(/view log/i)).not.toBeInTheDocument()
    assertNeverDevToMain()
  })

  it('renders the muted skipped marker when migration_status is absent (legacy run)', async () => {
    mock.state.runs = [
      {
        id: 'r-legacy',
        kind: 'staging_to_main',
        status: 'completed',
        requested_by: 'ok@monkeytower.net',
        requested_at: new Date().toISOString(),
        repos: [],
        // migration_status, migrations_applied, migration_log all absent —
        // this is what a pre-14.1 run looks like.
      },
    ]
    renderRoute()
    // findAllByTestId because the same run also renders inside any pending
    // ProposalCard if status='proposed' — here status='completed' so the
    // history row is the only mount, but be defensive.
    const blocks = await screen.findAllByTestId('run-migrations-skipped')
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    expect(blocks[0]).toHaveTextContent('—')
    assertNeverDevToMain()
  })
})
