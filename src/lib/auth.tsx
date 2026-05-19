import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { registerSessionExpiredHandler } from '@/lib/api-client'
import { t } from '@/lib/strings'

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()

  // Keep a live ref to `location` so handleSessionExpired (created once via
  // useRef) always reads the current path without re-creating the handler.
  const locationRef = useRef(location)
  useEffect(() => {
    locationRef.current = location
  }, [location])

  // Idempotency guard — multiple concurrent 401s (e.g. five TanStack Query
  // refetches firing at once after a db-reset) must only sign out + redirect
  // once. We reset the flag whenever the user successfully signs back in.
  const handlingRef = useRef(false)

  // Stable callback — reads from locationRef so it captures the LIVE path
  // without re-rendering whenever the route changes. useCallback() + an empty
  // dep array gives us a referentially-stable identity for the api-client
  // registration effect below.
  const handleSessionExpired = useCallback(async () => {
    if (handlingRef.current) return
    handlingRef.current = true
    // Local-scope signOut: we already know the token is invalid, no point
    // calling the server. Keeps the redirect snappy and avoids cascading errors.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {
      /* never throw from the expired handler */
    })
    const here = locationRef.current
    if (here.pathname !== '/login') {
      toast.error(t.auth.sessionExpired)
      navigate('/login', { replace: true, state: { from: here } })
    }
    // Stay latched until the next successful sign-in (see onAuthStateChange below).
  }, [navigate])

  useEffect(() => {
    const unregister = registerSessionExpiredHandler(handleSessionExpired)
    return unregister
  }, [handleSessionExpired])

  // Mirror handleSessionExpired into a ref so the subscribe effect (mount-once)
  // can call the latest handler without re-subscribing on every render.
  const handleSessionExpiredRef = useRef(handleSessionExpired)
  useEffect(() => {
    handleSessionExpiredRef.current = handleSessionExpired
  }, [handleSessionExpired])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setLoading(false)
      // Cross-tab sign-out: if another tab signs the user out, supabase emits
      // SIGNED_OUT in this tab too. Route it through the same handler so we
      // get the toast + redirect rather than a confusing inline 401 on the
      // next data refetch.
      if (event === 'SIGNED_OUT' && next === null) {
        void handleSessionExpiredRef.current()
      }
      if (event === 'SIGNED_IN' && next) {
        // Successful re-login — release the idempotency latch so future
        // 401s in this session can trigger another redirect.
        handlingRef.current = false
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
