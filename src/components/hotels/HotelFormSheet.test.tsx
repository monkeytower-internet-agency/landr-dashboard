// landr-v526 — HotelFormSheet mutation side-effects.
//
// Verifies that saving a hotel (create or update) invalidates BOTH
// ['hotels', operatorId] and ['config-health'] so the hotel_missing_email
// config-health banner disappears immediately after the operator adds a
// missing booking email — without requiring a full page reload.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { HotelFormSheet } from './HotelFormSheet'
import * as hotelsLib from '@/lib/hotels'

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/hotels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hotels')>()
  return {
    ...actual,
    createHotel: vi.fn(),
    updateHotel: vi.fn(),
    // Places search not under test here — return empty so it doesn't interfere.
    searchHotelPlaces: vi.fn().mockResolvedValue([]),
    getPlacesConfigured: vi.fn().mockResolvedValue({ configured: false }),
  }
})

// HotelPlacesSearch uses the Google Places API; stub at the component level
// so we don't need to deal with its fetch flow in these mutation tests.
vi.mock('@/components/hotels/HotelPlacesSearch', () => ({
  HotelPlacesSearch: () => null,
}))

// TimezonePicker is a complex select widget not needed here.
vi.mock('@/components/ui/timezone-picker', () => ({
  TimezonePicker: ({ onChange }: { onChange: (v: string) => void }) => (
    <input
      data-testid="timezone-picker-stub"
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

// Sonner toast — silence it so tests stay clean.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

const OPERATOR_ID = 'op-test'

const MINIMAL_HOTEL = {
  id: 'hotel-1',
  name: 'Test Hotel',
  email: 'test@hotel.example',
  address: 'Calle Test 1',
  phone: '+34 600 000 001',
  maps_link: 'https://maps.google.com/test',
  website: null,
  contact_email: null,
  checkin_time: null,
  checkout_time: null,
  timezone: null,
  missing_email: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} as const

function renderSheet(
  client: QueryClient,
  props: Partial<React.ComponentProps<typeof HotelFormSheet>> = {},
) {
  return render(
    <QueryClientProvider client={client}>
      <HotelFormSheet
        open={true}
        onOpenChange={vi.fn()}
        operatorId={OPERATOR_ID}
        editTarget={null}
        {...props}
      />
    </QueryClientProvider>,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HotelFormSheet — config-health invalidation (landr-v526)', () => {
  beforeEach(() => {
    vi.mocked(hotelsLib.createHotel).mockResolvedValue(MINIMAL_HOTEL as hotelsLib.Hotel)
    vi.mocked(hotelsLib.updateHotel).mockResolvedValue({
      ...MINIMAL_HOTEL,
      email: 'updated@hotel.example',
    } as hotelsLib.Hotel)
  })

  it('invalidates [\'config-health\'] after creating a hotel', async () => {
    const client = makeClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    renderSheet(client)

    const user = userEvent.setup()
    // Label text from strings.ts: hotels.fieldName = 'Name', hotels.fieldEmail = 'Booking-confirmation email'
    // Schema requires name, email, address, phone as non-empty.
    await user.type(screen.getByLabelText('Name'), 'My Hotel')
    await user.type(screen.getByLabelText('Booking-confirmation email'), 'book@hotel.example')
    await user.type(screen.getByLabelText('Address'), 'Calle Test 1')
    await user.type(screen.getByLabelText('Phone'), '+34 600 000 001')

    const submitBtn = screen.getByRole('button', { name: /add hotel/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(hotelsLib.createHotel).toHaveBeenCalled()
    })

    await waitFor(() => {
      // Must have invalidated config-health (prefix match — no operatorId needed)
      const configHealthCall = invalidateSpy.mock.calls.find((args) => {
        const key = (args[0] as { queryKey?: unknown[] })?.queryKey
        return Array.isArray(key) && key[0] === 'config-health'
      })
      expect(configHealthCall).toBeDefined()
    })
  })

  it('invalidates [\'config-health\'] after updating a hotel', async () => {
    const client = makeClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    renderSheet(client, { editTarget: MINIMAL_HOTEL as hotelsLib.Hotel })

    const user = userEvent.setup()

    // Update the email field so the form is "dirty" and valid
    const emailInput = screen.getByDisplayValue('test@hotel.example')
    await user.clear(emailInput)
    await user.type(emailInput, 'updated@hotel.example')

    const saveBtn = screen.getByRole('button', { name: /save/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(hotelsLib.updateHotel).toHaveBeenCalled()
    })

    await waitFor(() => {
      const configHealthCall = invalidateSpy.mock.calls.find((args) => {
        const key = (args[0] as { queryKey?: unknown[] })?.queryKey
        return Array.isArray(key) && key[0] === 'config-health'
      })
      expect(configHealthCall).toBeDefined()
    })
  })

  it('also invalidates [\'hotels\', operatorId] alongside config-health', async () => {
    const client = makeClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    renderSheet(client)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'Side Effect Hotel')
    await user.type(screen.getByLabelText('Booking-confirmation email'), 'side@hotel.example')
    await user.type(screen.getByLabelText('Address'), 'Calle Test 2')
    await user.type(screen.getByLabelText('Phone'), '+34 600 000 002')

    await user.click(screen.getByRole('button', { name: /add hotel/i }))

    await waitFor(() => {
      expect(hotelsLib.createHotel).toHaveBeenCalled()
    })

    await waitFor(() => {
      const hotelsCall = invalidateSpy.mock.calls.find((args) => {
        const key = (args[0] as { queryKey?: unknown[] })?.queryKey
        return (
          Array.isArray(key) &&
          key[0] === 'hotels' &&
          key[1] === OPERATOR_ID
        )
      })
      expect(hotelsCall).toBeDefined()
    })
  })
})
