import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
import { t } from '@/lib/strings'
import { AuthShell } from '@/routes/AuthShell'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Account-enumeration-safe: once submitted we always show the neutral
  // "check your email" confirmation, whether or not the address has an
  // account and whether or not Supabase returned an error.
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError(t.auth.invalidEmail)
      return
    }
    setEmailError(null)
    setSubmitting(true)
    // Build redirectTo from the live origin so each deployment
    // (dev / staging / prod) sends users back to its own /reset-password.
    await supabase.auth
      .resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      .catch(() => {
        // Never surface failures here — doing so would leak which addresses
        // exist (and the user can always retry).
      })
    setSubmitting(false)
    setSentTo(trimmed)
  }

  if (sentTo) {
    return (
      <AuthShell>
        <Card className="relative z-10 w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <h1 className="text-base">{t.auth.forgotSentTitle}</h1>
            </CardTitle>
            <CardDescription>{t.auth.forgotSentBody(sentTo)}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">{t.auth.forgotBackToLogin}</Link>
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
            <h1 className="text-base">{t.auth.forgotHeading}</h1>
          </CardTitle>
          <CardDescription>{t.auth.forgotDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
                <p id="email-error" role="alert" className="text-destructive text-xs">
                  {emailError}
                </p>
              ) : null}
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? t.auth.forgotSubmitting : t.auth.forgotSubmit}
            </Button>

            <Link
              to="/login"
              className="text-muted-foreground hover:text-foreground text-center text-xs"
            >
              {t.auth.forgotBackToLogin}
            </Link>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
