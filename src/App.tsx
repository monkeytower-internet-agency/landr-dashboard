import { Route, Routes } from 'react-router-dom'
import { Dashboard } from '@/routes/Dashboard'
import { NotFound } from '@/routes/NotFound'
import { Login } from '@/routes/Login'
import { AuthProvider } from '@/lib/auth'
import { OperatorProvider } from '@/lib/operator'
import { ProtectedRoute } from '@/lib/ProtectedRoute'
import { AppShell } from '@/components/AppShell'

function App() {
  return (
    <AuthProvider>
      <OperatorProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell>
                  <Dashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </OperatorProvider>
    </AuthProvider>
  )
}

export default App
