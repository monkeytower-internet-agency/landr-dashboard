import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormErrorAlert } from '@/components/ui/FormErrorAlert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { ContinueWithProvider } from '@/components/ContinueWithProvider'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { t } from '@/lib/strings'
import { AuthShell } from '@/routes/AuthShell'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type LocationState = { from?: { pathname: string } }

export function Login() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  const queryError = searchParams.get('error')

  if (!authLoading && session) {
    const from = (location.state as LocationState | null)?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const emailOk = EMAIL_RE.test(email.trim())
    const passwordOk = password.length > 0
    setEmailError(emailOk ? null : t.auth.invalidEmail)
    setPasswordError(passwordOk ? null : t.auth.passwordRequired)
    if (!emailOk || !passwordOk) return

    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setSubmitting(false)

    if (error) {
      setSubmitError(error.message || t.auth.genericError)
      return
    }

    const from = (location.state as LocationState | null)?.from?.pathname ?? '/'
    navigate(from, { replace: true })
  }

  return (
    <AuthShell>
      <Card className="relative z-10 w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-base">{t.auth.signInHeading}</h1>
          </CardTitle>
          <CardDescription>{t.auth.signInDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {queryError === 'email_in_use' ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-300"
            >
              <p className="font-medium">{t.auth.emailInUseTitle}</p>
              <p className="mt-0.5 text-xs">{t.auth.emailInUseBody}</p>
            </div>
          ) : null}
          <FormErrorAlert
            message={queryError === 'unknown' ? t.auth.oauthUnknownError : null}
            className="mb-4"
          />
          <FormErrorAlert message={oauthError} className="mb-4" />

          <div className="flex flex-col gap-3">
            <ContinueWithProvider
              providerId="google"
              onError={setOauthError}
              className="w-full"
            />
            <div className="flex items-center gap-3 text-muted-foreground text-xs">
              <span className="h-px flex-1 bg-border" />
              <span>{t.auth.continueDivider}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>

          <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t.auth.emailLabel}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'email-error' : undefined}
                disabled={submitting}
              />
              {emailError ? (
                <p
                  id="email-error"
                  role="alert"
                  className="text-destructive text-xs"
                >
                  {emailError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t.auth.passwordLabel}</Label>
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  {t.auth.forgotLink}
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                placeholder={t.auth.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? 'password-error' : undefined}
                disabled={submitting}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
              />
              {passwordError ? (
                <p
                  id="password-error"
                  role="alert"
                  className="text-destructive text-xs"
                >
                  {passwordError}
                </p>
              ) : null}
            </div>

            <FormErrorAlert message={submitError} />

            <Button type="submit" disabled={submitting}>
              {submitting ? t.auth.submitting : t.auth.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
