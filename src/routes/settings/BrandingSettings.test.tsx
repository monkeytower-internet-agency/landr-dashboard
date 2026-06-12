/**
 * BrandingSettings tests (landr-s09l) — logo upload button picker fix.
 *
 * Regression tests for the double-Slot (Label asChild + Button asChild)
 * click-forwarding bug: the upload Button must programmatically click the
 * hidden file input via its ref, not rely on label→input forwarding.
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

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
        upload: vi.fn().mockResolvedValue({ data: { path: 'op-1/logo-1.png' }, error: null }),
        getPublicUrl: () => ({
          data: { publicUrl: 'https://cdn.example.com/op-1/logo-1.png' },
        }),
      }),
    },
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock page-title to avoid router dep in PageTitle
vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

// landr-sl7k — mock the logo-palette extractor so tests never touch
// node-vibrant / canvas / Image (jsdom can't read pixels). Each test sets
// the mock's behaviour (resolve a theme, or reject to simulate a tainted
// canvas / CORS failure).
const { suggestThemeFromLogoMock } = vi.hoisted(() => ({
  suggestThemeFromLogoMock: vi.fn(),
}))
vi.mock('@/lib/logo-palette', () => ({
  suggestThemeFromLogo: (...args: unknown[]) => suggestThemeFromLogoMock(...args),
  LogoPaletteError: class extends Error {},
}))

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeOperator(overrides = {}) {
  return {
    id: 'op-1',
    name: 'Para42',
    slug: 'para42',
    logo_url: null,
    logo_dark_url: null,
    primary_color: null,
    theme: null,
    widget_headline: null,
    widget_description: null,
    widget_footer: null,
    subscription_package: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

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

import { BrandingSettings } from './BrandingSettings'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchOperatorMock.mockResolvedValue(makeOperator())
  patchOperatorMock.mockResolvedValue(makeOperator())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BrandingSettings — logo upload button (landr-s09l)', () => {
  it('renders the hidden file input with the correct accept types', async () => {
    render(<BrandingSettings />)

    const input = await waitFor(() =>
      screen.getByLabelText<HTMLInputElement>('Upload logo'),
    )

    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/png,image/jpeg,image/svg+xml,image/webp')
    // sr-only keeps the input out of the visual layout but reachable
    expect(input.className).toContain('sr-only')
  })

  it('clicking the upload Button triggers .click() on the hidden file input', async () => {
    const user = userEvent.setup()
    render(<BrandingSettings />)

    // Wait for the form to finish loading
    const uploadBtn = await screen.findByRole('button', { name: 'Upload logo' })

    // Spy on the prototype so the spy is in place before the ref is used
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {})

    await user.click(uploadBtn)

    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('shows "Replace logo" label when a logo_url is already set', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ logo_url: 'https://cdn.example.com/op-1/logo-old.png' }),
    )
    render(<BrandingSettings />)

    await screen.findByRole('button', { name: 'Replace logo' })
  })

  it('shows "Remove logo" button only when a logo_url is set', async () => {
    // No logo → no remove button
    render(<BrandingSettings />)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Remove logo' }),
      ).toBeNull(),
    )
  })
})

// ---------------------------------------------------------------------------
// landr-znzz.11 — new feature tests
// ---------------------------------------------------------------------------

describe('BrandingSettings — dark logo (landr-znzz.11)', () => {
  it('renders the dark-mode logo card with "Upload dark logo" button', async () => {
    render(<BrandingSettings />)

    const btn = await screen.findByRole('button', { name: 'Upload dark logo' })
    expect(btn).toBeTruthy()
  })

  it('shows "Replace dark logo" when logo_dark_url is set', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ logo_dark_url: 'https://cdn.example.com/op-1/logo-dark.png' }),
    )
    render(<BrandingSettings />)
    await screen.findByRole('button', { name: 'Replace dark logo' })
  })

  it('shows "Remove dark logo" button only when logo_dark_url is set', async () => {
    // No dark logo → no remove button
    render(<BrandingSettings />)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Remove dark logo' }),
      ).toBeNull(),
    )

    // With dark logo → remove button present
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ logo_dark_url: 'https://cdn.example.com/op-1/logo-dark.png' }),
    )
    render(<BrandingSettings />)
    await screen.findByRole('button', { name: 'Remove dark logo' })
  })

  it('dark logo upload calls patchOperator with logo_dark_url', async () => {
    patchOperatorMock.mockResolvedValue(makeOperator())
    render(<BrandingSettings />)

    await screen.findByRole('button', { name: 'Upload dark logo' })

    // Simulate file selection on the hidden dark-logo input
    const darkFileInput = screen.getByLabelText<HTMLInputElement>('Upload dark logo')
    const file = new File(['img'], 'dark.png', { type: 'image/png' })
    await userEvent.upload(darkFileInput, file)

    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ logo_dark_url: expect.stringContaining('cdn.example.com') }),
      ),
    )
  })
})

describe('BrandingSettings — theme colours (landr-znzz.11)', () => {
  it('renders colour pickers for brand, accent, and background', async () => {
    render(<BrandingSettings />)

    await waitFor(() => {
      // Three colour picker inputs labelled by our strings
      const brandPicker = screen.getByLabelText('Brand colour (text / headings)')
      const accentPicker = screen.getByLabelText('Accent colour (buttons)')
      const bgPicker = screen.getByLabelText('Background colour')
      expect(brandPicker).toBeTruthy()
      expect(accentPicker).toBeTruthy()
      expect(bgPicker).toBeTruthy()
    })
  })

  it('seeds colour pickers from operator.theme when present', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        theme: { brand: '#ff0000', accent: '#00ff00', background: '#0000ff' },
      }),
    )
    render(<BrandingSettings />)

    await waitFor(() => {
      const brandPicker = screen.getByLabelText<HTMLInputElement>(
        'Brand colour (text / headings)',
      )
      expect(brandPicker.value).toBe('#ff0000')
    })
  })

  it('calls patchOperator with theme payload on save', async () => {
    patchOperatorMock.mockResolvedValue(makeOperator())
    render(<BrandingSettings />)

    const saveBtn = await screen.findByTestId('theme-save')
    await userEvent.click(saveBtn)

    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({
          theme: expect.objectContaining({
            brand: expect.stringMatching(/^#[0-9a-f]{6}$/),
            accent: expect.stringMatching(/^#[0-9a-f]{6}$/),
            background: expect.stringMatching(/^#[0-9a-f]{6}$/),
          }),
        }),
      ),
    )
  })
})

describe('BrandingSettings — dark mode overrides collapsible (landr-znzz.11)', () => {
  it('dark overrides section is collapsed by default when no persisted dark theme', async () => {
    render(<BrandingSettings />)

    // The toggle button is present but the dark pickers should not be visible
    const toggleBtn = await screen.findByRole('button', {
      name: 'Dark-mode overrides (optional)',
    })
    expect(toggleBtn).toBeTruthy()
    // Dark brand picker is NOT rendered until expanded
    expect(
      screen.queryByLabelText('Dark brand colour'),
    ).toBeNull()
  })

  it('clicking the toggle expands the dark overrides section', async () => {
    const user = userEvent.setup()
    render(<BrandingSettings />)

    const toggleBtn = await screen.findByRole('button', {
      name: 'Dark-mode overrides (optional)',
    })
    await user.click(toggleBtn)

    // After expansion, dark brand picker is visible
    await screen.findByLabelText('Dark brand colour')
  })

  it('auto-expands when operator has saved dark overrides', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        theme: { brand: '#101010', accent: '#2563eb', background: '#ffffff', dark: { brand: '#f5f5f5' } },
      }),
    )
    render(<BrandingSettings />)

    // Should be expanded without clicking
    await screen.findByLabelText('Dark brand colour')
  })

  it('includes dark overrides in theme payload when provided', async () => {
    const user = userEvent.setup()
    patchOperatorMock.mockResolvedValue(makeOperator())
    render(<BrandingSettings />)

    // Expand dark overrides
    const toggleBtn = await screen.findByRole('button', {
      name: 'Dark-mode overrides (optional)',
    })
    await user.click(toggleBtn)

    // Change the dark brand colour via the hex input
    const darkBrandHexInput = await screen.findByLabelText<HTMLInputElement>(
      'Dark brand colour hex',
    )
    await user.clear(darkBrandHexInput)
    await user.type(darkBrandHexInput, '#aabbcc')

    // Save
    const saveBtn = screen.getByTestId('theme-save')
    await user.click(saveBtn)

    await waitFor(() =>
      expect(patchOperatorMock).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({
          theme: expect.objectContaining({
            dark: expect.objectContaining({ brand: '#aabbcc' }),
          }),
        }),
      ),
    )
  })
})

describe('BrandingSettings — WCAG contrast warnings (landr-znzz.11)', () => {
  it('shows a contrast warning when brand on background is below 4.5:1', async () => {
    // #aaaaaa on #ffffff ≈ 2.32:1 — well below AA
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        theme: { brand: '#aaaaaa', accent: '#2563eb', background: '#ffffff' },
      }),
    )
    render(<BrandingSettings />)

    await screen.findByRole('alert')
    const alerts = screen.getAllByRole('alert')
    const brandWarning = alerts.find((el) =>
      el.textContent?.includes('Brand on background'),
    )
    expect(brandWarning).toBeTruthy()
  })

  it('does not show a contrast warning when colours meet WCAG AA', async () => {
    // #101010 on #ffffff ≈ 18.1:1 — well above AA
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        theme: { brand: '#101010', accent: '#2563eb', background: '#ffffff' },
      }),
    )
    render(<BrandingSettings />)

    // Wait for form to load
    await screen.findByRole('button', { name: 'Upload logo' })

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('BrandingSettings — live preview (landr-znzz.11)', () => {
  it('renders both Light and Dark preview sections', async () => {
    render(<BrandingSettings />)

    await waitFor(() => {
      expect(screen.getByText('Light')).toBeTruthy()
      expect(screen.getByText('Dark')).toBeTruthy()
    })
  })

  it('shows both "Continue" CTAs (one per preview)', async () => {
    render(<BrandingSettings />)

    const ctaBtns = await screen.findAllByRole('button', { name: 'Continue' })
    expect(ctaBtns).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// landr-sl7k Fix 2 — dark override fields show their real (empty) state
// ---------------------------------------------------------------------------

describe('BrandingSettings — dark override fields show empty when unset (landr-sl7k)', () => {
  it('an unset dark accent hex input is BLANK (not #2563eb)', async () => {
    const user = userEvent.setup()
    // Theme set in light mode, but NO dark overrides → dark fields are unset.
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        theme: { brand: '#101010', accent: '#2563eb', background: '#ffffff' },
      }),
    )
    render(<BrandingSettings />)

    // Expand the dark overrides section.
    const toggleBtn = await screen.findByRole('button', {
      name: 'Dark-mode overrides (optional)',
    })
    await user.click(toggleBtn)

    const darkAccentHex = await screen.findByLabelText<HTMLInputElement>(
      'Dark accent colour hex',
    )
    // The misleading behaviour displayed the configured-looking '#2563eb'.
    expect(darkAccentHex.value).toBe('')
    expect(darkAccentHex.value).not.toBe('#2563eb')
  })

  it('seeds the dark field when an override IS configured', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({
        theme: {
          brand: '#101010',
          accent: '#2563eb',
          background: '#ffffff',
          dark: { accent: '#88aaff' },
        },
      }),
    )
    render(<BrandingSettings />)

    const darkAccentHex = await screen.findByLabelText<HTMLInputElement>(
      'Dark accent colour hex',
    )
    expect(darkAccentHex.value).toBe('#88aaff')
  })
})

// ---------------------------------------------------------------------------
// landr-sl7k Fix 3 — "Suggest colours" from the logo
// ---------------------------------------------------------------------------

describe('BrandingSettings — Suggest colours from logo (landr-sl7k)', () => {
  it('does NOT render the Suggest button when there is no logo', async () => {
    render(<BrandingSettings />)
    await screen.findByRole('button', { name: 'Upload logo' })
    expect(
      screen.queryByRole('button', {
        name: 'Suggest theme colours from your uploaded logo',
      }),
    ).toBeNull()
  })

  it('renders the Suggest button once a logo is present', async () => {
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ logo_url: 'https://cdn.example.com/op-1/logo.png' }),
    )
    render(<BrandingSettings />)
    await screen.findByRole('button', {
      name: 'Suggest theme colours from your uploaded logo',
    })
  })

  it('clicking Suggest fills the three colour fields (non-destructive)', async () => {
    const user = userEvent.setup()
    suggestThemeFromLogoMock.mockResolvedValue({
      brand: '#0b1d3a',
      accent: '#2563eb',
      background: '#f2f4f8',
    })
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ logo_url: 'https://cdn.example.com/op-1/logo.png' }),
    )
    render(<BrandingSettings />)

    const btn = await screen.findByRole('button', {
      name: 'Suggest theme colours from your uploaded logo',
    })
    await user.click(btn)

    await waitFor(() => {
      const brand = screen.getByLabelText<HTMLInputElement>(
        'Brand colour (text / headings)',
      )
      const accent = screen.getByLabelText<HTMLInputElement>('Accent colour (buttons)')
      const bg = screen.getByLabelText<HTMLInputElement>('Background colour')
      expect(brand.value).toBe('#0b1d3a')
      expect(accent.value).toBe('#2563eb')
      expect(bg.value).toBe('#f2f4f8')
    })

    // Non-destructive: it must NOT auto-save.
    expect(patchOperatorMock).not.toHaveBeenCalled()
  })

  it('shows an inline hint when the logo canvas is tainted / unreadable', async () => {
    const user = userEvent.setup()
    suggestThemeFromLogoMock.mockRejectedValue(new Error('tainted'))
    fetchOperatorMock.mockResolvedValue(
      makeOperator({ logo_url: 'https://cdn.example.com/op-1/logo.png' }),
    )
    render(<BrandingSettings />)

    const btn = await screen.findByRole('button', {
      name: 'Suggest theme colours from your uploaded logo',
    })
    await user.click(btn)

    await screen.findByText(
      "Couldn't read the logo's colours — set them manually.",
    )
    // Fields are untouched (still defaults) and nothing was saved.
    const accent = screen.getByLabelText<HTMLInputElement>('Accent colour (buttons)')
    expect(accent.value).toBe('#2563eb')
    expect(patchOperatorMock).not.toHaveBeenCalled()
  })
})
