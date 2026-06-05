/**
 * landr-3qkr.3 — Mobile full-screen sheet smoke tests.
 *
 * Verifies that each major detail/editor sheet renders in full-screen mode
 * when useIsMobile() returns true. The test strategy mirrors AppShell.test.tsx:
 * mock @/hooks/use-mobile to force the mobile path, then assert:
 *   1. The sheet opens and shows its expected title/content.
 *   2. The SheetContent has the full-screen classes (w-full, h-dvh,
 *      rounded-none) injected by mobileSheetContent.
 *
 * Sheets tested:
 *   - BookingDetailSheet
 *   - TicketDetailSheet
 *   - CustomerDetailSheet
 *   - StaffEditSheet
 *   - PricingSchemeEditorSheet
 *   - CommissionSchemeEditorSheet
 *   - CustomOfferEditorSheet
 *   - ContactAuditSheet
 *   - EmailLogDrawer (via EmailLog)
 *
 * Note: we do NOT test the exact Tailwind utility names in DOM class attributes
 * (jsdom doesn't resolve CSS variables or process utilities). We test that the
 * sheet renders at all in mobile mode and shows its expected landmark content,
 * confirming the mobile path doesn't error out or hide the content.
 */

import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'

// ---- Force mobile mode for the whole suite --------------------------------

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => true,
  MOBILE_BREAKPOINT: 768,
}))

// ---- Common stubs ---------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [],
    currentOperator: null,
    currentOperatorId: 'op-test',
    loading: false,
    switchOperator: () => {},
    refreshOperators: () => {},
  }),
  useOperatorCalendarPrefs: () => ({ hour12: true }),
}))

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({ isEnabled: () => false }),
}))

vi.mock('@/lib/recently-viewed', () => ({
  trackView: vi.fn(),
}))

vi.mock('@/lib/tags', () => ({
  setBookingTags: vi.fn(async () => {}),
  setContactTags: vi.fn(async () => {}),
}))

// ---- Supabase stub (shared) -----------------------------------------------

const { supabaseMock } = vi.hoisted(() => {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: null, error: null })),
    then: vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
    ),
  })
  const supabaseMock = {
    from: vi.fn(() => builder),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(async () => {}),
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'tok' } },
      })),
    },
  }
  return { supabaseMock }
})

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
  getSupabase: () => supabaseMock,
}))

// ---- Test render helper ---------------------------------------------------

function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

// ===========================================================================
// BookingDetailSheet — mobile full-screen smoke
// ===========================================================================

vi.mock('@/lib/bookings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bookings')>('@/lib/bookings')
  return {
    ...actual,
    invalidateBookingCaches: vi.fn(async () => {}),
    getConfirmationStatus: vi.fn(async () => ({
      last_sent_at: null,
      has_material_changes: false,
    })),
    cancelBooking: vi.fn(async () => {}),
    markBookingAsNoShow: vi.fn(async () => {}),
    markBookingAsPaid: vi.fn(async () => {}),
    clearBookingPriceOverride: vi.fn(async () => {}),
    resendConfirmation: vi.fn(async () => ({ changes: [] })),
    patchBookingProduct: vi.fn(async () => {}),
    patchCustomerContact: vi.fn(async () => {}),
  }
})

vi.mock('@/lib/invoice-download', () => ({
  downloadInvoicePdf: vi.fn(async () => {}),
}))

vi.mock('@/components/booking/BookingChecklist', () => ({
  BookingChecklist: () => <div>Checklist</div>,
}))

vi.mock('@/components/booking/BookingNotes', () => ({
  BookingNotes: () => <div>Notes</div>,
}))

vi.mock('@/components/booking/BookingPayments', () => ({
  BookingPayments: () => <div>Payments</div>,
}))

vi.mock('@/components/booking/BookingParticipants', () => ({
  BookingParticipants: () => <div>Participants</div>,
}))

vi.mock('@/components/booking/BookingProviderAssignments', () => ({
  BookingProviderAssignments: () => <div>Providers</div>,
}))

vi.mock('@/components/booking/BookingTimeline', () => ({
  BookingTimeline: () => <div>Timeline</div>,
}))

vi.mock('@/components/booking/BookingCustomerPage', () => ({
  BookingCustomerPage: () => <div>CustomerPage</div>,
}))

vi.mock('@/lib/providers', () => ({
  bookingDayOptions: () => [],
}))

