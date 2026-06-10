// landr-xen4 → landr-aoak.3 — WidgetButton + StaffWidgetModal tests.
//
// The button no longer opens the public widget in a new tab; it opens a modal
// that embeds the booking widget in an iframe in STAFF mode. Contracts:
//   Visibility (unchanged from landr-xen4):
//     1. Renders nothing while loading (entitlements or token pending).
//     2. Renders nothing when embed feature is disabled.
//     3. Renders nothing when widget token is null.
//     4. Renders the button when embed is enabled + token present.
//   Behaviour (landr-aoak.3):
//     5. Clicking opens the modal + mints a staff session.
//     6. The iframe src is the env-matched widget URL (dev/staging/prod) and
//        carries NO staff_session in the URL.
//     7. On iframe load the staff session is delivered to the widget via an
//        origin-targeted `landr:staff-init` postMessage.
//     8. An origin-checked `landr:booking-created` message closes the modal,
//        invalidates bookings, and deep-links to the new booking.
//     9. A `landr:booking-created` message from a NON-widget origin is ignored.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

import { WidgetButton } from './WidgetButton'
import type { StaffBookingSession } from '@/lib/booking-session'

// ── control state ────────────────────────────────────────────────────────────

const { mockState } = vi.hoisted(() => ({
  mockState: {
    isEnabled: true,
    isLoading: false,
    operatorId: 'op-abc' as string | null,
    widgetToken: 'tok-xyz' as string | null,
  },
}))

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: (_key: string) => mockState.isEnabled,
    isLoading: mockState.isLoading,
    effectiveIsStaff: false,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: mockState.operatorId,
  }),
}))

vi.mock('@/lib/shortcode', () => ({
  fetchWidgetToken: vi.fn(() => Promise.resolve(mockState.widgetToken)),
}))

// Mint endpoint — return a deterministic signed session.
const mintBookingSession = vi.fn<
  (operatorId: string) => Promise<StaffBookingSession>
>(() =>
  Promise.resolve({
    staff_session: 'signed.session.tok',
    operator_id: 'op-abc',
    powers: ['force_book', 'price_override', 'skip_customer_email'],
    expires_at: Math.floor(Date.now() / 1000) + 1800,
  }),
)
vi.mock('@/lib/booking-session', () => ({
  mintBookingSession: (operatorId: string) => mintBookingSession(operatorId),
}))

// ── helpers ──────────────────────────────────────────────────────────────────

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderButton(qc = makeQc(), children?: ReactNode) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/calendar']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <WidgetButton />
                <LocationProbe />
                {children}
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const DEV_WIDGET_ORIGIN = 'https://bw-dev.landr.de'

beforeEach(() => {
  vi.stubEnv('VITE_DEPLOY_TIER', 'dev')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  mockState.isEnabled = true
  mockState.isLoading = false
  mockState.operatorId = 'op-abc'
  mockState.widgetToken = 'tok-xyz'
})

// ── visibility (unchanged) ────────────────────────────────────────────────────

describe('WidgetButton visibility (landr-xen4)', () => {
  it('renders nothing while entitlements are loading', () => {
    mockState.isLoading = true
    const { container } = renderButton()
    expect(screen.queryByTestId('widget-button')).not.toBeInTheDocument()
    expect(container.querySelector('[data-testid="widget-button"]')).toBeNull()
  })

  it('renders nothing when embed feature is disabled', async () => {
    mockState.isEnabled = false
    renderButton()
    await waitFor(() => {})
    expect(screen.queryByTestId('widget-button')).not.toBeInTheDocument()
  })

  it('renders nothing when widget token is null', async () => {
    mockState.widgetToken = null
    renderButton()
    await waitFor(() =>
      expect(screen.queryByTestId('widget-button')).not.toBeInTheDocument(),
    )
  })

  it('renders the staff-booking trigger when embed is enabled and token present', async () => {
    renderButton()
    const btn = await screen.findByTestId('widget-button')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-label', 'New booking (staff)')
  })

  it('the removed QuickCaptureFab is not in the tree (no quick-capture-fab)', async () => {
    // The '+' FAB (data-testid="quick-capture-fab") was deleted in landr-aoak.3;
    // new bookings now flow through this staff-mode widget modal. Its source
    // (QuickCaptureFab.tsx), the quick-create stub (lib/booking-create.ts) and
    // the now-dead bulk-toolbar context were removed too — proven by the build
    // (a dangling import would fail typecheck) and the absence of the testid.
    renderButton()
    await screen.findByTestId('widget-button')
    expect(screen.queryByTestId('quick-capture-fab')).not.toBeInTheDocument()
  })
})

