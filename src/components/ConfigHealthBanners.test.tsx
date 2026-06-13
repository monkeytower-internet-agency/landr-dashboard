// landr-y5si — ConfigHealthBanners component tests.
//
// Covers:
//   - Renders error and warning banners correctly
//   - Errors appear above warnings
//   - Click on the banner (or Fix button) calls navigate to target_route
//   - Dismiss hides the banner for the session
//   - Empty issues list renders nothing
//   - Fetch error renders nothing (graceful degradation)

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// ---- Fixtures -------------------------------------------------------

import type { ConfigHealthIssue } from '@/lib/config-health'

const HOTEL_ERROR: ConfigHealthIssue = {
  id: 'hotel_missing_email',
  severity: 'error',
  title: 'Hotel has no booking email',
  message: 'Hotel "Sunrise Resort" has no booking email.',
  target_route: '/settings/hotels',
}

const WARNING_ISSUE: ConfigHealthIssue = {
  id: 'missing_stripe_config',
  severity: 'warning',
  title: 'Payment configuration incomplete',
  message: 'Stripe keys are not configured.',
  target_route: '/account/integrations/payments',
}

// ---- react-router-dom mock for navigate ----------------------------

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ---- Operator context mock -----------------------------------------

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: 'op-1',
    operators: [],
    currentOperator: null,
    loading: false,
    switchOperator: vi.fn(),
  }),
}))

// ---- config-health API mock ----------------------------------------

const { mockState } = vi.hoisted(() => {
  const state = {
    issues: [] as ConfigHealthIssue[],
    shouldThrow: false,
  }
  return { mockState: state }
})

vi.mock('@/lib/config-health', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config-health')>()
  return {
    ...actual,
    fetchConfigHealth: vi.fn(async () => {
      if (mockState.shouldThrow) throw new Error('network error')
      return { issues: mockState.issues }
    }),
  }
})

// ---- helpers -------------------------------------------------------

import { ConfigHealthBanners } from './ConfigHealthBanners'
import { t } from '@/lib/strings'

function renderBanners(initialPath = '/') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
  return render(<ConfigHealthBanners />, { wrapper: Wrapper })
}

// ---- tests ---------------------------------------------------------

