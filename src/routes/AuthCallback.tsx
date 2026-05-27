import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// Error codes that mean "this OAuth identity collides with an existing user".
// Per @supabase/auth-js error-codes.d.ts (verified 2026-05-19):
//   - identity_already_exists: the identity is already linked elsewhere
//   - email_exists / user_already_exists: another account uses this email
// All three should route the user back to /login with a friendly banner so
// they sign in with their existing method, then link Google from Settings.
const DUPLICATE_IDENTITY_CODES = new Set([
  'identity_already_exists',
  'email_exists',
  'user_already_exists',
])

function isDuplicateIdentityCode(code: string | null | undefined): boolean {
  if (!code) return false
  return DUPLICATE_IDENTITY_CODES.has(code)
}

/**
 * /auth/callback — receives the OAuth redirect from Supabase. Two cases:
 *
 *  (a) Provider succeeded and Supabase auto-detects the session via
 *      detectSessionInUrl=true (see src/lib/supabase.ts). We just route to /.
 *  (b) Provider failed (duplicate identity, denial, …). Supabase appends
 *      ?error=&error_code=&error_description= to the URL OR
 *      exchangeCodeForSession returns an AuthError with code on it.
 */
export function AuthCallback() {
  const navigate = useNavigate()
  // Guard against React-StrictMode double-effect re-running the exchange.
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function run() {
      const url = new URL(window.location.href)
      const params = url.searchParams
      const hashParams = new URLSearchParams(
        url.hash.startsWith('#') ? url.hash.slice(1) : url.hash,
      )

      // 1) Hard error in query/hash (provider redirected with an error).
      const errorCode =
        params.get('error_code') ?? hashParams.get('error_code')
      const errorParam = params.get('error') ?? hashParams.get('error')
      if (errorCode || errorParam) {
        if (isDuplicateIdentityCode(errorCode)) {
          navigate('/login?error=email_in_use', { replace: true })
          return
        }
        console.error('OAuth callback error', { errorCode, errorParam })
        navigate('/login?error=unknown', { replace: true })
        return
      }

      // 2) PKCE code present — exchange explicitly so we can read the error.
      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.search,
        )
        if (error) {
          if (isDuplicateIdentityCode(error.code)) {
            navigate('/login?error=email_in_use', { replace: true })
            return
          }
          console.error('OAuth callback exchange failed', error)
          navigate('/login?error=unknown', { replace: true })
          return
        }
        navigate('/', { replace: true })
        return
      }

      // 3) Implicit/hash flow — Supabase auto-detects via onAuthStateChange.
      //    Give it a tick, then check session.
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate('/', { replace: true })
        return
      }
      // Nothing useful in the URL — fall back to login.
      navigate('/login', { replace: true })
    }

    void run()
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-muted-foreground">
      Signing you in…
    </div>
  )
}
