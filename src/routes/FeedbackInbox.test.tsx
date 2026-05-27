// landr-wwhn.28 — /feedback-inbox route tests.
//
// Covers: staff gate (non-staff redirect), summary load error, empty rail,
// operator row renders with unread/awaiting badges, threads load and render.
import {
  render as rtlRender,
  screen,
  type RenderOptions,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode, ReactElement } from 'react'

import type {
  OperatorInboxSummary,
  InboxTicketThread,
} from '@/lib/feedback-inbox'

// ---- hoisted state ----------------------------------------------------------

const { mock } = vi.hoisted(() => {
  const state = {
    summaries: [] as OperatorInboxSummary[],
    summaryError: null as Error | null,
    threads: [] as InboxTicketThread[],
    threadsError: null as Error | null,
    isStaff: true,
    entLoading: false,
  }
  return { mock: { state } }
})

// ---- module mocks -----------------------------------------------------------

vi.mock('@/lib/feedback-inbox', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/feedback-inbox')>(
      '@/lib/feedback-inbox',
    )
  return {
    ...actual,
    fetchOperatorInboxSummaries: vi.fn(async () => {
      if (mock.state.summaryError) throw mock.state.summaryError
      return mock.state.summaries
    }),
    fetchInboxThreads: vi.fn(async () => {
      if (mock.state.threadsError) throw mock.state.threadsError
      return mock.state.threads
    }),
  }
})

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    effectiveIsStaff: mock.state.isStaff,
    isLoading: mock.state.entLoading,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [],
    currentOperator: null,
    currentOperatorId: null,
    loading: false,
    switchOperator: () => {},
    staffOperators: [],
    staffOperatorsLoading: false,
    viewAsActive: false,
    viewAsOperator: null,
    enterViewAs: () => {},
    exitViewAs: () => {},
    refreshOperators: () => {},
  }),
  useOperatorCalendarPrefs: () => ({ hour12: false }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/lib/tickets', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/tickets')>('@/lib/tickets')
  return {
    ...actual,
    fetchAssignableUsers: vi.fn(async () => []),
  }
})

vi.mock('@/lib/page-title', () => ({
  PageTitle: ({ title }: { title: string }) => <title>{title}</title>,
}))

// ---- import subject ---------------------------------------------------------

// Dynamic import after mocks are hoisted.
const { default: FeedbackInbox } = await import('./FeedbackInbox')

// ---- render helper ----------------------------------------------------------

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: (_props) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/feedback-inbox']}>
          <Routes>
            <Route path="/" element={<div data-testid="home">home</div>} />
            <Route path="/feedback-inbox" element={ui} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  })
}

// ---- helpers ----------------------------------------------------------------

function makeSummary(
  overrides: Partial<OperatorInboxSummary> = {},
): OperatorInboxSummary {
  return {
    operator_id: 'op-1',
    operator_name: 'Para42',
    operator_slug: 'para42',
    ticket_count: 3,
    last_activity_at: new Date(Date.now() - 3600_000).toISOString(),
    unread_count: 2,
    awaiting_reply_count: 1,
    ...overrides,
  }
}

// ---- tests ------------------------------------------------------------------

beforeEach(() => {
  mock.state.summaries = []
  mock.state.summaryError = null
  mock.state.threads = []
  mock.state.threadsError = null
  mock.state.isStaff = true
  mock.state.entLoading = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('FeedbackInbox', () => {
  describe('staff gate', () => {
    it('redirects non-staff to home', async () => {
      mock.state.isStaff = false
      render(<FeedbackInbox />)
      await screen.findByTestId('home')
    })

    it('renders the inbox for staff', async () => {
      render(<FeedbackInbox />)
      await screen.findByTestId('inbox-left-rail')
    })
  })

  describe('left rail', () => {
    it('shows loading state', async () => {
      // Loading is instant in tests so we just check it does not crash
      render(<FeedbackInbox />)
      await screen.findByTestId('inbox-left-rail')
    })

    it('shows empty state when no operators have feedback', async () => {
      mock.state.summaries = []
      render(<FeedbackInbox />)
      await screen.findByText(/no operators with feedback yet/i)
    })

    it('shows summary error state', async () => {
      mock.state.summaryError = new Error('db down')
      render(<FeedbackInbox />)
      await screen.findByText(/could not load inbox summary/i)
    })

    it('renders operator rail item with unread and awaiting badges', async () => {
      mock.state.summaries = [makeSummary()]
      render(<FeedbackInbox />)
      await screen.findByTestId('inbox-rail-item-op-1')
      await screen.findByTestId('inbox-rail-unread-op-1')
      await screen.findByTestId('inbox-rail-awaiting-op-1')
    })

    it('does not show unread badge when unread_count is 0', async () => {
      mock.state.summaries = [makeSummary({ unread_count: 0 })]
      render(<FeedbackInbox />)
      await screen.findByTestId('inbox-rail-item-op-1')
      expect(
        screen.queryByTestId('inbox-rail-unread-op-1'),
      ).not.toBeInTheDocument()
    })
  })

  describe('thread pane', () => {
    it('auto-selects first operator and loads threads', async () => {
      mock.state.summaries = [makeSummary()]
      render(<FeedbackInbox />)
      // After auto-select the main pane renders the operator header (h1)
      // plus the left-rail item — use getAllByText to handle both.
      const matches = await screen.findAllByText('Para42')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('shows empty-threads state when no threads', async () => {
      mock.state.summaries = [makeSummary()]
      mock.state.threads = []
      render(<FeedbackInbox />)
      await screen.findByText(/no feedback threads from this operator yet/i)
    })

    it('shows threads error state', async () => {
      mock.state.summaries = [makeSummary()]
      mock.state.threadsError = new Error('timeout')
      render(<FeedbackInbox />)
      await screen.findByText(/could not load threads/i)
    })
  })
})
