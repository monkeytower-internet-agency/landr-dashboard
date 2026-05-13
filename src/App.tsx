import { Outlet, Route, Routes } from 'react-router-dom'
import { Bookings } from '@/routes/Bookings'
import { Dashboard } from '@/routes/Dashboard'
import { NotFound } from '@/routes/NotFound'
import { Login } from '@/routes/Login'
import { AuthProvider } from '@/lib/auth'
import { OperatorProvider } from '@/lib/operator'
import { ProtectedRoute } from '@/lib/ProtectedRoute'
import { ThemeProvider } from '@/lib/theme'
import { AppShell } from '@/components/AppShell'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OperatorProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell>
                    <Outlet />
                  </AppShell>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/bookings" element={<Bookings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </OperatorProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
