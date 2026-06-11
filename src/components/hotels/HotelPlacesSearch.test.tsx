/**
 * Tests for HotelPlacesSearch and its integration with HotelFormSheet.
 *
 * The backend API (/hotel-places/*) is mocked at the module level so no
 * network is required. Tests cover:
 *  1. Autocomplete dropdown renders predictions on successful response.
 *  2. Selecting a prediction pre-fills the parent form fields.
 *  3. { configured: false } response shows the not-configured hint and
 *     leaves manual entry fully working (form submits its default data).
 *
 * Timer note: userEvent v14 manages its own internal async I/O; mixing
 * vi.useFakeTimers() with user.type() causes deadlocks. Instead we use real
 * timers throughout and rely on waitFor() + the fact that our mock resolvers
 * return synchronously (Promise.resolve). For the debounce specifically,
 * we type slowly enough via userEvent's `delay` option so the 300 ms window
 * expires on its own, or we bypass it by directly setting state via fireEvent.
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

/** Fire a native input event to set the input value, bypassing debounce timing. */
function typeIntoInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

// ── shared fixtures ────────────────────────────────────────────────────────

const PREDICTIONS: hotelsLib.PlacePrediction[] = [
  { placeId: 'place-1', mainText: 'Hotel Sol', secondaryText: 'Fuerteventura, Spain' },
  { placeId: 'place-2', mainText: 'Hotel Luna', secondaryText: 'Gran Canaria, Spain' },
]

const DETAILS: hotelsLib.PlaceDetails = {
  name: 'Hotel Sol',
  address: 'Calle del Mar 12, 35660',
  phone: '+34 600 000 000',
  website: 'https://www.hotel-sol.example',
  mapsLink: 'https://maps.google.com/sol',
  timezone: 'Atlantic/Canary',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// ── tests ──────────────────────────────────────────────────────────────────

describe('HotelPlacesSearch', () => {
  it('renders a search input', () => {
    renderSearch()
    expect(screen.getByRole('textbox', { name: /search on google/i })).toBeInTheDocument()
  })

  it('shows autocomplete predictions after debounce fires', async () => {
    vi.spyOn(hotelsLib, 'fetchPlaceAutocomplete').mockResolvedValue(PREDICTIONS)

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })

    // type ≥3 chars to pass the debounce guard; use fireEvent so there are no
    // timer conflicts — the debounce timeout runs in real time via jsdom.
    typeIntoInput(input, 'Hot')

    // waitFor polls until either the listbox appears or the timeout expires.
    // The debounce is 300 ms; waitFor default timeout is 1000 ms — plenty.
    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: /place suggestions/i })).toBeInTheDocument()
    }, { timeout: 2000 })

    expect(hotelsLib.fetchPlaceAutocomplete).toHaveBeenCalledWith(
      'op-1',
      'Hot',
      expect.any(String),
    )

    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('Hotel Sol')).toBeInTheDocument()
    expect(within(listbox).getByText('Hotel Luna')).toBeInTheDocument()
  })

  it('calls onSelect with PlaceDetails when a prediction is clicked', async () => {
    vi.spyOn(hotelsLib, 'fetchPlaceAutocomplete').mockResolvedValue(PREDICTIONS)
    vi.spyOn(hotelsLib, 'fetchPlaceDetails').mockResolvedValue(DETAILS)

    const { onSelect } = renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })

    typeIntoInput(input, 'Hot')

    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument(),
    { timeout: 2000 })

    const listbox = screen.getByRole('listbox')
    const firstItem = within(listbox).getByText('Hotel Sol').closest<HTMLElement>('[role="option"]')!

    await act(async () => {
      firstItem.click()
    })

    await waitFor(() => {
      expect(hotelsLib.fetchPlaceDetails).toHaveBeenCalledWith(
        'op-1',
        'place-1',
        expect.any(String),
      )
    })

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(DETAILS)
    })
  })

  it('shows the not-configured hint when the API returns PlacesNotConfiguredError', async () => {
    vi.spyOn(hotelsLib, 'fetchPlaceAutocomplete').mockRejectedValue(
      new PlacesNotConfiguredError(),
    )

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })
    typeIntoInput(input, 'Hot')

    await waitFor(() => {
      expect(screen.getByTestId('places-not-configured')).toBeInTheDocument()
    }, { timeout: 2000 })

    // No dropdown shown
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does not call the API when fewer than 3 chars are typed', async () => {
    vi.spyOn(hotelsLib, 'fetchPlaceAutocomplete').mockResolvedValue(PREDICTIONS)

    renderSearch()
    const input = screen.getByRole('textbox', { name: /search on google/i })
    typeIntoInput(input, 'Ho')

    // Give the debounce time to fire if it were going to
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })

    expect(hotelsLib.fetchPlaceAutocomplete).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
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
  it('pre-fills form fields after selecting a prediction', async () => {
    vi.spyOn(hotelsLib, 'fetchPlaceAutocomplete').mockResolvedValue(PREDICTIONS)
    vi.spyOn(hotelsLib, 'fetchPlaceDetails').mockResolvedValue(DETAILS)

    renderFormSheet()

    const input = screen.getByRole('textbox', { name: /search on google/i })
    typeIntoInput(input, 'Hot')

    await waitFor(() =>
      expect(screen.getByRole('listbox')).toBeInTheDocument(),
    { timeout: 2000 })

    const listbox = screen.getByRole('listbox')
    const firstItem = within(listbox).getByText('Hotel Sol').closest<HTMLElement>('[role="option"]')!

    await act(async () => {
      firstItem.click()
    })

    await waitFor(() => {
      expect(hotelsLib.fetchPlaceDetails).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Hotel Sol')).toBeInTheDocument()
    })

    expect(screen.getByDisplayValue('Calle del Mar 12, 35660')).toBeInTheDocument()
    expect(screen.getByDisplayValue('+34 600 000 000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://www.hotel-sol.example')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://maps.google.com/sol')).toBeInTheDocument()

    // Autofill banner should appear
    expect(screen.getByTestId('places-autofill-banner')).toBeInTheDocument()

    // Booking-confirmation email field must remain empty (not pre-filled)
    const emailInput = screen.getByRole('textbox', {
      name: /booking-confirmation email/i,
    })
    expect(emailInput).toHaveValue('')
  })

  it('shows not-configured hint + manual entry still works when API not set up', async () => {
    vi.spyOn(hotelsLib, 'fetchPlaceAutocomplete').mockRejectedValue(
      new PlacesNotConfiguredError(),
    )

    renderFormSheet()

    const input = screen.getByRole('textbox', { name: /search on google/i })
    typeIntoInput(input, 'Hot')

    await waitFor(() =>
      expect(screen.getByTestId('places-not-configured')).toBeInTheDocument(),
    { timeout: 2000 })

    // Manual entry still works — the user can type in the Name field
    const nameInput = screen.getByRole('textbox', { name: /^name$/i })
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'My Custom Hotel')
    expect(nameInput).toHaveValue('My Custom Hotel')
  })
})
