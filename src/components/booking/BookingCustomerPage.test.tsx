// landr-znzz.2 — component test for the "Customer page" tab.
//
// Mocks the booking-briefing API client (kept pure: actual whatsappShareUrl /
// findDay / constants pass through via importOriginal) and exercises the
// empty/create state, the loaded editor, the publish toggle, the content
// Save, a per-day verdict + save, and the rotate-token confirm flow.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { BookingCustomerPage } from '@/components/booking/BookingCustomerPage'
import type { Briefing } from '@/lib/booking-briefing'

const { mock } = vi.hoisted(() => ({
  mock: {
    state: {
      briefing: null as Briefing | null,
      lastPatch: null as Record<string, unknown> | null,
      lastDayPatch: null as { day: string; patch: Record<string, unknown> } | null,
      created: false,
      rotated: false,
    },
  },
}))

vi.mock('@/lib/booking-briefing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/booking-briefing')>()
  return {
    ...actual,
    fetchBriefing: vi.fn(async () => mock.state.briefing),
    createBriefing: vi.fn(async () => {
      mock.state.created = true
      mock.state.briefing = makeBriefing()
      return mock.state.briefing
    }),
    patchBriefing: vi.fn(async (_op, _bk, patch) => {
      mock.state.lastPatch = patch
      mock.state.briefing = {
        ...(mock.state.briefing ?? makeBriefing()),
        ...patch,
        updated_at: new Date().toISOString(),
      } as Briefing
      return mock.state.briefing
    }),
    putBriefingDay: vi.fn(async (_op, _bk, day, patch) => {
      mock.state.lastDayPatch = { day, patch }
      return {
        id: 'day-1',
        briefing_id: 'bf-1',
        booking_id: 'bk-1',
        operator_id: 'op-1',
        day_date: day,
        conditions_status: (patch.conditions_status ?? 'pending') as never,
        conditions_note: patch.conditions_note ?? null,
        plan_headline: patch.plan_headline ?? null,
        plan_detail: patch.plan_detail ?? null,
        meeting_point_text: patch.meeting_point_text ?? null,
        content: {},
        is_published: patch.is_published ?? false,
        published_at: null,
        created_at: '2026-05-25T10:00:00Z',
        updated_at: '2026-05-25T10:00:00Z',
      }
    }),
    rotateBriefingToken: vi.fn(async () => {
      mock.state.rotated = true
      return {
        ...(mock.state.briefing ?? makeBriefing()),
        public_token: 'newtok',
        public_url: 'https://landr.example/t/newtok',
      }
    }),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function makeBriefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    id: 'bf-1',
    operator_id: 'op-1',
    booking_id: 'bk-1',
    public_token: 'tok123',
    public_url: 'https://landr.example/t/tok123',
    token_expires_at: '2027-05-25T10:00:00Z',
    is_published: false,
    title: null,
    welcome_note: null,
    tone: 'playful',
    content: {},
    show_reviews: false,
    review_url: null,
    created_at: '2026-05-25T10:00:00Z',
    updated_at: '2026-05-25T10:00:00Z',
    days: [],
    ...overrides,
  }
}

function render(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const DAYS = ['2026-06-01', '2026-06-02']

beforeEach(() => {
  mock.state.briefing = null
  mock.state.lastPatch = null
  mock.state.lastDayPatch = null
  mock.state.created = false
  mock.state.rotated = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BookingCustomerPage', () => {
  it('shows the create CTA when no briefing exists, and creates one', async () => {
    const user = userEvent.setup()
    render(
      <BookingCustomerPage operatorId="op-1" bookingId="bk-1" days={DAYS} />,
    )
    const createBtn = await screen.findByTestId('briefing-create')
    await user.click(createBtn)
    await waitFor(() => expect(mock.state.created).toBe(true))
    // After create, the share-link surface renders.
    expect(await screen.findByTestId('briefing-public-url')).toBeInTheDocument()
  })

  it('renders the share link, content fields and one card per day', async () => {
    mock.state.briefing = makeBriefing()
    render(
      <BookingCustomerPage operatorId="op-1" bookingId="bk-1" days={DAYS} />,
    )
    expect(
      await screen.findByTestId('briefing-public-url'),
    ).toHaveValue('https://landr.example/t/tok123')
    expect(screen.getByTestId('briefing-day-2026-06-01')).toBeInTheDocument()
    expect(screen.getByTestId('briefing-day-2026-06-02')).toBeInTheDocument()
  })

  it('builds a WhatsApp link targeting the customer phone', async () => {
    mock.state.briefing = makeBriefing()
    render(
      <BookingCustomerPage
        operatorId="op-1"
        bookingId="bk-1"
        days={DAYS}
        customerPhone="+34 600 111 222"
      />,
    )
    const wa = (await screen.findByTestId('briefing-whatsapp')) as HTMLAnchorElement
    expect(wa.getAttribute('href')).toContain('https://wa.me/34600111222?text=')
  })

  it('toggles publish immediately via PATCH', async () => {
    const user = userEvent.setup()
    mock.state.briefing = makeBriefing({ is_published: false })
    render(
      <BookingCustomerPage operatorId="op-1" bookingId="bk-1" days={DAYS} />,
    )
    await user.click(await screen.findByTestId('briefing-publish'))
    await waitFor(() =>
      expect(mock.state.lastPatch).toEqual({ is_published: true }),
    )
  })

  it('saves content fields via PATCH', async () => {
    const user = userEvent.setup()
    mock.state.briefing = makeBriefing()
    render(
      <BookingCustomerPage operatorId="op-1" bookingId="bk-1" days={DAYS} />,
    )
    const titleInput = await screen.findByLabelText('Title')
    await user.type(titleInput, 'Sunrise paddle')
    await user.click(screen.getByTestId('briefing-save'))
    await waitFor(() =>
      expect(mock.state.lastPatch?.title).toBe('Sunrise paddle'),
    )
  })

  it('saves a day verdict + plan via PUT', async () => {
    const user = userEvent.setup()
    mock.state.briefing = makeBriefing()
    render(
      <BookingCustomerPage operatorId="op-1" bookingId="bk-1" days={DAYS} />,
    )
    await screen.findByTestId('briefing-day-2026-06-01')
    await user.click(
      screen.getByTestId('briefing-day-2026-06-01-condition-go'),
    )
    await user.click(screen.getByTestId('briefing-day-2026-06-01-save'))
    await waitFor(() => {
      expect(mock.state.lastDayPatch?.day).toBe('2026-06-01')
      expect(mock.state.lastDayPatch?.patch.conditions_status).toBe('go')
    })
  })

  it('rotates the token after confirming the dialog', async () => {
    const user = userEvent.setup()
    mock.state.briefing = makeBriefing()
    render(
      <BookingCustomerPage operatorId="op-1" bookingId="bk-1" days={DAYS} />,
    )
    await user.click(await screen.findByTestId('briefing-rotate'))
    await user.click(await screen.findByTestId('briefing-rotate-confirm'))
    await waitFor(() => expect(mock.state.rotated).toBe(true))
  })

  it('shows the no-days hint when the booking has no scheduled days', async () => {
    mock.state.briefing = makeBriefing()
    render(<BookingCustomerPage operatorId="op-1" bookingId="bk-1" days={[]} />)
    expect(
      await screen.findByText(/no scheduled days/i),
    ).toBeInTheDocument()
  })
})
