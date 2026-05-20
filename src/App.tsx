import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
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
import { SettingsLayout } from '@/routes/SettingsLayout'
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
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/products" element={<Products />} />
              {/* landr-i018 — deep-link a specific product (used by the
                  Pricing settings 'Used by' chips). The route reuses the
                  same Products screen; the productId param feeds into
                  ProductsManager's initialSelection. */}
              <Route path="/products/:productId" element={<Products />} />
              <Route path="/reporting" element={<Reporting />} />
              <Route path="/approvals/general" element={<GeneralApprovals />} />

              {/* Settings hub — left sub-sidebar wraps every subsection. */}
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="/settings/company" replace />} />
                <Route path="company" element={<CompanySettings />} />
                <Route path="calendar-display" element={<CalendarDisplaySettings />} />
                <Route path="display-preferences" element={<DisplayPreferencesSettings />} />
                <Route path="team" element={<Staff />} />
                <Route path="pickup-locations" element={<PickupLocations />} />
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
