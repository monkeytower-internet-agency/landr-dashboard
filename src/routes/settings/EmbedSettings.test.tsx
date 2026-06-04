/**
 * EmbedSettings tests (landr-up1b / landr-il9f.3 / landr-7zc5.4 / landr-sag9).
 * Covers the All / Category / Single-product modes, the live shortcode +
 * iframe output, Copy, the env selector, raw URL output, and Open widget button.
 *
 * landr-il9f.3: generator now emits token= (opaque widget_token) not operator=.
 * The widget_token is fetched via fetchWidgetToken (shortcode.ts); we mock that.
 *
 * landr-7zc5.4: env selector swaps the widget host. Raw URL output +
 * "Open booking widget" button added.
 *
 * landr-sag9: 'testing' renamed → 'staging'. development option is staff-only.
 * Non-staff see [staging, live]; Landr staff additionally see [development].
 */
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/operator', async () => {
  const mod = await vi.importActual<typeof import('@/lib/operator')>(
    '@/lib/operator',
  )
  return {
    ...mod,
    useOperator: () => ({
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
      switchOperator: () => {},
      refreshOperators: () => {},
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

// landr-sag9 — mock useEntitlements so tests can control the staff flag.
// Default: non-staff (operator view). Individual tests override via mockReturnValue.
const mockEffectiveIsStaff = { value: false }
vi.mock('@/lib/entitlements', async () => {
  return {
    useEntitlements: () => ({
      isEnabled: () => true,
      isLandrStaff: mockEffectiveIsStaff.value,
      effectiveIsStaff: mockEffectiveIsStaff.value,
      isLoading: false,
    }),
    EntitlementsProvider: ({ children }: { children: ReactNode }) => children,
  }
})

// landr-il9f.3 — mock fetchWidgetToken so the embed generator resolves the
// opaque token without a real Supabase connection.
vi.mock('@/lib/shortcode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shortcode')>()
  return {
    ...actual,
    fetchWidgetToken: vi.fn(async () => 'tok_testtoken123'),
  }
})

type GroupFixture = import('@/lib/productGroups').ProductGroup

vi.mock('@/lib/productGroups', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/productGroups')>()
  return {
    ...actual,
    fetchProductGroupTree: vi.fn(
      async (): Promise<GroupFixture[]> => [
        {
          id: 'courses',
          operator_id: 'op-1',
          slug: 'courses',
          name: 'Courses',
          name_localized: null,
          description: null,
          description_localized: null,
          parent_id: null,
          sort_order: 10,
          active: true,
          image_path: null,
          created_at: '2026-05-22T00:00:00Z',
          updated_at: '2026-05-22T00:00:00Z',
        },
      ],
    ),
  }
})

vi.mock('@/lib/products', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/products')>()
  return {
    ...actual,
    fetchProducts: vi.fn(async () => [
      {
        id: 'p-1',
        operator_id: 'op-1',
        product_group_id: 'courses',
        slug: 'open-water',
        name: 'Open Water',
        product_kind: 'service',
        active: true,
      },
    ]),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { EmbedSettings } from './EmbedSettings'

const clipboardWriteText = vi.fn(() => Promise.resolve())
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: clipboardWriteText },
})

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  clipboardWriteText.mockReset()
  clipboardWriteText.mockResolvedValue(undefined)
  // Default every test to non-staff (operator view). Staff tests override below.
  mockEffectiveIsStaff.value = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EmbedSettings (landr-up1b / landr-il9f.3)', () => {
  it('defaults to "All products" — token-only shortcode', async () => {
    render(<EmbedSettings />)
    const code = await screen.findByTestId('embed-shortcode-code')
    await waitFor(() =>
      expect(code).toHaveTextContent('[landr_booking token="tok_testtoken123"]'),
    )
  })

  it('adds a group= attr when a category is selected', async () => {
    const user = userEvent.setup()
    render(<EmbedSettings />)
    await user.click(screen.getByTestId('embed-mode-category'))
    const select = await screen.findByTestId('embed-category-select')
    await user.selectOptions(select, 'courses')
    await waitFor(() =>
      expect(screen.getByTestId('embed-shortcode-code')).toHaveTextContent(
        '[landr_booking token="tok_testtoken123" group="courses"]',
      ),
    )
  })

  it('adds a product= attr when a single product is selected', async () => {
    const user = userEvent.setup()
    render(<EmbedSettings />)
    await user.click(screen.getByTestId('embed-mode-product'))
    const select = await screen.findByTestId('embed-product-select')
    await user.selectOptions(select, 'open-water')
    await waitFor(() =>
      expect(screen.getByTestId('embed-shortcode-code')).toHaveTextContent(
        '[landr_booking token="tok_testtoken123" product="open-water"]',
      ),
    )
  })

  it('renders a matching iframe with ?w=<token> and copies it', async () => {
    render(<EmbedSettings />)
    const iframeBlock = await screen.findByTestId('embed-iframe')
    await waitFor(() =>
      expect(
        within(iframeBlock).getByTestId('embed-iframe-code'),
      ).toHaveTextContent('https://bw.landr.de/?w=tok_testtoken123'),
    )
    // Re-install the spy right before the click: an earlier test in this
    // file may have called userEvent.setup(), which (v14) swaps
    // navigator.clipboard for its own stub. fireEvent + a fresh spy keeps
    // the assertion honest.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
    fireEvent.click(within(iframeBlock).getByTestId('embed-iframe-copy'))
    await waitFor(() =>
      expect(clipboardWriteText).toHaveBeenCalledWith(
        expect.stringContaining('<iframe src="https://bw.landr.de/?w=tok_testtoken123"'),
      ),
    )
  })
})

