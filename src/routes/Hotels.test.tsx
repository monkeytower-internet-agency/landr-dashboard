import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// ---- Fixtures -------------------------------------------------------

type HotelFixture = {
  id: string
  name: string
  email: string | null
  address: string | null
  phone: string | null
  maps_link: string | null
  website: string | null
  contact_email: string | null
  checkin_time: string | null
  checkout_time: string | null
  timezone: string | null
  missing_email: boolean
  created_at: string
  updated_at: string
}

// ---- API mock (src/lib/hotels) --------------------------------------

const { mock } = vi.hoisted(() => {
  const state = {
    hotels: [] as HotelFixture[],
    fetchError: false,
    lastPost: null as Record<string, unknown> | null,
    lastPatch: null as { id: string; payload: Record<string, unknown> } | null,
    lastDelete: null as string | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/hotels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hotels')>()
  return {
    ...actual,
    fetchHotels: vi.fn(async () => {
      if (mock.state.fetchError) throw new Error('fetch failed')
      return mock.state.hotels
    }),
    createHotel: vi.fn(async (_opId: string, body: Record<string, unknown>) => {
      mock.state.lastPost = body
      const newHotel: HotelFixture = {
        id: `hotel-${mock.state.hotels.length + 1}`,
        name: body.name as string,
        email: (body.email as string | null) ?? null,
        address: (body.address as string | null) ?? null,
        phone: (body.phone as string | null) ?? null,
        maps_link: (body.maps_link as string | null) || null,
        website: (body.website as string | null) || null,
        contact_email: (body.contact_email as string | null) || null,
        checkin_time: (body.checkin_time as string | null) || null,
        checkout_time: (body.checkout_time as string | null) || null,
        timezone: (body.timezone as string | null) || null,
        missing_email: !body.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      mock.state.hotels = [...mock.state.hotels, newHotel]
      return newHotel
    }),
    updateHotel: vi.fn(
      async (_opId: string, id: string, body: Record<string, unknown>) => {
        mock.state.lastPatch = { id, payload: body }
        const idx = mock.state.hotels.findIndex((h) => h.id === id)
        if (idx >= 0) {
          mock.state.hotels[idx] = {
            ...mock.state.hotels[idx],
            ...body,
          } as HotelFixture
          return mock.state.hotels[idx]
        }
        throw new Error('not found')
      },
    ),
    deleteHotel: vi.fn(async (_opId: string, id: string) => {
      mock.state.lastDelete = id
      mock.state.hotels = mock.state.hotels.filter((h) => h.id !== id)
    }),
  }
})

// ---- Supabase / realtime stub ----------------------------------------

type ChannelHandle = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

const { channel } = vi.hoisted(() => {
  const ch: ChannelHandle = { on: vi.fn(), subscribe: vi.fn() }
  ch.on.mockImplementation(() => ch)
  return { channel: ch }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'tok' } },
      })),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  },
}))

// ---- App providers mock ----------------------------------------------

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: { success: [] as string[], error: [] as string[] },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => {
      toastCalls.success.push(msg)
    }),
    error: vi.fn((msg: string) => {
      toastCalls.error.push(msg)
    }),
  },
  Toaster: () => null,
}))

import { Hotels } from './Hotels'