beforeEach(() => {
  mockState.issues = []
  mockState.shouldThrow = false
  mockNavigate.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ConfigHealthBanners (landr-y5si)', () => {
  describe('empty / no issues', () => {
    it('renders nothing when issues list is empty', async () => {
      mockState.issues = []
      const { container } = renderBanners()
      await waitFor(() => {
        // All react-query fetches are settled when there are no pending queries.
        // Since empty issues means the component returns null, container is empty.
        expect(container.firstChild).toBeNull()
      })
    })
  })

  describe('error banners', () => {
    it('renders an error banner with title and message', async () => {
      mockState.issues = [HOTEL_ERROR]
      renderBanners()
      await screen.findByTestId('config-health-banner-hotel_missing_email')
      const banner = screen.getByTestId(
        'config-health-banner-hotel_missing_email',
      )
      expect(banner).toHaveAttribute('data-severity', 'error')
      expect(within(banner).getByText(HOTEL_ERROR.title)).toBeInTheDocument()
      expect(within(banner).getByText(HOTEL_ERROR.message)).toBeInTheDocument()
    })

    it('error banner has red styling', async () => {
      mockState.issues = [HOTEL_ERROR]
      renderBanners()
      const banner = await screen.findByTestId(
        'config-health-banner-hotel_missing_email',
      )
      // Red styling via bg-red-50 class
      expect(banner.className).toMatch(/bg-red/)
    })
  })

  describe('warning banners', () => {
    it('renders a warning banner with title and message', async () => {
      mockState.issues = [WARNING_ISSUE]
      renderBanners()
      await screen.findByTestId('config-health-banner-missing_stripe_config')
      const banner = screen.getByTestId(
        'config-health-banner-missing_stripe_config',
      )
      expect(banner).toHaveAttribute('data-severity', 'warning')
      expect(within(banner).getByText(WARNING_ISSUE.title)).toBeInTheDocument()
      expect(
        within(banner).getByText(WARNING_ISSUE.message),
      ).toBeInTheDocument()
    })

    it('warning banner has amber styling', async () => {
      mockState.issues = [WARNING_ISSUE]
      renderBanners()
      const banner = await screen.findByTestId(
        'config-health-banner-missing_stripe_config',
      )
      expect(banner.className).toMatch(/bg-amber/)
    })
  })

  describe('ordering: errors above warnings', () => {
    it('renders errors before warnings regardless of issue list order', async () => {
      // Put warning first in the list — error should still appear first in DOM
      mockState.issues = [WARNING_ISSUE, HOTEL_ERROR]
      renderBanners()

      // Wait for both banners
      await screen.findByTestId('config-health-banner-hotel_missing_email')
      await screen.findByTestId('config-health-banner-missing_stripe_config')

      const allBanners = screen.getAllByRole('status')
      const errorIdx = allBanners.findIndex(
        (el) => el.getAttribute('data-testid') === 'config-health-banner-hotel_missing_email',
      )
      const warnIdx = allBanners.findIndex(
        (el) => el.getAttribute('data-testid') === 'config-health-banner-missing_stripe_config',
      )
      expect(errorIdx).toBeLessThan(warnIdx)
    })
  })

  describe('navigation on click', () => {
    it('clicking the Fix button navigates to target_route', async () => {
      const user = userEvent.setup()
      mockState.issues = [HOTEL_ERROR]
      renderBanners()

      const banner = await screen.findByTestId(
        'config-health-banner-hotel_missing_email',
      )
      // The Fix button has an aria-label starting with "Fix:"
      const fixBtn = within(banner).getByRole('button', {
        name: new RegExp(`^${t.configHealth.goToSetting}:`, 'i'),
      })
      await user.click(fixBtn)
      expect(mockNavigate).toHaveBeenCalledWith(HOTEL_ERROR.target_route)
    })

    it('clicking the banner body text navigates to target_route', async () => {
      const user = userEvent.setup()
      mockState.issues = [HOTEL_ERROR]
      renderBanners()

      const banner = await screen.findByTestId(
        'config-health-banner-hotel_missing_email',
      )
      // The body button wraps title + message. Its aria-label starts with the title
      // and ends with the fix label — find it via data-testid "body" attribute.
      // We pick the button that does NOT start with "Fix:" or "Dismiss:".
      const allBtns = within(banner).getAllByRole('button')
      const bodyBtn = allBtns.find(
        (btn) =>
          !btn.getAttribute('aria-label')?.startsWith(t.configHealth.goToSetting) &&
          !btn.getAttribute('aria-label')?.startsWith(t.configHealth.dismiss),
      )
      expect(bodyBtn).toBeDefined()
      await user.click(bodyBtn!)
      expect(mockNavigate).toHaveBeenCalledWith(HOTEL_ERROR.target_route)
    })
  })

  describe('dismiss', () => {
    it('clicking dismiss hides the banner', async () => {
      const user = userEvent.setup()
      mockState.issues = [HOTEL_ERROR]
      renderBanners()

      const banner = await screen.findByTestId(
        'config-health-banner-hotel_missing_email',
      )
      const dismissBtn = within(banner).getByRole('button', {
        name: /dismiss/i,
      })
      await user.click(dismissBtn)

      await waitFor(() => {
        expect(
          screen.queryByTestId('config-health-banner-hotel_missing_email'),
        ).toBeNull()
      })
    })

    it('dismissing one banner leaves others visible', async () => {
      const user = userEvent.setup()
      mockState.issues = [HOTEL_ERROR, WARNING_ISSUE]
      renderBanners()

      // Wait for both
      await screen.findByTestId('config-health-banner-hotel_missing_email')
      await screen.findByTestId('config-health-banner-missing_stripe_config')

      const errorBanner = screen.getByTestId(
        'config-health-banner-hotel_missing_email',
      )
      await user.click(within(errorBanner).getByRole('button', { name: /dismiss/i }))

      await waitFor(() => {
        expect(
          screen.queryByTestId('config-health-banner-hotel_missing_email'),
        ).toBeNull()
      })
      // Warning should still be visible
      expect(
        screen.getByTestId('config-health-banner-missing_stripe_config'),
      ).toBeInTheDocument()
    })
  })

  describe('fetch error (graceful degradation)', () => {
    it('renders nothing when the API throws', async () => {
      mockState.shouldThrow = true
      const { container } = renderBanners()
      // Give the query time to settle
      await waitFor(() => {
        // Container should remain empty — no banners on fetch error
        const banners = container.querySelectorAll('[data-testid^="config-health-banner"]')
        expect(banners.length).toBe(0)
      })
    })
  })

  // landr-v526 — verify the query is configured to refetch on focus so that
  // returning from the Gmail OAuth popup (window focus event) clears a
  // resolved banner without a full page reload.
  describe('query options (landr-v526)', () => {
    it('query cache entry has refetchOnWindowFocus: true and staleTime: 0', async () => {
      // Render with a QueryClient we can inspect.
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
      function Wrapper({ children }: { children: import('react').ReactNode }) {
        return (
          <QueryClientProvider client={client}>
            <MemoryRouter>{children}</MemoryRouter>
          </QueryClientProvider>
        )
      }

      mockState.issues = [HOTEL_ERROR]
      render(<ConfigHealthBanners />, { wrapper: Wrapper })

      // Wait for the initial fetch to complete so the query cache entry exists.
      await screen.findByTestId('config-health-banner-hotel_missing_email')

      // Inspect the query's resolved options from the cache.
      const queries = client.getQueryCache().getAll()
      const healthQuery = queries.find(
        (q) => q.queryKey[0] === 'config-health',
      )
      expect(healthQuery).toBeDefined()

      // The component sets refetchOnWindowFocus: true and staleTime: 0.
      // Both values must be reflected in the query's current options.
      expect(healthQuery!.options.refetchOnWindowFocus).toBe(true)
      expect(healthQuery!.options.staleTime).toBe(0)
    })
  })
})
