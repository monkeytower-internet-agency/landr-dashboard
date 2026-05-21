import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
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
import { ViewsIndex } from '@/routes/ViewsIndex'
import { ViewsNew } from '@/routes/ViewsNew'
import { ViewPage } from '@/routes/ViewPage'
import { EmailTemplates } from '@/routes/EmailTemplates'
import { PickupLocations } from '@/routes/PickupLocations'
import { SettingsLayout } from '@/routes/SettingsLayout'
import { BrandingSettings } from '@/routes/settings/BrandingSettings'
import { CompanySettings } from '@/routes/settings/CompanySettings'
import { CalendarDisplaySettings } from '@/routes/settings/CalendarDisplaySettings'
import { DisplayPreferencesSettings } from '@/routes/settings/DisplayPreferencesSettings'
import { IntegrationsGmailSettings } from '@/routes/settings/IntegrationsGmailSettings'
import { ConnectedAccountsSettings } from '@/routes/settings/ConnectedAccountsSettings'
import { PlanSettings } from '@/routes/settings/PlanSettings'
import { PricingSettings } from '@/routes/settings/PricingSettings'
import { AuthProvider } from '@/lib/auth'
import { OperatorProvider } from '@/lib/operator'
import { ProtectedRoute } from '@/lib/ProtectedRoute'
import { ThemeProvider } from '@/lib/theme'
import { AppShell } from '@/components/AppShell'
import { OnboardingGuard } from '@/components/OnboardingGuard'
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

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OperatorProvider>
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
                      <Outlet />
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
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/reporting" element={<Reporting />} />
              <Route path="/approvals/general" element={<GeneralApprovals />} />

              {/* landr-fzcg — Account is a virtual top-level nav item
                  whose subsections live under /settings/*. Hitting
                  /account lands the user on /settings/company (first
                  ACCOUNT_SECTIONS entry); the sub-sidebar then renders
                  the Account group's section list because the URL is
                  in ACCOUNT_PATHS. Keeping leaf URLs under /settings/*
                  preserves every existing deep link. */}
              <Route
                path="/account"
                element={<Navigate to="/settings/company" replace />}
              />

              {/* Settings hub — left sub-sidebar wraps every subsection. */}
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="/settings/company" replace />} />
                <Route path="company" element={<CompanySettings />} />
                <Route path="calendar-display" element={<CalendarDisplaySettings />} />
                <Route path="display-preferences" element={<DisplayPreferencesSettings />} />
                {/* landr-yp8x — Branding (logo + primary colour shown in
                    the embedded booking widget). */}
                <Route path="branding" element={<BrandingSettings />} />
                <Route path="team" element={<Staff />} />
                <Route path="pickup-locations" element={<PickupLocations />} />
                {/* landr-sydf — Products lives under Settings now (operators
                    edit rarely, not daily). The :productId variant preserves
                    the landr-i018 deep-link contract used by the PricingSettings
                    'Used by' chips. */}
                <Route path="products" element={<Products />} />
                <Route path="products/:productId" element={<Products />} />
                {/* landr-e8jf — Schedule lives under Settings now. The
                    capacity pills on the main Calendar (landr-3uai) make
                    Schedule a setup tool, not a daily-ops view. */}
                <Route path="schedule" element={<Schedule />} />
                <Route path="email-templates" element={<EmailTemplates />} />
                <Route path="integrations/gmail" element={<IntegrationsGmailSettings />} />
                <Route path="connected-accounts" element={<ConnectedAccountsSettings />} />
                <Route path="pricing" element={<PricingSettings />} />
                <Route path="plan" element={<PlanSettings />} />
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
        </OperatorProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
