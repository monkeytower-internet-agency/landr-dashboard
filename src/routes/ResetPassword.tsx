import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy'
import { t } from '@/lib/strings'
import { AuthShell } from '@/routes/AuthShell'

type Phase = 'verifying' | 'ready' | 'invalid'

/**
 * /reset-password — landing page for the Supabase recovery link.
 *
 * The client (src/lib/supabase.ts) runs the PKCE flow with
 * detectSessionInUrl=true, so the recovery link arrives as `?code=...` and
 * Supabase establishes a short-lived recovery session. We confirm it two
 * ways (whichever fires first wins):
 *
 *   1. onAuthStateChange emits PASSWORD_RECOVERY once the URL is consumed.
 *   2. Defensive exchangeCodeForSession(window.location.search) — mirrors
 *      AuthCallback.tsx; covers the case where detectSessionInUrl already
 *      ran (or did not) before this component mounted.
 *
 * Once a session exists we reveal the new-password form, which calls
 * updateUser({ password }). On success the user is already signed in, so we
 * route to the dashboard home.
 */
export function ResetPassword() {
  const navigate = useNavigate()
  const ran = useRef(false)
  const [phase, setPhase] = useState<Phase>('verifying')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true

    // 1) Listen for the recovery event. Supabase fires PASSWORD_RECOVERY
    //    when it detects+consumes the recovery token in the URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) {
        setPhase('ready')
      }
    })

    // 2) Defensive explicit exchange (StrictMode-guarded), mirroring
    //    AuthCallback. If a code is present and the exchange succeeds we are
    //    in a recovery session; if there is already a session, accept it.
    async function bootstrap() {
      if (ran.current) return
      ran.current = true

      const search = window.location.search
      const hasCode = new URLSearchParams(search).has('code')

      if (hasCode) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(
          search,
        )
        if (!active) return
        if (exErr) {
          setPhase('invalid')
          return
        }
        setPhase('ready')
        return
      }

      // No code in URL — maybe detectSessionInUrl already established the
      // recovery session, or the user reloaded the page mid-flow.
      const { data } = await supabase.auth.getSession()
      if (!active) return
      if (data.session) {
        setPhase('ready')
      } else {
        setPhase('invalid')
      }
    }

    void bootstrap()

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.auth.resetTooShort)
      return
    }
    if (password !== confirm) {
      setError(t.auth.resetMismatch)
      return
    }

    setSubmitting(true)
    const { error: updErr } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updErr) {
      setError(updErr.message || t.auth.resetGenericError)
      return
    }

    toast.success(t.auth.resetSuccess)
    // The user holds a valid session after updateUser — go straight in.
    navigate('/', { replace: true })
  }

  if (phase === 'verifying') {
    return (
      <AuthShell>
        <Card className="relative z-10 w-full max-w-sm">
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            {t.auth.resetVerifying}
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  if (phase === 'invalid') {
    return (
      <AuthShell>
        <Card className="relative z-10 w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <h1 className="text-base">{t.auth.resetLinkInvalidTitle}</h1>
            </CardTitle>
            <CardDescription>{t.auth.resetLinkInvalidBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/forgot-password">{t.auth.resetRequestNew}</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Card className="relative z-10 w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-base">{t.auth.resetHeading}</h1>
          </CardTitle>
          <CardDescription>{t.auth.resetDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">{t.auth.resetNewPasswordLabel}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={t.auth.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={submitting}
                  className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">{t.auth.resetConfirmLabel}</Label>
              <Input
                id="confirm-password"
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t.auth.passwordPlaceholder}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive text-sm"
              >
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={submitting}>
              {submitting ? t.auth.resetSubmitting : t.auth.resetSubmit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