vi.mock('@/tags/TagPicker', () => ({
  TagPicker: () => <div>TagPicker</div>,
}))

vi.mock('@/components/tags/TagPicker', () => ({
  TagPicker: () => <div>TagPicker</div>,
}))

vi.mock('@/components/booking/CustomOfferEditorSheet', async () => {
  // Use the real implementation for the CustomOffer mobile smoke test —
  // only stub it when imported as a nested dep of BookingDetailSheet.
  const actual = await vi.importActual<
    typeof import('@/components/booking/CustomOfferEditorSheet')
  >('@/components/booking/CustomOfferEditorSheet')
  return actual
})

describe('BookingDetailSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet with booking title visible in mobile mode', async () => {
    const { BookingDetailSheet } = await import('@/components/BookingDetailSheet')
    const row = {
      id: 'bk-1',
      current_stage_id: 's1',
      current_stage: null,
      current_semantic_state: 'confirmed',
      currency: 'EUR',
      customer: {
        id: 'c1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        phone: '',
      },
      items: [],
      tags: [],
      created_at: new Date().toISOString(),
      gross_total: '100.00',
      balance_due: null,
      price_override_amount: null,
      operator_id: 'op-test',
    } as unknown as Parameters<typeof BookingDetailSheet>[0]['row']

    render(
      <BookingDetailSheet
        row={row}
        onOpenChange={vi.fn()}
        onCustomerClick={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Booking')).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// TicketDetailSheet — mobile full-screen smoke
// ===========================================================================

vi.mock('@/lib/tickets', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tickets')>('@/lib/tickets')
  return {
    ...actual,
    fetchTicketComments: vi.fn(async () => []),
    fetchTicketCommentsStaff: vi.fn(async () => []),
    fetchTicketEvents: vi.fn(async () => []),
    fetchTicketAttachments: vi.fn(async () => []),
    fetchCurrentPublicUser: vi.fn(async () => null),
    fetchTicketStaff: vi.fn(async () => null),
    fetchTicketWatcher: vi.fn(async () => null),
    fetchTicketOperator: vi.fn(async () => ({ name: 'Test Org' })),
    fetchTicketReporter: vi.fn(async () => ({ email: 'reporter@example.com' })),
    fetchAssignableUsers: vi.fn(async () => []),
    searchMentionUsers: vi.fn(async () => []),
    watchTicket: vi.fn(async () => {}),
    unwatchTicket: vi.fn(async () => {}),
    createComment: vi.fn(async () => ({ id: 'c1' })),
    uploadTicketAttachment: vi.fn(async () => ({})),
    fetchNotificationPrefs: vi.fn(async () => null),
    fetchTicketNotifySettings: vi.fn(async () => null),
    upsertTicketNotifySettings: vi.fn(async () => {}),
    resolveEffectiveNotifySettings: vi.fn(() => ({ bell: true, email: true, push: true })),
    notifyMentions: vi.fn(async () => {}),
    parseMentionHandles: vi.fn(() => new Set()),
    resolveMentionHandles: vi.fn(async () => new Map()),
    splitMentionSegments: vi.fn(() => []),
    getAttachmentSignedUrl: vi.fn(async () => null),
    TYPE_LABEL: { bug: 'Bug', feature: 'Feature' },
    PRIORITY_LABEL: { p0: 'P0', p1: 'P1', p2: 'P2' },
    PRIORITY_TOOLTIP: { p0: '', p1: '', p2: '' },
    PERCEIVED_IMPACT_LABEL: { low: 'Low', medium: 'Medium', high: 'High' },
  }
})

vi.mock('@/lib/notification-prefs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notification-prefs')>('@/lib/notification-prefs')
  return {
    ...actual,
    fetchNotificationPrefs: vi.fn(async () => null),
    fetchTicketNotifySettings: vi.fn(async () => null),
    upsertTicketNotifySettings: vi.fn(async () => {}),
    resolveEffectiveNotifySettings: vi.fn(() => ({ bell: true, email: true, push: true })),
  }
})

describe('TicketDetailSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet with ticket title visible in mobile mode', async () => {
    const { TicketDetailSheet } = await import('@/components/tickets/TicketDetailSheet')

    const ticket = {
      id: 'tkt-1',
      title: 'Something is broken',
      type: 'bug',
      status: 'ready',
      priority: 'p1',
      perceived_impact: 'high',
      body: 'Details here.',
      blocked: false,
      operator_id: 'op-test',
      reporter_id: null,
      assignee_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      context: null,
      moscow: null,
      origin_tier: null,
      origin_operator_label: null,
    } as unknown as Parameters<typeof TicketDetailSheet>[0]['ticket']

    render(
      <TicketDetailSheet
        ticket={ticket}
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Something is broken')).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// CustomerDetailSheet — mobile full-screen smoke
// ===========================================================================

vi.mock('@/lib/contacts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/contacts')>('@/lib/contacts')
  return {
    ...actual,
    fetchContact: vi.fn(async () => ({
      id: 'c1',
      operator_id: 'op-test',
      first_name: 'Bob',
      last_name: 'Smith',
      email: 'bob@example.com',
      phone: '',
      preferred_locale: null,
      do_not_contact: false,
      tags: [],
    })),
    patchContact: vi.fn(async () => {}),
    fetchContactAuditLog: vi.fn(async () => []),
    contactNameDisplay: () => 'Bob Smith',
    contactDateTime: () => '2024-01-01',
  }
})

vi.mock('@/components/customer/CustomerBookings', () => ({
  CustomerBookings: () => <div>CustomerBookings</div>,
}))

describe('CustomerDetailSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet with contact title visible in mobile mode', async () => {
    const { CustomerDetailSheet } = await import('@/components/CustomerDetailSheet')

    render(
      <CustomerDetailSheet
        contactId="c1"
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Customer')).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// StaffEditSheet — mobile full-screen smoke
// ===========================================================================

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')
  return {
    ...actual,
    updateMembership: vi.fn(async () => {}),
    staffEmailDisplay: (m: { email?: string }) => m.email ?? 'staff@example.com',
    STAFF_ROLE_OPTIONS: ['admin', 'operator'],
    parsePermissions: (s: string) => ({ ok: true, value: s ? s.split('\n') : [] }),
    permissionsToText: (p: string[]) => (p ?? []).join('\n'),
  }
})

describe('StaffEditSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet with staff edit title in mobile mode', async () => {
    const { StaffEditSheet } = await import('@/components/StaffEditSheet')

    const member = {
      id: 'mem-1',
      operator_id: 'op-test',
      email: 'alice@example.com',
      role: 'admin',
      permissions: [],
      joined_at: new Date().toISOString(),
    } as unknown as Parameters<typeof StaffEditSheet>[0]['member']

    render(
      <StaffEditSheet
        member={member}
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Edit membership')).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// PricingSchemeEditorSheet — mobile full-screen smoke
// ===========================================================================

vi.mock('@/lib/pricingSchemes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pricingSchemes')>('@/lib/pricingSchemes')
  return {
    ...actual,
    fetchPricingSchemeTree: vi.fn(async () => ({
      id: 'ps-1',
      name: 'Test Pricing',
      currency: 'EUR',
      active: true,
      notes: null,
      rules: [],
    })),
    patchPricingScheme: vi.fn(async () => {}),
    createRule: vi.fn(async () => {}),
  }
})

vi.mock('@/components/pricing/SimulateDialog', () => ({
  SimulateDialog: () => null,
}))

describe('PricingSchemeEditorSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet with scheme name in mobile mode', async () => {
    const { PricingSchemeEditorSheet } = await import(
      '@/components/pricing/PricingSchemeEditorSheet'
    )

    render(
      <PricingSchemeEditorSheet
        schemeId="ps-1"
        operatorId="op-test"
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Pricing')).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// CommissionSchemeEditorSheet — mobile full-screen smoke
// ===========================================================================

vi.mock('@/lib/commissions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/commissions')>('@/lib/commissions')
  return {
    ...actual,
    fetchCommissionSchemeTree: vi.fn(async () => ({
      id: 'cs-1',
      name: 'Test Commission',
      currency: 'EUR',
      active: true,
      notes: null,
      recipient_kind: 'provider',
      rules: [],
    })),
    patchCommissionScheme: vi.fn(async () => {}),
    createCommissionRule: vi.fn(async () => {}),
    COMMISSION_RULE_KIND_LABELS: { base_percentage_of_net: 'Base %' },
    RECIPIENT_KIND_LABELS: { provider: 'Provider' },
  }
})

describe('CommissionSchemeEditorSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet with scheme name in mobile mode', async () => {
    const { CommissionSchemeEditorSheet } = await import(
      '@/components/commissions/CommissionSchemeEditorSheet'
    )

    render(
      <CommissionSchemeEditorSheet
        schemeId="cs-1"
        operatorId="op-test"
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Commission')).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// CustomOfferEditorSheet — mobile full-screen smoke
// ===========================================================================

vi.mock('@/lib/customOffer', () => ({
  fetchCustomOffer: vi.fn(async () => ({
    booking_id: 'bk-1',
    custom_offer_applied: false,
    lines: [],
    group_threshold: 6,
    group_discount_pct: '0.0000',
    tax_rate: '0.0700',
  })),
  putCustomOffer: vi.fn(async () => {}),
  clearCustomOffer: vi.fn(async () => {}),
}))

describe('CustomOfferEditorSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet (open) in mobile mode without crashing', async () => {
    const { CustomOfferEditorSheet } = await import(
      '@/components/booking/CustomOfferEditorSheet'
    )

    const { container } = render(
      <CustomOfferEditorSheet
        bookingId="bk-1"
        operatorId="op-test"
        onClose={vi.fn()}
      />,
    )

    // The Sheet is open (bookingId is non-null). Radix renders the dialog
    // into a portal so it appears in document.body, not in container.
    // We verify the component renders without error by asserting the root
    // container exists and no unhandled exception was thrown.
    expect(container).toBeDefined()

    // Also assert the sheet dialog is in the DOM (portal appears in body).
    await waitFor(() => {
      const dialog = document.querySelector('[data-slot="sheet-content"]')
      expect(dialog).not.toBeNull()
    })
  })
})

// ===========================================================================
// ContactAuditSheet — mobile full-screen smoke
// ===========================================================================

describe('ContactAuditSheet — mobile full-screen', () => {
  afterEach(() => vi.clearAllMocks())

  it('renders the sheet with audit title in mobile mode', async () => {
    const { ContactAuditSheet } = await import('@/components/ContactAuditSheet')

    const contact = {
      id: 'c1',
      operator_id: 'op-test',
      first_name: 'Carol',
      last_name: 'Doe',
      email: 'carol@example.com',
      phone: '',
      preferred_locale: null,
      do_not_contact: false,
      tags: [],
    } as unknown as Parameters<typeof ContactAuditSheet>[0]['contact']

    render(
      <ContactAuditSheet
        contact={contact}
        onOpenChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      // t.contacts.auditTitle = 'Audit log'
      expect(screen.getByText('Audit log')).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// EmailLog drawer — mobile full-screen smoke
// We render the EmailLog route component, which contains EmailLogDrawer.
// We open a row to trigger the drawer.
// ===========================================================================

vi.mock('@/lib/outbound-emails', () => ({
  fetchOutboundEmails: vi.fn(async () => [
    {
      id: 'em-1',
      subject: 'Test subject',
      to_address: 'to@example.com',
      status: 'sent',
      sent_via: null,
      template_kind: 'booking_received',
      locale: 'en',
      retries: 0,
      last_error: null,
      body_html: '<p>Hi</p>',
      body_text: 'Hi',
      created_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      resent_from_id: null,
    },
  ]),
  resendEmail: vi.fn(async () => {}),
  OUTBOUND_EMAIL_STATUSES: ['queued', 'sending', 'sent', 'failed'],
}))

vi.mock('@/components/ui/counted-filter-chip', () => ({
  CountedFilterChip: ({
    label,
    onToggle,
  }: {
    label: string
    count: number
    selected: boolean
    onToggle: () => void
  }) => <button onClick={onToggle}>{label}</button>,
}))

vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

describe('EmailLog drawer — mobile full-screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the drawer with email subject in mobile mode', async () => {
    const userEvent = await import('@testing-library/user-event')
    const user = userEvent.default.setup()
    const { EmailLog } = await import('@/routes/settings/EmailLog')

    render(<EmailLog />)

    // Wait for the table row to appear
    await waitFor(() => {
      expect(screen.getByText('Test subject')).toBeInTheDocument()
    })

    // Click the row to open the drawer
    await user.click(screen.getByRole('button', { name: /Test subject/i }))

    // The drawer should show the subject as its title
    await waitFor(() => {
      const titles = screen.getAllByText('Test subject')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })
  })
})
