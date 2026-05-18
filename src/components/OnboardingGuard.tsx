import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useOperator } from '@/lib/operator'

const ALLOW_PREFIX = '/onboarding'

export function OnboardingGuard({ children }: { children: ReactNode }) {
  const { currentOperator, loading } = useOperator()
  const location = useLocation()

  if (loading) return <>{children}</>
  if (location.pathname.startsWith(ALLOW_PREFIX)) return <>{children}</>
  if (!currentOperator) return <>{children}</>
  if (currentOperator.onboarded_at) return <>{children}</>

  return <Navigate to="/onboarding/start" replace state={{ from: location }} />
}
