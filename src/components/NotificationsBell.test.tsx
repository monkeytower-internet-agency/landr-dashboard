// landr-wwhn.15 — NotificationsBell (v2, ticket-system) contracts:
//
//   1. Bell trigger always renders; no badge when all notifications are read.
//   2. Badge appears when at least one notification has read_at = null.
//   3. Badge count matches the unread count (aria-label).
//   4. Dropdown lists notifications with titles and unread/read visual state.
//   5. Empty state renders when there are no notifications.
//   6. Clicking a notification item calls markNotificationRead (if unread).
//   7. Clicking a notification with a ticket_id navigates:
//      - staff → /staff/tickets?open=<id>  (app-view inbox; landr-7dya.6)
//      - operator → /tickets?open=<id>     (operator board, unchanged)
//   8. "Mark all read" button calls markAllNotificationsRead.
//   9. Error state renders when the query fails.
//
// We mock fetchNotifications, markNotificationRead, markAllNotificationsRead,
// and fetchCurrentPublicUser to bypass Supabase entirely.

import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationRow } from '@/lib/notifications'

// ---- hoisted control state --------------------------------------------------

const { bellMockState } = vi.hoisted(() => ({
  bellMockState: { isStaff: false },
}))

// ---- mocks ------------------------------------------------------------------

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    effectiveIsStaff: bellMockState.isStaff,
    isLoading: false,
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  },
  getSupabase: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  }),
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'auth-uid-1', email: 'operator@example.com' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}))

// Mock fetchCurrentPublicUser from tickets lib (shared query key)
vi.mock('@/lib/tickets', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tickets')>('@/lib/tickets')
  return {
    ...actual,
    fetchCurrentPublicUser: vi.fn().mockResolvedValue({
      id: 'pub-user-1',
      email: 'operator@example.com',
      is_landr_staff: false,
    }),
  }
})

const fetchNotificationsMock = vi.fn<() => Promise<NotificationRow[]>>()
const markNotificationReadMock = vi.fn<(id: string) => Promise<void>>()
const markAllNotificationsReadMock = vi.fn<() => Promise<void>>()

vi.mock('@/lib/notifications', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notifications')>('@/lib/notifications')
  return {
    ...actual,
    fetchNotifications: (...args: unknown[]) =>
      fetchNotificationsMock(...(args as [])),
    markNotificationRead: (...args: unknown[]) =>
      markNotificationReadMock(...(args as [string])),
    markAllNotificationsRead: (...args: unknown[]) =>
      markAllNotificationsReadMock(...(args as [])),
  }
})

// useRealtimeQuery uses supabase.channel internally; mock it to just call
// the underlying useQuery (no real websocket in tests).
vi.mock('@/lib/useRealtimeQuery', async () => {
  const { useQuery } = await import('@tanstack/react-query')
  return {
    useRealtimeQuery: ({ queryKey, queryFn, enabled, ...rest }: Parameters<typeof import('@/lib/useRealtimeQuery').useRealtimeQuery>[0]) =>
      useQuery({ queryKey, queryFn, enabled, ...rest }),
  }
})

import { NotificationsBell } from './NotificationsBell'

// ---- helpers ----------------------------------------------------------------

function makeNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-' + Math.random().toString(36).slice(2, 10),
    user_id: 'pub-user-1',
    ticket_id: null,
    event_type: 'ticket.commented',
    title: 'New comment on your ticket',
    body: null,
    link: null,
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/** Captures the current pathname after navigation so tests can assert on it. */
function PathCapture({ onPathChange }: { onPathChange: (p: string) => void }) {
  const loc = useLocation()
  useEffect(() => {
    onPathChange(`${loc.pathname}${loc.search}`)
  }, [loc.pathname, loc.search, onPathChange])
  return null
}

function renderBell(opts: { isStaff?: boolean } = {}) {
  bellMockState.isStaff = opts.isStaff ?? false
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  let capturedPath = '/'
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={
            <>
              <PathCapture onPathChange={(p) => { capturedPath = p }} />
              <NotificationsBell />
            </>
          } />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  // Return a getter so navigation tests can wait for updates.
  return { ...result, getPath: () => capturedPath }
}


// ---- setup / teardown -------------------------------------------------------