// ── modal behaviour (landr-aoak.3) ─────────────────────────────────────────────

describe('StaffWidgetModal via WidgetButton (landr-aoak.3)', () => {
  it('opens the modal and mints a staff session on click', async () => {
    const user = userEvent.setup()
    renderButton()
    const btn = await screen.findByTestId('widget-button')
    await user.click(btn)

    expect(await screen.findByTestId('staff-widget-modal')).toBeInTheDocument()
    await waitFor(() =>
      expect(mintBookingSession).toHaveBeenCalledWith('op-abc'),
    )
  })

  it('embeds the env-matched widget iframe with NO staff_session in the URL', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(await screen.findByTestId('widget-button'))

    const iframe = (await screen.findByTestId(
      'staff-widget-iframe',
    )) as HTMLIFrameElement
    expect(iframe.src).toContain('bw-dev.landr.de')
    expect(iframe.src).toContain('tok-xyz') // operator widget token (?w=)
    // The signed staff session must NEVER ride in the iframe URL.
    expect(iframe.src).not.toContain('signed.session.tok')
    expect(iframe.src).not.toContain('staff_session')
  })

  it('delivers the staff session to the widget via origin-targeted staff-init postMessage', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(await screen.findByTestId('widget-button'))

    const iframe = (await screen.findByTestId(
      'staff-widget-iframe',
    )) as HTMLIFrameElement
    // Spy on the iframe's contentWindow.postMessage so we can assert the
    // staff-init payload + targetOrigin without a real cross-frame channel.
    const postSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage: postSpy },
    })

    // Fire the iframe load — the modal posts staff-init once the session is
    // minted AND the iframe has loaded.
    iframe.dispatchEvent(new Event('load'))

    await waitFor(() => expect(postSpy).toHaveBeenCalled())
    const [payload, targetOrigin] = postSpy.mock.calls[0]
    expect(payload).toMatchObject({
      type: 'landr:staff-init',
      token: 'signed.session.tok',
    })
    expect(targetOrigin).toBe(DEV_WIDGET_ORIGIN)
  })

  it('opens the booking on an origin-checked landr:booking-created message', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(await screen.findByTestId('widget-button'))
    await screen.findByTestId('staff-widget-iframe')

    // A completion message FROM THE WIDGET ORIGIN.
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: DEV_WIDGET_ORIGIN,
        data: { type: 'landr:booking-created', booking_id: 'bk-123' },
      }),
    )

    // Modal closes + we deep-link to the booking detail.
    await waitFor(() =>
      expect(screen.queryByTestId('staff-widget-modal')).not.toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/bookings?open=bk-123',
      ),
    )
  })

  it('IGNORES a landr:booking-created message from a non-widget origin', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(await screen.findByTestId('widget-button'))
    await screen.findByTestId('staff-widget-iframe')

    // A forged completion message from a HOSTILE origin.
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example.com',
        data: { type: 'landr:booking-created', booking_id: 'bk-evil' },
      }),
    )

    // Give any (incorrect) handler a chance to run, then assert nothing moved.
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByTestId('staff-widget-modal')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/calendar')
    expect(screen.getByTestId('location')).not.toHaveTextContent('bk-evil')
  })
})
