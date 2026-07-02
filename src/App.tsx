import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
// landr-mhhq — code-split the heavy routes off the initial bundle:
//   - /analytics pulls recharts + 5 analytics chart components
//   - /views/:viewId pulls fullcalendar (+timegrid +daygrid
//     +interaction) and @dnd-kit via CalendarLayout / BoardLayout
//   - /views and /views/new ride along so the whole Views family
//     lives in its own chunk.
//   - /audit (landr-aref) is operator-rare (fraud/dispute lookups)
//     so it rides the same lazy pattern to avoid weighing down the
//     initial bundle for everyone.
// AuthCallback / Login / Dashboard / Bookings / Calendar / etc stay
// eagerly imported because the operator hits them within seconds of
// landing and the network round-trip would feel laggier than the
// extra bytes save.
const Analytics = lazy(() => import('@/routes/Analytics'))
const Audit = lazy(() => import('@/routes/Audit'))
// landr-4pn1 — /trash (recently-deleted bin). Operator-rare surface (only
// visited to undo an accidental delete); lazy so it doesn't weigh down the
// initial bundle.
const Trash = lazy(() => import('@/routes/Trash'))
const ViewPage = lazy(() => import('@/routes/ViewPage'))
const ViewsIndex = lazy(() => import('@/routes/ViewsIndex'))
const ViewsNew = lazy(() => import('@/routes/ViewsNew'))
// landr-wwhn.11 — /tickets kanban board. Lazy-loaded because it carries
// @dnd-kit and is not on the immediate landing path.
const TicketBoard = lazy(() => import('@/routes/TicketBoard'))
// landr-wwhn.23 — /tickets/planning MoSCoW release-planning overlay.
// Lazy-loaded (staff-facing planning surface, not on the daily operator path).
const TicketPlanning = lazy(() => import('@/routes/TicketPlanning'))
// landr-znzz.8 — /retrieve operator retrieve board (per-day check-ins +
// pickup workflow). Field surface for guides; lazy-loaded since it's a
// per-activity-day view, not on the immediate landing path.
const RetrieveBoard = lazy(() => import('@/routes/RetrieveBoard'))
// landr-sbhz.8 — owner revenue overview (staff-only, staff-rare). Lazy so it
// stays off the operator-facing initial bundle.
const Revenue = lazy(() => import('@/routes/Revenue'))
// landr-wwhn.28 — feedback inbox (staff-only, triage surface). Lazy so it
// stays off the operator-facing initial bundle.
const FeedbackInbox = lazy(() => import('@/routes/FeedbackInbox'))
// landr-a99u.6 — release promotion console (staff-only, staff-rare). Lazy so
// it stays off the operator-facing initial bundle.
const Release = lazy(() => import('@/routes/Release'))
// landr-7dya.10 — full-screen ticket-system app-view shell. Staff-only,
// off the operator initial bundle (operators never reach it).
const TicketSystemShell = lazy(() => import('@/components/TicketSystemShell'))
import { AuthCallback } from '@/routes/AuthCallback'
import { ForgotPassword } from '@/routes/ForgotPassword'
import { ResetPassword } from '@/routes/ResetPassword'
import { Bookings } from '@/routes/Bookings'
import { Calendar } from '@/routes/Calendar'
import { Contacts } from '@/routes/Contacts'
import { Dashboard } from '@/routes/Dashboard'
// landr-a4pl.2 — /invoicing: Holded invoice transfer status + manual Sync-now.
import { Invoicing } from '@/routes/Invoicing'
import { GeneralApprovals } from '@/routes/GeneralApprovals'
import { NotFound } from '@/routes/NotFound'
import { Login } from '@/routes/Login'
import { Onboarding } from '@/routes/Onboarding'
import { Products } from '@/routes/Products'
import { Reporting } from '@/routes/Reporting'
import { Schedule } from '@/routes/Schedule'
import { Staff } from '@/routes/Staff'
import { EmailTemplates } from '@/routes/EmailTemplates'
import { PickupLocations } from '@/routes/PickupLocations'
import { Hotels } from '@/routes/Hotels'
import { Providers } from '@/routes/Providers'
import { SettingsLayout } from '@/routes/SettingsLayout'
import { landingPathFor } from '@/components/settings/sections'
import { BrandingSettings } from '@/routes/settings/BrandingSettings'
import { WidgetSettings } from '@/routes/settings/WidgetSettings'
import { CompanySettings } from '@/routes/settings/CompanySettings'
import { CalendarDisplaySettings } from '@/routes/settings/CalendarDisplaySettings'
import { DisplayPreferencesSettings } from '@/routes/settings/DisplayPreferencesSettings'
import { IntegrationsCalendarSettings } from '@/routes/settings/IntegrationsCalendarSettings'
import { EmailSenderSettings } from '@/routes/settings/EmailSenderSettings'
import { IntegrationsPaymentsSettings } from '@/routes/settings/IntegrationsPaymentsSettings'
import { ConnectedAccountsSettings } from '@/routes/settings/ConnectedAccountsSettings'
import { SecuritySettings } from '@/routes/settings/SecuritySettings'
import { EmailLog } from '@/routes/settings/EmailLog'
import { PlanSettings } from '@/routes/settings/PlanSettings'
import { CampaignsSettings } from '@/routes/settings/CampaignsSettings'
import { PricingSettings } from '@/routes/settings/PricingSettings'
import { CommissionsSettings } from '@/routes/settings/CommissionsSettings'
import { TagsSettings } from '@/routes/settings/TagsSettings'
import { ServiceRolesSettings } from '@/routes/settings/ServiceRolesSettings'
import { VouchersSettings } from '@/routes/settings/VouchersSettings'
import { CategoriesSettings } from '@/routes/settings/CategoriesSettings'
import { OffersSettings } from '@/routes/settings/OffersSettings'
import { EmbedSettings } from '@/routes/settings/EmbedSettings'
import { NotificationPrefsSettings } from '@/routes/settings/NotificationPrefsSettings'
import { AccountLinkSettings } from '@/routes/settings/AccountLinkSettings'
import { DeclarationsSettings } from '@/routes/settings/DeclarationsSettings'
import { OperationsSettings } from '@/routes/settings/OperationsSettings'
import { WebhooksSettings } from '@/routes/settings/WebhooksSettings'
// landr-71kz.5 — Settings → Forms library (CRUD).
import { FormsSettings } from '@/routes/settings/FormsSettings'
// landr-71kz.6 — full field-builder editor replacing the stub.
import { FormEditor } from '@/routes/settings/FormEditor'
// landr-znzz.7 — Settings → Weather (opt-in forecast hint).
import { WeatherSettings } from '@/routes/settings/WeatherSettings'
// landr-sbhz.5 — staff-only tier/feature editor. Lazy: only Landr staff ever
// reach it, so it has no place on the operator initial bundle.
const TierSettings = lazy(() => import('@/routes/settings/TierSettings'))
import { AuthProvider } from '@/lib/auth'
import { OperatorProvider } from '@/lib/operator'
import { EntitlementsProvider, useEntitlements } from '@/lib/entitlements'
import { featureForRoute, featureForSection } from '@/lib/entitlements-map'
import { ProtectedRoute } from '@/lib/ProtectedRoute'
import { ThemeProvider } from '@/lib/theme'
import { AppModeProvider } from '@/lib/app-mode-context'
import { TICKET_SYSTEM_PATH } from '@/lib/app-mode'
import { AppShell } from '@/components/AppShell'
import { TicketSystemGate } from '@/components/TicketSystemGate'
import { OnboardingGuard } from '@/components/OnboardingGuard'
import { RouteFallback } from '@/components/RouteFallback'
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary'
import { Toaster } from '@/components/ui/sonner'

