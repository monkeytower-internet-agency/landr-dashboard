/**
 * Tests for HotelPlacesSearch (ENTER-only text search) and its integration
 * with HotelFormSheet.
 *
 * Key behaviours under test:
 *  1. Typing alone does NOT trigger any API call — only Enter / Search button does.
 *  2. Search fires on Enter and on button click; top results render.
 *  3. Picking a result calls onSelect directly (no details round-trip).
 *  4. { configured: false } / PlacesNotConfiguredError shows the hint; manual entry works.
 *  5. The input is never disabled while typing — only the Search button reflects loading.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { HotelPlacesSearch } from './HotelPlacesSearch'
import * as hotelsLib from '@/lib/hotels'
import { PlacesNotConfiguredError } from '@/lib/hotels'

// ── helpers ────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderSearch(
  overrides: Partial<React.ComponentProps<typeof HotelPlacesSearch>> = {},
) {
  const onSelect = vi.fn()
  const client = makeClient()
  const result = render(
    <QueryClientProvider client={client}>
      <HotelPlacesSearch
        operatorId="op-1"
        onSelect={onSelect}
        {...overrides}
      />
    </QueryClientProvider>,
  )
  return { onSelect, client, ...result }
}

// ── shared fixtures ────────────────────────────────────────────────────────

const RESULTS: hotelsLib.PlaceSearchResult[] = [
  {
    placeId: 'place-1',
    name: 'Fonda Central',
    address: 'Calle Mayor 1, Adeje, Tenerife, Spain',
    phone: '+34 922 000 001',
    website: 'https://www.fondacentral.example',
    mapsLink: 'https://maps.google.com/fonda-central',
    timezone: 'Atlantic/Canary',
  },
  {
    placeId: 'place-2',
    name: 'Hotel Sol',
    address: 'Avenida del Mar 12, 35660, Corralejo',
    phone: '+34 928 000 002',
    website: 'https://www.hotel-sol.example',
    mapsLink: 'https://maps.google.com/hotel-sol',
    timezone: 'Atlantic/Canary',
  },
]

beforeEach(() => {
  vi.restoreAllMocks()
})

// ── tests ──────────────────────────────────────────────────────────────────

describe('HotelPlacesSearch', () => {
  it('renders a search input and Search button', () => {
    renderSearch()
    expect(screen.getByRole('textbox', { name: /search on google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })

  it('does NOT call the API while typing — only on Enter', async () => {
    const spy = vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })

    // Type characters — API must NOT be called
    fireEvent.change(input, { target: { value: 'F' } })
    fireEvent.change(input, { target: { value: 'Fo' } })
    fireEvent.change(input, { target: { value: 'Fon' } })
    fireEvent.change(input, { target: { value: 'Fond' } })

    // Wait a bit to be sure no debounce fires
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })

    expect(spy).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does NOT call the API while typing — only on Search button click', async () => {
    const spy = vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })

    fireEvent.change(input, { target: { value: 'Fonda Central' } })

    // Wait — still no call
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })
    expect(spy).not.toHaveBeenCalled()

    // Now click Search
    fireEvent.click(screen.getByRole('button', { name: /search/i }))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('op-1', 'Fonda Central')
    }, { timeout: 2000 })
  })

  it('fires search on Enter keypress and renders top results', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })

    fireEvent.change(input, { target: { value: 'Fonda Central' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: /place suggestions/i })).toBeInTheDocument()
    }, { timeout: 2000 })

    expect(hotelsLib.fetchHotelPlaceSearch).toHaveBeenCalledWith('op-1', 'Fonda Central')

    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('Fonda Central')).toBeInTheDocument()
    expect(within(listbox).getByText('Hotel Sol')).toBeInTheDocument()
  })

  it('shows address as secondary text in results', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })
    fireEvent.change(input, { target: { value: 'Fonda' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument(),
    { timeout: 2000 })

    expect(screen.getByText('Calle Mayor 1, Adeje, Tenerife, Spain')).toBeInTheDocument()
  })

  it('calls onSelect with PlaceSearchResult directly when a result is picked (no details call)', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)
    // Ensure fetchPlaceDetails is NOT called
    const detailsSpy = vi.spyOn(hotelsLib, 'fetchPlaceDetails')

    const { onSelect } = renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })

    fireEvent.change(input, { target: { value: 'Fonda Central' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument(),
    { timeout: 2000 })

    const listbox = screen.getByRole('listbox')
    const firstItem = within(listbox).getByText('Fonda Central').closest<HTMLElement>('[role="option"]')!

    await act(async () => {
      firstItem.click()
    })

    // onSelect called immediately with the full result
    expect(onSelect).toHaveBeenCalledWith(RESULTS[0])
    // No details round-trip
    expect(detailsSpy).not.toHaveBeenCalled()
  })

  it('input stays enabled while typing and during search', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })

    // While typing
    fireEvent.change(input, { target: { value: 'Fonda' } })
    expect(input).not.toBeDisabled()

    // After submitting (while loading)
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(input).not.toBeDisabled()

    // After results arrive
    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument(),
    { timeout: 2000 })
    expect(input).not.toBeDisabled()
  })

  it('shows the not-configured hint when the API returns PlacesNotConfiguredError', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockRejectedValue(
      new PlacesNotConfiguredError(),
    )

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })
    fireEvent.change(input, { target: { value: 'Fonda Central' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('places-not-configured')).toBeInTheDocument()
    }, { timeout: 2000 })

    // No results dropdown shown
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows empty-results message when search returns no matches', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue([])

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })
    fireEvent.change(input, { target: { value: 'xyzzy nonexistent hotel' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    }, { timeout: 2000 })

    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument()
    }, { timeout: 2000 })
  })
})

// ── HotelFormSheet integration tests ──────────────────────────────────────
import { HotelFormSheet } from './HotelFormSheet'

function renderFormSheet() {
  const client = makeClient()
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <HotelFormSheet
        open
        onOpenChange={onOpenChange}
        operatorId="op-1"
        editTarget={null}
      />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

describe('HotelFormSheet — Google Places integration', () => {
  it('pre-fills form fields after selecting a text-search result (no details call)', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)
    const detailsSpy = vi.spyOn(hotelsLib, 'fetchPlaceDetails')

    renderFormSheet()

    const input = screen.getByRole('textbox', { name: /search on google/i })
    fireEvent.change(input, { target: { value: 'Fonda Central' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument(),
    { timeout: 2000 })

    const listbox = screen.getByRole('listbox')
    const firstItem = within(listbox).getByText('Fonda Central').closest<HTMLElement>('[role="option"]')!

    await act(async () => {
      firstItem.click()
    })

    // No details round-trip
    expect(detailsSpy).not.toHaveBeenCalled()

    // Form fields pre-filled
    await waitFor(() => {
      expect(screen.getByDisplayValue('Fonda Central')).toBeInTheDocument()
    })

    expect(screen.getByDisplayValue('Calle Mayor 1, Adeje, Tenerife, Spain')).toBeInTheDocument()
    expect(screen.getByDisplayValue('+34 922 000 001')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://www.fondacentral.example')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://maps.google.com/fonda-central')).toBeInTheDocument()

    // Autofill banner should appear
    expect(screen.getByTestId('places-autofill-banner')).toBeInTheDocument()

    // Booking-confirmation email field must remain empty (not pre-filled)
    const emailInput = screen.getByRole('textbox', {
      name: /booking-confirmation email/i,
    })
    expect(emailInput).toHaveValue('')
  })

  it('shows not-configured hint + manual entry still works when API not set up', async () => {
    vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockRejectedValue(
      new PlacesNotConfiguredError(),
    )

    renderFormSheet()

    const input = screen.getByRole('textbox', { name: /search on google/i })
    fireEvent.change(input, { target: { value: 'Fonda Central' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() =>
      expect(screen.getByTestId('places-not-configured')).toBeInTheDocument(),
    { timeout: 2000 })

    // Manual entry still works — the user can type in the Name field
    const nameInput = screen.getByRole('textbox', { name: /^name$/i })
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'My Custom Hotel')
    expect(nameInput).toHaveValue('My Custom Hotel')
  })

  it('typing alone in the search input does NOT trigger any API call', async () => {
    const spy = vi.spyOn(hotelsLib, 'fetchHotelPlaceSearch').mockResolvedValue(RESULTS)

    renderFormSheet()

    const input = screen.getByRole('textbox', { name: /search on google/i })
    fireEvent.change(input, { target: { value: 'F' } })
    fireEvent.change(input, { target: { value: 'Fo' } })
    fireEvent.change(input, { target: { value: 'Fon' } })
    fireEvent.change(input, { target: { value: 'Fond' } })
    fireEvent.change(input, { target: { value: 'Fonda' } })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })

    expect(spy).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
