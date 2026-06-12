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
    // landr-jb1k.4 — tile-style fields default to null (Auto).
    widget_tile_radius: null,
    widget_tile_aspect: null,
    widget_tile_scrim: null,
    widget_tile_hover: null,
    // landr-ylvp — widget text card moved here from Brand.
    widget_headline: null,
    widget_description: null,
    widget_footer: null,
    // landr-dnzd — first-page-only switches default false.
    widget_headline_first_page_only: false,
    widget_description_first_page_only: false,
    widget_footer_first_page_only: false,
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
    // landr-ylvp — scope to the variant card: the moved widget-text card also
    // contains the word "default" ("Empty by default"), so a loose /default/i
    // now matches multiple nodes. Assert the specific variant-hint copy inside
    // the aurora card instead.
    expect(auroraCard.textContent).toMatch(/default/i)
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
// Tile style — radius / aspect / scrim / hover (landr-jb1k.4)
// ---------------------------------------------------------------------------

describe('WidgetSettings — tile style', () => {
  it('renders the Tile style group with all four controls', async () => {
    render(<WidgetSettings />)
    expect(await screen.findByTestId('widget-tile-radius-auto')).toBeTruthy()
    expect(screen.getByTestId('widget-tile-aspect-auto')).toBeTruthy()
    expect(screen.getByTestId('widget-tile-scrim-auto')).toBeTruthy()
    expect(screen.getByTestId('widget-tile-hover-select')).toBeTruthy()
  })

  // --- radius ---
  it('every radius control starts on Auto when widget_tile_radius is null', async () => {
    render(<WidgetSettings />)
    const auto = await screen.findByTestId('widget-tile-radius-auto')
    expect(auto.getAttribute('aria-checked')).toBe('true')
    expect(
      screen.getByTestId('widget-tile-radius-round').getAttribute('aria-checked'),
    ).toBe('false')
  })

  it('selecting a radius PATCHes widget_tile_radius with the value', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const round = await screen.findByTestId('widget-tile-radius-round')
    await user.click(round)
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_radius: 'round',
      }),
    )
  })

  it('selecting Auto radius PATCHes widget_tile_radius null', async () => {
    const user = userEvent.setup()
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_tile_radius: 'sharp' }),
    )
    render(<WidgetSettings />)
    const sharp = await screen.findByTestId('widget-tile-radius-sharp')
    expect(sharp.getAttribute('aria-checked')).toBe('true')
    await user.click(screen.getByTestId('widget-tile-radius-auto'))
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_radius: null,
      }),
    )
  })

  // --- aspect ---
  it('selecting an aspect PATCHes widget_tile_aspect with the value', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const wide = await screen.findByTestId('widget-tile-aspect-wide')
    await user.click(wide)
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_aspect: 'wide',
      }),
    )
  })

  it('seeds the selected aspect from a persisted value', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_tile_aspect: 'square' }),
    )
    render(<WidgetSettings />)
    const square = await screen.findByTestId('widget-tile-aspect-square')
    expect(square.getAttribute('aria-checked')).toBe('true')
  })

  // --- scrim ---
  it('selecting a scrim swatch PATCHes widget_tile_scrim with the value', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const brand = await screen.findByTestId('widget-tile-scrim-brand')
    await user.click(brand)
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_scrim: 'brand',
      }),
    )
  })

  it('the light scrim swatch renders the sample title in dark text (AA)', async () => {
    render(<WidgetSettings />)
    const light = await screen.findByTestId('widget-tile-scrim-light')
    const sample = light.querySelector('span')
    expect(sample?.className).toContain('text-foreground')
    expect(sample?.className).not.toContain('text-white')
  })

  // --- hover ---
  it('selecting a hover option PATCHes widget_tile_hover with the value', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const select = await screen.findByTestId('widget-tile-hover-select')
    await user.selectOptions(select, 'zoom')
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_hover: 'zoom',
      }),
    )
  })

  it('selecting Auto hover PATCHes widget_tile_hover null', async () => {
    const user = userEvent.setup()
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_tile_hover: 'zoom' }),
    )
    render(<WidgetSettings />)
    const select = (await screen.findByTestId(
      'widget-tile-hover-select',
    )) as HTMLSelectElement
    expect(select.value).toBe('zoom')
    await user.selectOptions(select, 'auto')
    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith('op-1', {
        widget_tile_hover: null,
      }),
    )
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

