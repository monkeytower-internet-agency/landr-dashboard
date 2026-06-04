/**
 * WidgetSettings tests (landr-jb1k) — Settings → Booking widget.
 *
 * Covers the operator-facing configurator: the descriptive layout-variant
 * cards (Text overlay / Text below image / Compact cards → stored as
 * aurora/summit/alpine), the category-columns select (Auto + 1..4), the
 * title-style group (6-font select + text-case segmented control), the live
 * preview, the null=aurora default state, and the Preview-widget link.
 *
 * Each control PATCHes the operators row via patchOperator (mocked). The
 * fonts module (dynamic @fontsource CSS imports) is mocked to a no-op so the
 * test never touches CSS resolution.
 */
import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

const { fetchOperatorMock, patchOperatorMock } = vi.hoisted(() => ({
  fetchOperatorMock: vi.fn(),
  patchOperatorMock: vi.fn(),
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: (...args: unknown[]) => fetchOperatorMock(...args),
    patchOperator: (...args: unknown[]) => patchOperatorMock(...args),
  }
})

// fetchWidgetToken drives the Preview-widget link. Default: a token present.
vi.mock('@/lib/shortcode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shortcode')>()
  return {
    ...actual,
    fetchWidgetToken: vi.fn(async () => 'tok_widget_abc'),
  }
})

// Self-hosted font loader → no-op in tests (avoid dynamic @fontsource CSS).
vi.mock('./widgetFonts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./widgetFonts')>()
  return {
    ...actual,
    loadWidgetFonts: vi.fn(async () => undefined),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

// ---------------------------------------------------------------------------
// Fixture + render helper
// ---------------------------------------------------------------------------

function makeOperator(overrides = {}) {
  return {
    id: 'op-1',
    name: 'Para42',
    slug: 'para42',
    widget_variant: null,
    widget_category_columns: null,
    widget_tile_font: null,
    widget_title_case: null,
    ...overrides,
  }
}

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

import { WidgetSettings } from './WidgetSettings'

beforeEach(() => {
  fetchOperatorMock.mockResolvedValue(makeOperator())
  patchOperatorMock.mockResolvedValue(makeOperator())
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Variant picker
// ---------------------------------------------------------------------------

describe('WidgetSettings — layout variant picker', () => {
  it('renders the three descriptive cards (no codenames)', async () => {
    render(<WidgetSettings />)
    expect(await screen.findByText('Text overlay')).toBeTruthy()
    expect(screen.getByText('Text below image')).toBeTruthy()
    expect(screen.getByText('Compact cards')).toBeTruthy()
    // The internal codenames must NOT leak into the operator-facing UI.
    expect(screen.queryByText(/aurora/i)).toBeNull()
    expect(screen.queryByText(/summit/i)).toBeNull()
    expect(screen.queryByText(/alpine/i)).toBeNull()
  })

  it('treats null widget_variant as aurora-selected with a Default hint', async () => {
    render(<WidgetSettings />)
    const auroraCard = await screen.findByTestId('widget-variant-aurora')
    expect(auroraCard.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('widget-variant-summit').getAttribute('aria-checked')).toBe('false')
    // Default hint only shows while the operator hasn't picked explicitly.
    expect(screen.getByText(/default/i)).toBeTruthy()
  })

  it('seeds the selected card from a persisted widget_variant', async () => {
    fetchOperatorMock.mockResolvedValue(makeOperator({ widget_variant: 'summit' }))
    render(<WidgetSettings />)
    const summit = await screen.findByTestId('widget-variant-summit')
    expect(summit.getAttribute('aria-checked')).toBe('true')
  })

  it('clicking a card PATCHes widget_variant with the stored value', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const alpine = await screen.findByTestId('widget-variant-alpine')
    await user.click(alpine)
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_variant: 'alpine',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Category columns
// ---------------------------------------------------------------------------

describe('WidgetSettings — category columns', () => {
  it('defaults to Auto when widget_category_columns is null', async () => {
    render(<WidgetSettings />)
    const select = (await screen.findByTestId(
      'widget-columns-select',
    )) as HTMLSelectElement
    expect(select.value).toBe('auto')
  })

  it('selecting a column count PATCHes widget_category_columns as a number', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const select = await screen.findByTestId('widget-columns-select')
    await user.selectOptions(select, '3')
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_category_columns: 3,
      }),
    )
  })

  it('selecting Auto PATCHes widget_category_columns null', async () => {
    const user = userEvent.setup()
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_category_columns: 2 }),
    )
    render(<WidgetSettings />)
    const select = (await screen.findByTestId(
      'widget-columns-select',
    )) as HTMLSelectElement
    expect(select.value).toBe('2')
    await user.selectOptions(select, 'auto')
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_category_columns: null,
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Title style — font + case
// ---------------------------------------------------------------------------

describe('WidgetSettings — title style', () => {
  it('renders the six-option font select', async () => {
    render(<WidgetSettings />)
    const select = (await screen.findByTestId(
      'widget-font-select',
    )) as HTMLSelectElement
    expect(select.querySelectorAll('option')).toHaveLength(6)
  })

  it('selecting a font PATCHes widget_tile_font with the stored value', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const select = await screen.findByTestId('widget-font-select')
    await user.selectOptions(select, 'bebas')
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_font: 'bebas',
      }),
    )
  })

  it('selecting Standard font PATCHes widget_tile_font null', async () => {
    const user = userEvent.setup()
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_tile_font: 'playfair' }),
    )
    render(<WidgetSettings />)
    const select = (await screen.findByTestId(
      'widget-font-select',
    )) as HTMLSelectElement
    expect(select.value).toBe('playfair')
    await user.selectOptions(select, 'system')
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_font: null,
      }),
    )
  })

  it('text-case segmented control PATCHes widget_title_case', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const upper = await screen.findByTestId('widget-case-uppercase')
    await user.click(upper)
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_title_case: 'uppercase',
      }),
    )
  })

  it('"As entered" PATCHes widget_title_case null', async () => {
    const user = userEvent.setup()
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_title_case: 'uppercase' }),
    )
    render(<WidgetSettings />)
    const asEntered = await screen.findByTestId('widget-case-none')
    await user.click(asEntered)
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_title_case: null,
      }),
    )
  })

  it('preview line reflects both the active font and text case', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_tile_font: 'caveat', widget_title_case: 'uppercase' }),
    )
    render(<WidgetSettings />)
    const preview = await screen.findByTestId('widget-title-preview')
    expect(preview.style.fontFamily).toContain('Caveat')
    expect(preview.style.textTransform).toBe('uppercase')
  })
})

// ---------------------------------------------------------------------------
// Preview-widget link
// ---------------------------------------------------------------------------

describe('WidgetSettings — preview widget link', () => {
  it('renders an outbound preview link with ?preview=1 and the active variant', async () => {
    fetchOperatorMock.mockResolvedValue(makeOperator({ widget_variant: 'summit' }))
    render(<WidgetSettings />)
    const link = (await screen.findByTestId(
      'widget-preview-link',
    )) as HTMLElement
    const anchor = link.querySelector('a') ?? (link as HTMLAnchorElement)
    const href = anchor.getAttribute('href') ?? ''
    expect(href).toContain('preview=1')
    expect(href).toContain('variant=summit')
    expect(href).toContain('tok_widget_abc')
    expect(anchor.getAttribute('target')).toBe('_blank')
  })
})
