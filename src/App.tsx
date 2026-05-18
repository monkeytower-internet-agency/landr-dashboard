import { Outlet, Route, Routes } from 'react-router-dom'
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
import { Settings } from '@/routes/Settings'
import { Staff } from '@/routes/Staff'
import { EmailTemplates } from '@/routes/EmailTemplates'
import { PickupLocations } from '@/routes/PickupLocations'
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
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/products" element={<Products />} />
              <Route path="/reporting" element={<Reporting />} />
              <Route path="/approvals/general" element={<GeneralApprovals />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/email-templates" element={<EmailTemplates />} />
              <Route path="/pickup-locations" element={<PickupLocations />} />
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