// ---------------------------------------------------------------------------
// Booking widget text (landr-nils) — moved here from BrandingSettings by
// landr-ylvp (it's the copy shown IN the widget, so it lives with the widget
// presentation now). Same patchOperator save path + null-clear semantics.
// ---------------------------------------------------------------------------

describe('WidgetSettings — booking widget text (landr-nils)', () => {
  it('seeds the headline / description / footer fields from the operator', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        widget_headline: 'Book with us',
        widget_description: 'Subject to our terms.',
        widget_footer: '© Para42',
      }),
    )
    render(<WidgetSettings />)

    expect(
      await screen.findByDisplayValue('Book with us'),
    ).toBeTruthy()
    expect(screen.getByDisplayValue('Subject to our terms.')).toBeTruthy()
    expect(screen.getByDisplayValue('© Para42')).toBeTruthy()
  })

  it('save is disabled until a field changes, then PATCHes the widget text', async () => {
    const user = userEvent.setup()
    patchOperatorMock.mockResolvedValue(makeOperator())
    render(<WidgetSettings />)

    const saveBtn = await screen.findByTestId('widget-text-save')
    // Nothing changed yet → disabled.
    expect(saveBtn).toBeDisabled()

    const headline = screen.getByLabelText('Headline')
    await user.type(headline, 'Book with us')
    expect(saveBtn).toBeEnabled()
    await user.click(saveBtn)

    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({
          widget_headline: 'Book with us',
          widget_description: null,
          widget_footer: null,
        }),
      ),
    )
  })

  it('clearing a stored field PATCHes null (intentional clear)', async () => {
    const user = userEvent.setup()
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ widget_headline: 'Book with us' }),
    )
    patchOperatorMock.mockResolvedValue(makeOperator())
    render(<WidgetSettings />)

    const headline = await screen.findByDisplayValue('Book with us')
    await user.clear(headline)
    await user.click(screen.getByTestId('widget-text-save'))

    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ widget_headline: null }),
      ),
    )
  })
})

// ---------------------------------------------------------------------------
// First-page-only switches (landr-dnzd)
// ---------------------------------------------------------------------------

describe('WidgetSettings — first-page-only switches (landr-dnzd)', () => {
  it('renders all three first-page-only switches, defaulting to off', async () => {
    render(<WidgetSettings />)
    const hSwitch = await screen.findByTestId('widget-headline-first-page-only')
    const dSwitch = screen.getByTestId('widget-description-first-page-only')
    const fSwitch = screen.getByTestId('widget-footer-first-page-only')
    expect(hSwitch.getAttribute('aria-checked')).toBe('false')
    expect(dSwitch.getAttribute('aria-checked')).toBe('false')
    expect(fSwitch.getAttribute('aria-checked')).toBe('false')
  })

  it('seeds the switches from persisted operator values', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        widget_headline_first_page_only: true,
        widget_description_first_page_only: false,
        widget_footer_first_page_only: true,
      }),
    )
    render(<WidgetSettings />)
    const hSwitch = await screen.findByTestId('widget-headline-first-page-only')
    expect(hSwitch.getAttribute('aria-checked')).toBe('true')
    expect(
      screen.getByTestId('widget-description-first-page-only').getAttribute('aria-checked'),
    ).toBe('false')
    expect(
      screen.getByTestId('widget-footer-first-page-only').getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('toggling headline switch marks the form dirty and enables Save', async () => {
    const user = userEvent.setup()
    render(<WidgetSettings />)
    const saveBtn = await screen.findByTestId('widget-text-save')
    expect(saveBtn).toBeDisabled()
    const hSwitch = screen.getByTestId('widget-headline-first-page-only')
    await user.click(hSwitch)
    expect(saveBtn).toBeEnabled()
  })

  it('saving PATCHes the three boolean keys alongside the text fields', async () => {
    const user = userEvent.setup()
    patchOperatorMock.mockResolvedValue(makeOperator())
    render(<WidgetSettings />)

    // Toggle headline and footer switches.
    const hSwitch = await screen.findByTestId('widget-headline-first-page-only')
    const fSwitch = screen.getByTestId('widget-footer-first-page-only')
    await user.click(hSwitch)
    await user.click(fSwitch)

    const saveBtn = screen.getByTestId('widget-text-save')
    await user.click(saveBtn)

    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({
          widget_headline_first_page_only: true,
          widget_description_first_page_only: false,
          widget_footer_first_page_only: true,
        }),
      ),
    )
  })
})