beforeEach(() => {
  bellMockState.isStaff = false
  fetchNotificationsMock.mockReset()
  markNotificationReadMock.mockReset()
  markAllNotificationsReadMock.mockReset()
  markNotificationReadMock.mockResolvedValue(undefined)
  markAllNotificationsReadMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---- tests ------------------------------------------------------------------

describe('NotificationsBell (landr-wwhn.15)', () => {
  it('renders the bell trigger without a badge when all notifications are read', async () => {
    fetchNotificationsMock.mockResolvedValue([
      makeNotification({ id: 'n-read-1', read_at: new Date().toISOString() }),
    ])

    renderBell()

    const trigger = await screen.findByTestId('notifications-bell-trigger')
    expect(trigger).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchNotificationsMock).toHaveBeenCalled()
    })

    expect(
      screen.queryByTestId('notifications-bell-badge'),
    ).not.toBeInTheDocument()
  })

  it('shows no badge when there are no notifications at all', async () => {
    fetchNotificationsMock.mockResolvedValue([])

    renderBell()

    await waitFor(() => {
      expect(fetchNotificationsMock).toHaveBeenCalled()
    })

    expect(
      screen.queryByTestId('notifications-bell-badge'),
    ).not.toBeInTheDocument()
  })

  it('shows the badge when there is at least one unread notification', async () => {
    fetchNotificationsMock.mockResolvedValue([
      makeNotification({ id: 'n-unread-1', read_at: null }),
    ])

    renderBell()

    await waitFor(() => {
      expect(
        screen.getByTestId('notifications-bell-badge'),
      ).toBeInTheDocument()
    })

    const trigger = screen.getByTestId('notifications-bell-trigger')
    expect(trigger).toHaveAttribute('aria-label', '1 unread notifications')
  })

  it('badge count reflects the number of unread notifications', async () => {
    fetchNotificationsMock.mockResolvedValue([
      makeNotification({ id: 'n-1', read_at: null }),
      makeNotification({ id: 'n-2', read_at: null }),
      makeNotification({ id: 'n-3', read_at: new Date().toISOString() }),
    ])

    renderBell()

    await waitFor(() => {
      expect(screen.getByTestId('notifications-bell-badge')).toBeInTheDocument()
    })

    const trigger = screen.getByTestId('notifications-bell-trigger')
    expect(trigger).toHaveAttribute('aria-label', '2 unread notifications')
  })

  it('shows the empty state when there are no notifications', async () => {
    fetchNotificationsMock.mockResolvedValue([])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(
        screen.getByTestId('notifications-bell-empty'),
      ).toBeInTheDocument()
    })
  })

  it('lists notification titles in the dropdown', async () => {
    const n1 = makeNotification({ id: 'n-1', title: 'Your ticket was updated', read_at: null })
    const n2 = makeNotification({ id: 'n-2', title: 'New comment on Bug #42', read_at: new Date().toISOString() })
    fetchNotificationsMock.mockResolvedValue([n1, n2])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId('notifications-bell-list')).toBeInTheDocument()
    })

    expect(screen.getByTestId(`notification-title-${n1.id}`)).toHaveTextContent(
      'Your ticket was updated',
    )
    expect(screen.getByTestId(`notification-title-${n2.id}`)).toHaveTextContent(
      'New comment on Bug #42',
    )
  })

  it('unread dot is present for unread items and absent for read items', async () => {
    const unread = makeNotification({ id: 'n-unread', read_at: null })
    const read = makeNotification({ id: 'n-read', read_at: new Date().toISOString() })
    fetchNotificationsMock.mockResolvedValue([unread, read])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId('notifications-bell-list')).toBeInTheDocument()
    })

    expect(
      screen.getByTestId(`notification-unread-dot-${unread.id}`),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId(`notification-unread-dot-${read.id}`),
    ).not.toBeInTheDocument()
  })

  it('calls markNotificationRead when clicking an unread notification', async () => {
    const n = makeNotification({ id: 'n-click', read_at: null, ticket_id: null })
    fetchNotificationsMock.mockResolvedValue([n])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId(`notification-item-${n.id}`)).toBeInTheDocument()
    })

    await user.click(screen.getByTestId(`notification-item-${n.id}`))

    await waitFor(() => {
      expect(markNotificationReadMock).toHaveBeenCalled()
      // First argument is the notification id; React Query may pass extra
      // context as the second argument — we only care about the id.
      expect(markNotificationReadMock.mock.calls[0][0]).toBe(n.id)
    })
  })

  it('does NOT call markNotificationRead when clicking an already-read notification', async () => {
    const n = makeNotification({
      id: 'n-read',
      read_at: new Date().toISOString(),
      ticket_id: null,
    })
    fetchNotificationsMock.mockResolvedValue([n])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId(`notification-item-${n.id}`)).toBeInTheDocument()
    })

    await user.click(screen.getByTestId(`notification-item-${n.id}`))

    // Should NOT have been called since notification is already read.
    expect(markNotificationReadMock).not.toHaveBeenCalled()
  })

  it('shows the "mark all read" button only when there are unread items', async () => {
    fetchNotificationsMock.mockResolvedValue([
      makeNotification({ id: 'n-1', read_at: null }),
    ])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(
        screen.getByTestId('notifications-bell-mark-all-read'),
      ).toBeInTheDocument()
    })
  })

  it('does NOT show the "mark all read" button when everything is read', async () => {
    fetchNotificationsMock.mockResolvedValue([
      makeNotification({ id: 'n-1', read_at: new Date().toISOString() }),
    ])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId('notifications-bell-list')).toBeInTheDocument()
    })

    expect(
      screen.queryByTestId('notifications-bell-mark-all-read'),
    ).not.toBeInTheDocument()
  })

  it('calls markAllNotificationsRead when "mark all read" is clicked', async () => {
    fetchNotificationsMock.mockResolvedValue([
      makeNotification({ id: 'n-1', read_at: null }),
    ])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    const markAllBtn = await screen.findByTestId(
      'notifications-bell-mark-all-read',
    )
    await user.click(markAllBtn)

    await waitFor(() => {
      expect(markAllNotificationsReadMock).toHaveBeenCalled()
    })
  })

  it('shows the error state when fetchNotifications rejects', async () => {
    fetchNotificationsMock.mockRejectedValue(new Error('network error'))

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(
        screen.getByTestId('notifications-bell-error'),
      ).toBeInTheDocument()
    })
  })

  // ---- landr-7dya.6: bell navigation deep-link --------------------------------

  it('staff: clicking a ticket notification navigates to /staff/tickets?open=<id>', async () => {
    const ticketId = 'ticket-abc-123'
    const n = makeNotification({ id: 'n-staff', ticket_id: ticketId, read_at: null })
    fetchNotificationsMock.mockResolvedValue([n])

    const { getPath } = renderBell({ isStaff: true })

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId(`notification-item-${n.id}`)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId(`notification-item-${n.id}`))

    await waitFor(() => {
      expect(getPath()).toBe(`/staff/tickets?open=${ticketId}`)
    })
  })

  it('operator: clicking a ticket notification navigates to /tickets?open=<id>', async () => {
    const ticketId = 'ticket-def-456'
    const n = makeNotification({ id: 'n-op', ticket_id: ticketId, read_at: null })
    fetchNotificationsMock.mockResolvedValue([n])

    const { getPath } = renderBell({ isStaff: false })

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId(`notification-item-${n.id}`)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId(`notification-item-${n.id}`))

    await waitFor(() => {
      expect(getPath()).toBe(`/tickets?open=${ticketId}`)
    })
  })

  // ---- landr-agiw.1: generic link deep-link (non-ticket notifications) ---------

  it('clicking a no-ticket notification with a link navigates to that link', async () => {
    const n = makeNotification({
      id: 'n-promo',
      ticket_id: null,
      link: '/release?run=run-42',
      event_type: 'promotion.completed',
      read_at: null,
    })
    fetchNotificationsMock.mockResolvedValue([n])

    const { getPath } = renderBell({ isStaff: true })

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId(`notification-item-${n.id}`)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId(`notification-item-${n.id}`))

    await waitFor(() => {
      expect(getPath()).toBe('/release?run=run-42')
    })
  })

  it('does not navigate on a notification with neither ticket_id nor link', async () => {
    const n = makeNotification({
      id: 'n-bare',
      ticket_id: null,
      link: null,
      read_at: null,
    })
    fetchNotificationsMock.mockResolvedValue([n])

    const { getPath } = renderBell({ isStaff: true })
    const startPath = getPath()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)
    await waitFor(() => {
      expect(screen.getByTestId(`notification-item-${n.id}`)).toBeInTheDocument()
    })
    await user.click(screen.getByTestId(`notification-item-${n.id}`))

    // Marked read, but no navigation away from the starting route.
    await waitFor(() => {
      expect(markNotificationReadMock).toHaveBeenCalled()
    })
    expect(getPath()).toBe(startPath)
  })
})