// landr-sydf — preserve /products/:productId deep links by forwarding the
// captured productId param to the new /settings/products/:productId path.
// A plain <Navigate to="/settings/products" /> would lose the param and
// land on the auto-selected first product.
function ProductsRedirect() {
  const { productId } = useParams<{ productId?: string }>()
  return (
    <Navigate
      to={productId ? `/settings/products/${productId}` : '/settings/products'}
      replace
    />
  )
}

// landr-e8jf — preserve /schedule bookmarks AND the landr-3uai Calendar
// capacity pill navigation, which jumps to /schedule?date=...&product=...
// when the operator clicks a pill. A plain `<Navigate to="/settings/schedule" />`
// drops the query string; this wrapper carries `search` through so the
// Schedule page still receives the date + product preselection.
function ScheduleRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/settings/schedule${search}`} replace />
}

// landr-gka7 — /settings (the hub root) and /account (the Account
// virtual top-level) both need a Navigate target that tracks the
// section lists in sections.ts. Hard-coding /settings/company landed
// users on the first ACCOUNT_SECTIONS entry no matter which group they
// clicked, so the bottom-left Settings gear briefly showed the Account
// sub-sidebar before the user re-navigated. Routing the index through
// landingPathFor() keeps this in sync as the section lists are reordered
// and ensures /settings actually lands on a SETTINGS section.
function SettingsIndexRedirect() {
  return <Navigate to={landingPathFor('settings')} replace />
}

function AccountIndexRedirect() {
  return <Navigate to={landingPathFor('account')} replace />
}

// landr-7dya.10 — padded, scrollable pane for the ticket-system BOARD/PLANNING
// surfaces. The inbox surface is a full-height split-pane and is rendered
// full-bleed (no wrapper); the board + planning are ordinary scrolling content
// (flex-col gap-6) so they get a padded scroll container here. Keeps the
// TicketSystemShell host a bare sized box (one place owns the scroll model).
function TicketSurfacePane({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
  )
}

// landr-sbhz.6 — guard a route by its effective-entitlement feature. When the
// feature is DISABLED for the current operator (and the user isn't Landr
// staff), the route is unreachable: we redirect to the dashboard home rather
// than rendering the page (defence against deep links / bookmarks to a module
// the tier doesn't include). While entitlements are still resolving we render
// the children — see useEntitlements.isEnabled for the loading rationale.
function FeatureGate({
  feature,
  children,
}: {
  feature: string
  children: ReactNode
}) {
  const { isEnabled } = useEntitlements()
  if (!isEnabled(feature)) return <Navigate to="/" replace />
  return <>{children}</>
}

// Wrap a route element in a FeatureGate if a feature key gates its path; pass
// it through untouched otherwise. Keeps the route table below declarative.
function gatedRoute(path: string, element: ReactNode): ReactNode {
  const feature = featureForRoute(path)
  if (!feature) return element
  return <FeatureGate feature={feature}>{element}</FeatureGate>
}

function gatedSection(to: string, element: ReactNode): ReactNode {
  const feature = featureForSection(to)
  if (!feature) return element
  return <FeatureGate feature={feature}>{element}</FeatureGate>
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OperatorProvider>
          <EntitlementsProvider>
          {/* landr-7dya.10 — top-level app-mode context (single-operator ·
              view-as · ticket-system). Lives above the chrome split so both
              the operator AppShell and the full-screen ticket-system shell
              read the same mode + staff capability state. */}
          <AppModeProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* landr — public forgot/reset-password pages. Reachable while
                logged out; /reset-password carries the Supabase recovery
                session established from the emailed link. */}
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/onboarding/start"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <OnboardingGuard>
                    <AppShell>
                      {/* landr-a99u — RouteErrorBoundary wraps the Suspense
                          so a single route's render crash turns into a
                          "Something went wrong" card (with the error captured
                          in ErrorHistoryBell) rather than blacking out the
                          whole dashboard. Resets on navigation via key=pathname. */}
                      <RouteErrorBoundary>
                        {/* landr-mhhq — Suspense boundary catches all
                            lazy-loaded route chunks (Analytics +
                            /views family today) so the AppShell chrome
                            stays mounted while the chunk streams in. */}
                        <Suspense fallback={<RouteFallback />}>
                          <Outlet />
                        </Suspense>
                      </RouteErrorBoundary>
                    </AppShell>
                  </OnboardingGuard>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              {/* landr-v0xg — Views (saved-view system, Phase 1).
                  /views/new materialises a new Personal View (blank
                  Untitled, or from ?from=template:<key>) then replaces
                  navigation to /views/:newId. */}
              <Route path="/views" element={<ViewsIndex />} />
              <Route path="/views/new" element={<ViewsNew />} />
              <Route path="/views/:viewId" element={<ViewPage />} />
              <Route path="/bookings" element={gatedRoute('/bookings', <Bookings />)} />
              <Route path="/calendar" element={gatedRoute('/calendar', <Calendar />)} />
              {/* landr-af6c — Analytics dashboard. Sits between Calendar
                  and Contacts in the sidebar (operational-insight surface
                  next to the day-to-day surfaces). */}
              <Route path="/analytics" element={gatedRoute('/analytics', <Analytics />)} />
              <Route path="/contacts" element={gatedRoute('/contacts', <Contacts />)} />
              <Route path="/reporting" element={gatedRoute('/reporting', <Reporting />)} />
              {/* landr-a4pl.2 — Invoicing (Holded transfer status + manual
                  Sync-now). Operator-rare finance surface, ungated (operational
                  tooling, not in the feature registry — like /audit and /trash). */}
              <Route path="/invoicing" element={<Invoicing />} />
              {/* landr-aref — /audit (audit_log viewer). Tenant-scoped via
                  RLS on audit_log; landr staff see cross-tenant rows for
                  fraud/dispute investigation per the existing policy. */}
              <Route path="/audit" element={gatedRoute('/audit', <Audit />)} />
              {/* landr-4pn1 — /trash (recently-deleted bin per category). */}
              <Route path="/trash" element={<Trash />} />
              {/* Email log — a LOG, not a setting: standalone admin surface
                  (moved out of /settings per ok). Gated by the email_log feature. */}
              <Route path="/email-log" element={gatedRoute('/email-log', <EmailLog />)} />
              <Route path="/approvals/general" element={<GeneralApprovals />} />
              {/* landr-wwhn.11 — Ticket board (5-column kanban, realtime). */}
              <Route path="/tickets" element={gatedRoute('/tickets', <TicketBoard />)} />
              {/* landr-wwhn.23 — MoSCoW release-planning overlay. */}
              <Route path="/tickets/planning" element={gatedRoute('/tickets/planning', <TicketPlanning />)} />
              {/* landr-znzz.8 — operator retrieve board (per-day check-ins). */}
              <Route path="/retrieve" element={<RetrieveBoard />} />
              {/* landr-sbhz.8 — owner revenue overview (platform commission
                  per operator). STAFF-ONLY: like /audit and Settings → Tiers,
                  it is Landr tooling left out of the tenant entitlement system;
                  Revenue self-redirects non-staff to home and the FastAPI
                  endpoint enforces is_landr_staff with a 403. */}
              <Route path="/revenue" element={<Revenue />} />

              {/* landr-wwhn.28 — cross-operator feedback triage inbox.
                  STAFF-ONLY: self-redirects non-staff to home; DB view is
                  gated on is_landr_staff so zero data leaks to operators. */}
              <Route path="/feedback-inbox" element={<FeedbackInbox />} />

              {/* landr-a99u.6 — release promotion console (dev → staging →
                  main). STAFF-ONLY like /revenue: Release self-redirects
                  non-staff to home, gates each action on the server-computed
                  `viewer` capability block, and the FastAPI endpoints enforce
                  is_landr_staff with a 403. */}
              <Route path="/release" element={<Release />} />

              {/* landr-fzcg — Account hub: user/billing-scoped subsections
                  under /account/*. Same SettingsLayout + sub-sidebar as the
                  Settings hub; groupForPath() maps /account/* to the ACCOUNT
                  group. Pre-launch these moved off /settings/* so the URL
                  matches the "Account" nav (best-practice alignment). */}
              <Route path="/account" element={<SettingsLayout />}>
                <Route index element={<AccountIndexRedirect />} />
                <Route path="company" element={gatedSection('/account/company', <CompanySettings />)} />
                <Route path="connected-accounts" element={<ConnectedAccountsSettings />} />
                {/* landr — Account → Security: set / change password
                    (logged-in). Personal scope; ungated. */}
                <Route path="security" element={<SecuritySettings />} />
                {/* landr — Gmail integration removed (replaced by the SES
                    email-sender). Redirect old links/bookmarks to the successor. */}
                <Route path="integrations/gmail" element={<Navigate to="/account/integrations/email-sender" replace />} />
                {/* landr-resend-sender — per-operator SES sending domain.
                    Ungated: every operator wires up their own sending domain
                    (like payments), so no feature-entitlement gate. */}
                <Route path="integrations/email-sender" element={<EmailSenderSettings />} />
                {/* landr — flat /account/email-sender shorthand (and older
                    "set up branded sending" nudges) redirect to the canonical
                    integrations path so the link never 404s. */}
                <Route
                  path="email-sender"
                  element={<Navigate to="/account/integrations/email-sender" replace />}
                />
                {/* landr-6ybs — per-operator subscribable ICS calendar feed. */}
                <Route path="integrations/calendar" element={gatedSection('/account/integrations/calendar', <IntegrationsCalendarSettings />)} />
                {/* landr-1nwu.2 — per-operator Stripe + Holded credentials.
                    Ungated: operators always need to enter their own payment
                    keys (like connected-accounts), so no feature-entitlement
                    gate. */}
                <Route path="integrations/payments" element={<IntegrationsPaymentsSettings />} />
                <Route path="plan" element={gatedSection('/account/plan', <PlanSettings />)} />
                {/* landr-wwhn.16 — personal notification preferences
                    (bell/email/push + per-ticket overrides). */}
                <Route path="notifications" element={<NotificationPrefsSettings />} />
              </Route>

              {/* Settings hub — left sub-sidebar wraps every subsection. */}
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<SettingsIndexRedirect />} />
                <Route path="calendar-display" element={<CalendarDisplaySettings />} />
                <Route path="display-preferences" element={<DisplayPreferencesSettings />} />
                {/* landr-yp8x — Branding (logo + primary colour shown in
                    the embedded booking widget). */}
                <Route path="branding" element={gatedSection('/settings/branding', <BrandingSettings />)} />
                {/* landr-jb1k — Booking widget (showcased layout variant +
                    category grid columns + title typography). Gated like
                    Branding via widget_config. */}
                <Route path="widget" element={gatedSection('/settings/widget', <WidgetSettings />)} />
                {/* landr-znzz.7 — Weather (opt-in forecast hint for conditions pre-fill). */}
                <Route path="weather" element={<WeatherSettings />} />
                <Route path="team" element={gatedSection('/settings/team', <Staff />)} />
                <Route path="providers" element={gatedSection('/settings/providers', <Providers />)} />
                <Route path="pickup-locations" element={gatedSection('/settings/pickup-locations', <PickupLocations />)} />
                {/* landr-cyoi — Hotels as a first-class settings entity
                    (separate from generic pickup locations). Sits right after
                    Pickup locations in the IA. */}
                <Route path="hotels" element={gatedSection('/settings/hotels', <Hotels />)} />
                {/* landr-sydf — Products lives under Settings now (operators
                    edit rarely, not daily). The :productId variant preserves
                    the landr-i018 deep-link contract used by the PricingSettings
                    'Used by' chips. */}
                <Route path="products" element={gatedSection('/settings/products', <Products />)} />
                <Route path="products/:productId" element={gatedSection('/settings/products', <Products />)} />
                {/* landr-up1b — nested product category tree editor. */}
                <Route path="categories" element={gatedSection('/settings/categories', <CategoriesSettings />)} />
                {/* landr-up1b — booking-widget shortcode/iframe generator. */}
                <Route path="embed" element={gatedSection('/settings/embed', <EmbedSettings />)} />
                {/* landr-71kz.5 — Settings → Forms library (create/rename/retire/
                    restore). Gated behind form_builder feature; the field-builder
                    editor at /settings/forms/:formId ships in landr-71kz.6. */}
                <Route path="forms" element={gatedSection('/settings/forms', <FormsSettings />)} />
                <Route path="forms/:formId" element={gatedSection('/settings/forms', <FormEditor />)} />
                {/* landr-znzz.5 — generic per-operator offers/upsells shown in
                    the AFTER phase of the customer event page. */}
                <Route path="offers" element={<OffersSettings />} />
                {/* landr-e8jf — Schedule lives under Settings now. The
                    capacity pills on the main Calendar (landr-3uai) make
                    Schedule a setup tool, not a daily-ops view. */}
                <Route path="schedule" element={gatedSection('/settings/schedule', <Schedule />)} />
                <Route path="email-templates" element={gatedSection('/settings/email-templates', <EmailTemplates />)} />
                {/* email-log moved to a standalone /email-log admin route (a log
                    is not a setting). See the top-level <Route path="/email-log">. */}
                <Route path="pricing" element={gatedSection('/settings/pricing', <PricingSettings />)} />
                {/* landr-9n0l — Settings → Commissions: scheme/rule/tier
                    editor + read-only agent-earnings report. */}
                <Route path="commissions" element={gatedSection('/settings/commissions', <CommissionsSettings />)} />
                <Route path="tags" element={gatedSection('/settings/tags', <TagsSettings />)} />
                {/* landr-1tqx — Settings → Service roles: operator-scoped
                    participant role catalogue (Pilot/Passenger/Diver…). */}
                <Route
                  path="service-roles"
                  element={<ServiceRolesSettings />}
                />
                {/* landr-sp4r — Settings → Campaigns: operator-scoped
                    marketing campaigns for booking attribution. */}
                <Route path="campaigns" element={gatedSection('/settings/campaigns', <CampaignsSettings />)} />
                {/* landr-v198 — Settings → Vouchers: operator promo-code editor. */}
                <Route path="vouchers" element={gatedSection('/settings/vouchers', <VouchersSettings />)} />
                {/* landr-r87i — Settings → Operations: operator-customisable
                    default booking-checklist items (v2 of landr-84n1). */}
                <Route path="operations" element={<OperationsSettings />} />
                {/* landr-ah9u — Settings → Webhooks: operator-managed event
                    subscriptions (v1 localStorage; v2 server-delivered). */}
                <Route path="webhooks" element={gatedSection('/settings/webhooks', <WebhooksSettings />)} />
                {/* landr-atwy — Settings → Account link prompt: per-operator
                    opt-in for the post-booking "Track in LANDR app" prompt. */}
                <Route path="account-link" element={<AccountLinkSettings />} />
                {/* landr-c53m.14 — Settings → Declarations: per-operator
                    toggle for whether the booking-submit gate requires
                    customers to accept declarations before booking. */}
                <Route path="declarations" element={<DeclarationsSettings />} />
                {/* landr-sbhz.5 — STAFF-ONLY tier/feature editor. Not gated by
                    the tenant entitlement system (like /audit it is Landr
                    tooling); TierSettings self-redirects non-staff to home and
                    RLS makes the writes staff-only. */}
                <Route path="tiers" element={<TierSettings />} />
              </Route>

              {/* Legacy URLs — keep deep-linkable bookmarks working by
                  redirecting into the Settings hub. */}
              <Route path="/staff" element={<Navigate to="/settings/team" replace />} />
              <Route
                path="/pickup-locations"
                element={<Navigate to="/settings/pickup-locations" replace />}
              />
              <Route
                path="/email-templates"
                element={<Navigate to="/settings/email-templates" replace />}
              />
              {/* landr-sydf — preserve /products and /products/:productId
                  bookmarks (landr-i018 'Used by' links, external links). */}
              <Route
                path="/products"
                element={<Navigate to="/settings/products" replace />}
              />
              <Route
                path="/products/:productId"
                element={<ProductsRedirect />}
              />
              {/* landr-e8jf — preserve /schedule bookmarks + the
                  landr-3uai Calendar capacity-pill navigation, which
                  jumps to /schedule?date=...&product=... when clicked.
                  ScheduleRedirect carries the search string through. */}
              <Route path="/schedule" element={<ScheduleRedirect />} />
            </Route>

            {/* landr-7dya.10 — full-screen TICKET-SYSTEM app-view. A SIBLING of
                the operator AppShell group above: it owns its OWN chrome
                (TicketSystemShell) and REPLACES the operator sidebar/topbar
                rather than nesting inside it. STAFF-ONLY (ProtectedRoute auth +
                TicketSystemGate staff/capability gate; the hosted surfaces keep
                their own server-side enforcement). Coexists with the
                operator-chrome /tickets board + /tickets/planning + the
                /feedback-inbox sidebar destinations, all of which stay working.
                The hosted surfaces are the EXISTING route components — this
                unifies them under one workspace, it does not duplicate them. */}
            <Route
              path={TICKET_SYSTEM_PATH}
              element={
                <ProtectedRoute>
                  <TicketSystemGate>
                    <Suspense fallback={<RouteFallback />}>
                      <TicketSystemShell />
                    </Suspense>
                  </TicketSystemGate>
                </ProtectedRoute>
              }
            >
              {/* Inbox is the default surface (ADR 0005 primary workspace). */}
              <Route
                index
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <FeedbackInbox />
                  </Suspense>
                }
              />
              <Route
                path="board"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TicketSurfacePane>
                      <TicketBoard />
                    </TicketSurfacePane>
                  </Suspense>
                }
              />
              <Route
                path="planning"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <TicketSurfacePane>
                      <TicketPlanning />
                    </TicketSurfacePane>
                  </Suspense>
                }
              />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
          </AppModeProvider>
          </EntitlementsProvider>
        </OperatorProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