function makeHotel(overrides: Partial<HotelFixture> = {}): HotelFixture {
  return {
    id: 'hotel-1',
    name: 'Hotel Sol',
    email: 'reception@hotel-sol.example',
    address: 'Calle del Mar 12',
    phone: '+34 600 000 000',
    maps_link: 'https://maps.google.com/sol',
    website: null,
    contact_email: null,
    checkin_time: null,
    checkout_time: null,
    timezone: null,
    missing_email: false,
    created_at: '2026-06-11T10:00:00.000Z',
    updated_at: '2026-06-11T10:00:00.000Z',
    ...overrides,
  }
}

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  mock.state.hotels = []
  mock.state.fetchError = false
  mock.state.lastPost = null
  mock.state.lastPatch = null
  mock.state.lastDelete = null
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Hotels route', () => {
  it('renders the page title and subtitle', async () => {
    mock.state.hotels = [makeHotel()]
    render(<Hotels />)
    await screen.findByText('Hotel Sol')
    expect(
      screen.getByText(/manage accommodation partners/i),
    ).toBeInTheDocument()
  })

  it('lists hotels (name/email/address/phone) from the API', async () => {
    mock.state.hotels = [
      makeHotel({ id: 'hotel-1', name: 'Hotel Sol' }),
      makeHotel({
        id: 'hotel-2',
        name: 'Hotel Luna',
        email: 'luna@example.com',
        address: 'Avenida Luna 9',
        phone: '+34 611 111 111',
      }),
    ]
    render(<Hotels />)

    await screen.findByText('Hotel Sol')
    expect(screen.getByText('Hotel Luna')).toBeInTheDocument()
    expect(screen.getByText('reception@hotel-sol.example')).toBeInTheDocument()
    expect(screen.getByText('Calle del Mar 12')).toBeInTheDocument()
    expect(screen.getByText('+34 600 000 000')).toBeInTheDocument()
  })

  it('opens the create sheet with empty defaults', async () => {
    const user = userEvent.setup()
    render(<Hotels />)

    await user.click(
      await screen.findByRole('button', { name: /add hotel/i }),
    )
    const dialog = await screen.findByRole('dialog')
    const nameInput = within(dialog).getByLabelText(
      /^Name$/i,
    ) as HTMLInputElement
    expect(nameInput.value).toBe('')
    // booking-confirmation email (required)
    expect(
      (
        within(dialog).getByLabelText(
          /booking-confirmation email/i,
        ) as HTMLInputElement
      ).value,
    ).toBe('')
    // general contact email (optional, new field)
    expect(
      (
        within(dialog).getByLabelText(
          /general contact email/i,
        ) as HTMLInputElement
      ).value,
    ).toBe('')
  })

  it('creates a hotel: POST called, success toast', async () => {
    const user = userEvent.setup()
    render(<Hotels />)

    await user.click(
      await screen.findByRole('button', { name: /add hotel/i }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Name$/i), 'Hotel Sol')
    await user.type(
      within(dialog).getByLabelText(/booking-confirmation email/i),
      'reception@hotel-sol.example',
    )
    await user.type(
      within(dialog).getByLabelText(/^Address$/i),
      'Calle del Mar 12',
    )
    await user.type(within(dialog).getByLabelText(/^Phone$/i), '+34 600 000 000')
    await user.click(
      within(dialog).getByRole('button', { name: /^Add hotel$/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastPost).not.toBeNull()
    })
    expect(mock.state.lastPost).toMatchObject({
      name: 'Hotel Sol',
      email: 'reception@hotel-sol.example',
      address: 'Calle del Mar 12',
      phone: '+34 600 000 000',
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('edits a hotel: fields prefilled, PATCH called', async () => {
    mock.state.hotels = [makeHotel()]
    const user = userEvent.setup()
    render(<Hotels />)

    await screen.findByText('Hotel Sol')
    await user.click(screen.getByRole('button', { name: /Edit — Hotel Sol/i }))

    const dialog = await screen.findByRole('dialog')
    const nameInput = within(dialog).getByLabelText(
      /^Name$/i,
    ) as HTMLInputElement
    expect(nameInput.value).toBe('Hotel Sol')
    expect(
      (within(dialog).getByLabelText(/^Address$/i) as HTMLInputElement).value,
    ).toBe('Calle del Mar 12')

    await user.clear(nameInput)
    await user.type(nameInput, 'Hotel Sol Renamed')
    await user.click(
      within(dialog).getByRole('button', { name: /save changes/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastPatch).not.toBeNull()
    })
    expect(mock.state.lastPatch?.payload).toMatchObject({
      name: 'Hotel Sol Renamed',
    })
  })

  it('validates required fields and booking-email format', async () => {
    const user = userEvent.setup()
    render(<Hotels />)

    await user.click(
      await screen.findByRole('button', { name: /add hotel/i }),
    )
    const dialog = await screen.findByRole('dialog')
    // Submit empty -> required errors, no POST.
    await user.click(
      within(dialog).getByRole('button', { name: /^Add hotel$/i }),
    )
    expect(await within(dialog).findByText(/name is required/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/enter a valid email address/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/address is required/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/phone is required/i)).toBeInTheDocument()
    expect(mock.state.lastPost).toBeNull()

    // Invalid booking email -> rejected.
    await user.type(within(dialog).getByLabelText(/^Name$/i), 'Hotel Sol')
    await user.type(
      within(dialog).getByLabelText(/booking-confirmation email/i),
      'not-an-email',
    )
    await user.type(within(dialog).getByLabelText(/^Address$/i), 'Some street')
    await user.type(within(dialog).getByLabelText(/^Phone$/i), '+34 600')
    await user.click(
      within(dialog).getByRole('button', { name: /^Add hotel$/i }),
    )
    expect(
      await within(dialog).findByText(/enter a valid email address/i),
    ).toBeInTheDocument()
    expect(mock.state.lastPost).toBeNull()
  })

  it('allows an empty maps link', async () => {
    const user = userEvent.setup()
    render(<Hotels />)

    await user.click(
      await screen.findByRole('button', { name: /add hotel/i }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Name$/i), 'Hotel Sol')
    await user.type(
      within(dialog).getByLabelText(/booking-confirmation email/i),
      'reception@hotel-sol.example',
    )
    await user.type(within(dialog).getByLabelText(/^Address$/i), 'Calle 12')
    await user.type(within(dialog).getByLabelText(/^Phone$/i), '+34 600')
    // maps link left blank
    await user.click(
      within(dialog).getByRole('button', { name: /^Add hotel$/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastPost).not.toBeNull()
    })
    expect(mock.state.lastPost).toMatchObject({ maps_link: '' })
  })

  it('shows a missing-email badge when a hotel has no email', async () => {
    mock.state.hotels = [
      makeHotel({ name: 'Hotel Sol', email: null, missing_email: true }),
    ]
    render(<Hotels />)

    await screen.findByText('Hotel Sol')
    expect(screen.getByText(/missing email/i)).toBeInTheDocument()
  })

  it('deletes a hotel after confirming the dialog', async () => {
    mock.state.hotels = [makeHotel()]
    const user = userEvent.setup()
    render(<Hotels />)

    await screen.findByText('Hotel Sol')
    await user.click(
      screen.getByRole('button', { name: /Delete — Hotel Sol/i }),
    )

    const alertDialog = await screen.findByRole('alertdialog')
    await user.click(
      within(alertDialog).getByRole('button', { name: /^Delete$/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastDelete).toBe('hotel-1')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('shows the error state when the fetch fails', async () => {
    mock.state.fetchError = true
    render(<Hotels />)
    await screen.findByText(/failed to load hotels/i)
  })

  it('subscribes to realtime updates on the locations table', async () => {
    mock.state.hotels = [makeHotel()]
    render(<Hotels />)

    await screen.findByText('Hotel Sol')
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        table: 'locations',
        filter: 'operator_id=eq.op-1',
      }),
      expect.any(Function),
    )
  })

  it('creates a hotel with website and general contact email', async () => {
    const user = userEvent.setup()
    render(<Hotels />)

    await user.click(
      await screen.findByRole('button', { name: /add hotel/i }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Name$/i), 'Hotel Luna')
    await user.type(
      within(dialog).getByLabelText(/booking-confirmation email/i),
      'bookings@hotel-luna.example',
    )
    await user.type(within(dialog).getByLabelText(/^Address$/i), 'Avenida Luna 9')
    await user.type(within(dialog).getByLabelText(/^Phone$/i), '+34 611 111 111')
    // optional new fields
    await user.type(
      within(dialog).getByLabelText(/general contact email/i),
      'info@hotel-luna.example',
    )
    await user.type(
      within(dialog).getByLabelText(/website/i),
      'https://hotel-luna.example',
    )
    await user.click(
      within(dialog).getByRole('button', { name: /^Add hotel$/i }),
    )

    await waitFor(() => {
      expect(mock.state.lastPost).not.toBeNull()
    })
    expect(mock.state.lastPost).toMatchObject({
      email: 'bookings@hotel-luna.example',
      contact_email: 'info@hotel-luna.example',
      website: 'https://hotel-luna.example',
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('edit sheet prefills new v2 fields', async () => {
    mock.state.hotels = [
      makeHotel({
        website: 'https://hotel-sol.example',
        contact_email: 'info@hotel-sol.example',
        checkin_time: '14:00',
        checkout_time: '11:00',
        timezone: 'Atlantic/Canary',
      }),
    ]
    const user = userEvent.setup()
    render(<Hotels />)

    await screen.findByText('Hotel Sol')
    await user.click(screen.getByRole('button', { name: /Edit — Hotel Sol/i }))

    const dialog = await screen.findByRole('dialog')
    expect(
      (
        within(dialog).getByLabelText(/general contact email/i) as HTMLInputElement
      ).value,
    ).toBe('info@hotel-sol.example')
    expect(
      (within(dialog).getByLabelText(/website/i) as HTMLInputElement).value,
    ).toBe('https://hotel-sol.example')
    expect(
      (within(dialog).getByLabelText(/check-in time/i) as HTMLInputElement).value,
    ).toBe('14:00')
    expect(
      (within(dialog).getByLabelText(/check-out time/i) as HTMLInputElement).value,
    ).toBe('11:00')
  })

  it('rejects an invalid general contact email format', async () => {
    const user = userEvent.setup()
    render(<Hotels />)

    await user.click(
      await screen.findByRole('button', { name: /add hotel/i }),
    )
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Name$/i), 'Hotel Sol')
    await user.type(
      within(dialog).getByLabelText(/booking-confirmation email/i),
      'reception@hotel-sol.example',
    )
    await user.type(within(dialog).getByLabelText(/^Address$/i), 'Calle 12')
    await user.type(within(dialog).getByLabelText(/^Phone$/i), '+34 600')
    await user.type(
      within(dialog).getByLabelText(/general contact email/i),
      'not-an-email',
    )
    await user.click(
      within(dialog).getByRole('button', { name: /^Add hotel$/i }),
    )
    expect(
      await within(dialog).findByText(/enter a valid email address/i),
    ).toBeInTheDocument()
    expect(mock.state.lastPost).toBeNull()
  })
})
