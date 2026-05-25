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
import { AuthCallback } from '@/routes/AuthCallback'
import { Bookings } from '@/routes/Bookings'
import { Calendar } from '@/routes/Calendar'
import { Contacts } from '@/routes/Contacts'
import { Dashboard } from '@/routes/Dashboard'
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
import { Providers } from '@/routes/Providers'
import { SettingsLayout } from '@/routes/SettingsLayout'
import { landingPathFor } from '@/components/settings/sections'
import { BrandingSettings } from '@/routes/settings/BrandingSettings'
import { CompanySettings } from '@/routes/settings/CompanySettings'
import { CalendarDisplaySettings } from '@/routes/settings/CalendarDisplaySettings'
import { DisplayPreferencesSettings } from '@/routes/settings/DisplayPreferencesSettings'
import { IntegrationsCalendarSettings } from '@/routes/settings/IntegrationsCalendarSettings'
import { IntegrationsGmailSettings } from '@/routes/settings/IntegrationsGmailSettings'
import { ConnectedAccountsSettings } from '@/routes/settings/ConnectedAccountsSettings'
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
import { OperationsSettings } from '@/routes/settings/OperationsSettings'
import { WebhooksSettings } from '@/routes/settings/WebhooksSettings'
// landr-sbhz.5 — staff-only tier/feature editor. Lazy: only Landr staff ever
// reach it, so it has no place on the operator initial bundle.
const TierSettings = lazy(() => import('@/routes/settings/TierSettings'))
import { AuthProvider } from '@/lib/auth'
import { OperatorProvider } from '@/lib/operator'
import { EntitlementsProvider, useEntitlements } from '@/lib/entitlements'
import { featureForRoute, featureForSection } from '@/lib/entitlements-map'
import { ProtectedRoute } from '@/lib/ProtectedRoute'
import { ThemeProvider } from '@/lib/theme'
import { AppShell } from '@/components/AppShell'
import { OnboardingGuard } from '@/components/OnboardingGuard'
import { RouteFallback } from '@/components/RouteFallback'
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
          <Routes>
            <Route path="/login" element={<Login />} />
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
                      {/* landr-mhhq — Suspense boundary catches all
                          lazy-loaded route chunks (Analytics +
                          /views family today) so the AppShell chrome
                          stays mounted while the chunk streams in. */}
                      <Suspense fallback={<RouteFallback />}>
                        <Outlet />
                      </Suspense>
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
              {/* landr-aref — /audit (audit_log viewer). Tenant-scoped via
                  RLS on audit_log; landr staff see cross-tenant rows for
                  fraud/dispute investigation per the existing policy. */}
              <Route path="/audit" element={gatedRoute('/audit', <Audit />)} />
              {/* landr-4pn1 — /trash (recently-deleted bin per category). */}
              <Route path="/trash" element={<Trash />} />
              <Route path="/approvals/general" element={<GeneralApprovals />} />
              {/* landr-wwhn.11 — Ticket board (5-column kanban, realtime). */}
              <Route path="/tickets" element={gatedRoute('/tickets', <TicketBoard />)} />
              {/* landr-wwhn.23 — MoSCoW release-planning overlay. */}
              <Route path="/tickets/planning" element={gatedRoute('/tickets/planning', <TicketPlanning />)} />
              {/* landr-znzz.8 — operator retrieve board (per-day check-ins). */}
              <Route path="/retrieve" element={<RetrieveBoard />} />

              {/* landr-fzcg — Account is a virtual top-level nav item
                  whose subsections live under /settings/*. Hitting
                  /account lands the user on /settings/company (first
                  ACCOUNT_SECTIONS entry); the sub-sidebar then renders
                  the Account group's section list because the URL is
                  in ACCOUNT_PATHS. Keeping leaf URLs under /settings/*
                  preserves every existing deep link. */}
              <Route path="/account" element={<AccountIndexRedirect />} />

              {/* Settings hub — left sub-sidebar wraps every subsection. */}
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<SettingsIndexRedirect />} />
                <Route path="company" element={gatedSection('/settings/company', <CompanySettings />)} />
                <Route path="calendar-display" element={<CalendarDisplaySettings />} />
                <Route path="display-preferences" element={<DisplayPreferencesSettings />} />
                {/* landr-yp8x — Branding (logo + primary colour shown in
                    the embedded booking widget). */}
                <Route path="branding" element={gatedSection('/settings/branding', <BrandingSettings />)} />
                <Route path="team" element={gatedSection('/settings/team', <Staff />)} />
                <Route path="providers" element={gatedSection('/settings/providers', <Providers />)} />
                <Route path="pickup-locations" element={gatedSection('/settings/pickup-locations', <PickupLocations />)} />
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
                {/* landr-znzz.5 — generic per-operator offers/upsells shown in
                    the AFTER phase of the customer event page. */}
                <Route path="offers" element={<OffersSettings />} />
                {/* landr-e8jf — Schedule lives under Settings now. The
                    capacity pills on the main Calendar (landr-3uai) make
                    Schedule a setup tool, not a daily-ops view. */}
                <Route path="schedule" element={gatedSection('/settings/schedule', <Schedule />)} />
                <Route path="email-templates" element={gatedSection('/settings/email-templates', <EmailTemplates />)} />
                {/* landr-qg4q — outbound_emails viewer (failed sends, retried, sent). */}
                <Route path="email-log" element={gatedSection('/settings/email-log', <EmailLog />)} />
                <Route path="integrations/gmail" element={gatedSection('/settings/integrations/gmail', <IntegrationsGmailSettings />)} />
                {/* landr-6ybs — per-operator subscribable ICS calendar feed. */}
                <Route path="integrations/calendar" element={gatedSection('/settings/integrations/calendar', <IntegrationsCalendarSettings />)} />
                <Route path="connected-accounts" element={<ConnectedAccountsSettings />} />
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
                {/* landr-wwhn.16 — Settings → Notifications: personal
                    notification preferences (bell/email/push + per-ticket
                    overrides). Personal scope; lives in ACCOUNT group. */}
                <Route path="notifications" element={<NotificationPrefsSettings />} />
                <Route path="plan" element={gatedSection('/settings/plan', <PlanSettings />)} />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
          </EntitlementsProvider>
        </OperatorProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