// landr-7zc5.4 — env selector, raw URL output, open widget button
// landr-sag9 — renamed testing→staging, development is staff-only
describe('EmbedSettings env selector (landr-7zc5.4 / landr-sag9)', () => {
  it('defaults to Live env — raw URL uses bw.landr.de', async () => {
    render(<EmbedSettings />)
    const code = await screen.findByTestId('embed-raw-url-code')
    await waitFor(() =>
      expect(code).toHaveTextContent(
        'https://bw.landr.de/?w=tok_testtoken123',
      ),
    )
  })

  // landr-sag9: development is staff-only — requires effectiveIsStaff=true
  it('staff: switching to Development swaps the host to bw-dev.landr.de', async () => {
    mockEffectiveIsStaff.value = true
    const user = userEvent.setup()
    render(<EmbedSettings />)
    const envSelect = await screen.findByTestId('embed-env-select')
    await user.selectOptions(envSelect, 'development')
    await waitFor(() =>
      expect(screen.getByTestId('embed-raw-url-code')).toHaveTextContent(
        'https://bw-dev.landr.de/?w=tok_testtoken123',
      ),
    )
  })

  // landr-sag9: 'testing' renamed → 'staging'
  it('switching to Staging swaps the host to bw-staging.landr.de', async () => {
    const user = userEvent.setup()
    render(<EmbedSettings />)
    const envSelect = await screen.findByTestId('embed-env-select')
    await user.selectOptions(envSelect, 'staging')
    await waitFor(() =>
      expect(screen.getByTestId('embed-raw-url-code')).toHaveTextContent(
        'https://bw-staging.landr.de/?w=tok_testtoken123',
      ),
    )
  })

  // landr-sag9: development is staff-only
  it('staff: Development env adds src= to the shortcode', async () => {
    mockEffectiveIsStaff.value = true
    const user = userEvent.setup()
    render(<EmbedSettings />)
    const envSelect = await screen.findByTestId('embed-env-select')
    await user.selectOptions(envSelect, 'development')
    // buildShortcode strips trailing slashes, so no trailing slash here
    await waitFor(() =>
      expect(screen.getByTestId('embed-shortcode-code')).toHaveTextContent(
        'src="https://bw-dev.landr.de"',
      ),
    )
  })

  it('Live env omits src= from the shortcode (uses plugin default)', async () => {
    render(<EmbedSettings />)
    const code = await screen.findByTestId('embed-shortcode-code')
    await waitFor(() =>
      expect(code).not.toHaveTextContent('src='),
    )
  })

  it('renders the "Open booking widget" button with the correct href', async () => {
    render(<EmbedSettings />)
    const btn = await screen.findByTestId('embed-open-widget')
    await waitFor(() =>
      expect(btn).toHaveAttribute(
        'href',
        'https://bw.landr.de/?w=tok_testtoken123',
      ),
    )
    expect(btn).toHaveAttribute('target', '_blank')
    expect(btn).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('copy raw URL button writes the URL to clipboard', async () => {
    render(<EmbedSettings />)
    // Wait for the token to resolve so the URL is fully populated
    await waitFor(() =>
      expect(screen.getByTestId('embed-raw-url-code')).toHaveTextContent(
        'https://bw.landr.de/?w=tok_testtoken123',
      ),
    )
    // Re-install the spy: an earlier test using userEvent.setup() may have
    // replaced navigator.clipboard with its own stub.
    clipboardWriteText.mockReset()
    clipboardWriteText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
    fireEvent.click(screen.getByTestId('embed-raw-url-copy'))
    await waitFor(() =>
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'https://bw.landr.de/?w=tok_testtoken123',
      ),
    )
  })

  // landr-sag9: non-staff see only [staging, live]; development is hidden
  it('operator (non-staff): env selector shows only staging and live', async () => {
    render(<EmbedSettings />)
    const envSelect = await screen.findByTestId('embed-env-select')
    const options = within(envSelect).getAllByRole('option')
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'staging',
      'live',
    ])
  })

  // landr-sag9: non-staff must never see the development option
  it('operator (non-staff): development option is absent from selector', async () => {
    render(<EmbedSettings />)
    const envSelect = await screen.findByTestId('embed-env-select')
    expect(
      within(envSelect).queryByRole('option', { name: 'Development' }),
    ).toBeNull()
  })

  // landr-sag9: staff see all three options including development
  it('staff: env selector shows development, staging, and live', async () => {
    mockEffectiveIsStaff.value = true
    render(<EmbedSettings />)
    const envSelect = await screen.findByTestId('embed-env-select')
    const options = within(envSelect).getAllByRole('option')
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'development',
      'staging',
      'live',
    ])
  })

  // landr-sag9: label reads 'Staging', not 'Testing'
  it('staging option label reads "Staging"', async () => {
    render(<EmbedSettings />)
    const envSelect = await screen.findByTestId('embed-env-select')
    const stagingOption = within(envSelect).getByRole('option', {
      name: 'Staging',
    })
    expect(stagingOption).toHaveAttribute('value', 'staging')
  })
})
