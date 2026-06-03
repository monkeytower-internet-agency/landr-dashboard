import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useAuth } from '@/lib/auth'
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// Whether the account has an email/password credential. Detected from
// app_metadata.providers — NOT from auth.identities: seeded / admin-created
// operators (e.g. ok@landr.de, info@para42.com) have a password and
// providers:['email'] but ZERO auth.identities rows, so getUserIdentities()
// returns [] and used to mis-route them to the *set* form — letting them
// change their password WITHOUT entering the old one. providers contains
// 'email' iff an email/password credential exists, so this can only ever err
// toward requiring the current password, never toward skipping it.
async function fetchHasPassword(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const providers = data.user?.app_metadata?.providers
  return Array.isArray(providers) && providers.includes('email')
}

function ChangePasswordCard({ email }: { email: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (current.length === 0) {
      setError(t.security.currentRequired)
      return
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(t.security.tooShort)
      return
    }
    if (next !== confirm) {
      setError(t.security.mismatch)
      return
    }
    if (next === current) {
      setError(t.security.sameAsCurrent)
      return
    }

    setSubmitting(true)
    // Re-authenticate by verifying the current password. We deliberately do
    // NOT flip the server-side `reauthentication` flag (which would email an
    // OTP per change); instead we confirm the current password client-side.
    // signInWithPassword refreshes the same session on success, so this does
    // not disturb the logged-in state.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    })
    if (signInErr) {
      setSubmitting(false)
      setError(t.security.currentIncorrect)
      return
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: next })
    setSubmitting(false)
    if (updErr) {
      setError(updErr.message || t.security.genericError)
      return
    }

    toast.success(t.security.success)
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.security.changePasswordHeading}</CardTitle>
        <CardDescription>{t.security.changePasswordDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex max-w-sm flex-col gap-4">
          {/*
            Username hint for password managers. MUST be visually hidden via
            `sr-only`, NOT the `hidden` attribute (= display:none). Chrome's
            password manager ignores display:none username fields, and with no
            parseable username it suppresses BOTH the "suggest strong password"
            and "save/update password" prompts on the new-password field below.
            sr-only keeps the field in the render tree so Chrome still parses it.
          */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
            className="sr-only"
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">
              {t.security.currentPasswordLabel}
            </Label>
            <Input
              id="current-password"
              name="current-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">{t.security.newPasswordLabel}</Label>
            <div className="relative">
              <Input
                id="new-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
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
            <Label htmlFor="confirm-password">
              {t.security.confirmPasswordLabel}
            </Label>
            <Input
              id="confirm-password"
              name="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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

          <Button type="submit" disabled={submitting} className="self-start">
            {submitting ? t.security.submitting : t.security.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function SetPasswordCard({ email }: { email: string }) {
  const queryClient = useQueryClient()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(t.security.tooShort)
      return
    }
    if (next !== confirm) {
      setError(t.security.mismatch)
      return
    }

    setSubmitting(true)
    // Provider-only session (e.g. Google): there is no current password to
    // verify, so we set one directly. updateUser on the logged-in session
    // adds an email/password sign-in method to the account.
    const { error: updErr } = await supabase.auth.updateUser({ password: next })
    setSubmitting(false)
    if (updErr) {
      setError(updErr.message || t.security.genericError)
      return
    }

    toast.success(t.security.setSuccess)
    setNext('')
    setConfirm('')
    // The new email identity now exists — refetch so the page swaps to the
    // change-password form.
    void queryClient.invalidateQueries({
      queryKey: ['user-has-password'],
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.security.setPasswordHeading}</CardTitle>
        <CardDescription>{t.security.setPasswordDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex max-w-sm flex-col gap-4">
          {/*
            Username hint for password managers (see ChangePasswordCard). Lets
            Chrome offer to generate + save the newly-set password against this
            account. sr-only, never `hidden`/display:none.
          */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
            className="sr-only"
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-new-password">{t.security.newPasswordLabel}</Label>
            <div className="relative">
              <Input
                id="set-new-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
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
            <Label htmlFor="set-confirm-password">
              {t.security.confirmPasswordLabel}
            </Label>
            <Input
              id="set-confirm-password"
              name="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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

          <Button type="submit" disabled={submitting} className="self-start">
            {submitting ? t.security.setSubmitting : t.security.setSubmit}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function SecuritySettings() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const { data: hasPassword, isLoading } = useQuery({
    queryKey: ['user-has-password'],
    queryFn: fetchHasPassword,
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.security.title },
        ]}
        subtitle={t.security.description}
      />
      <h1 className="text-2xl font-semibold">{t.security.title}</h1>

      {isLoading ? null : hasPassword && email ? (
        <ChangePasswordCard email={email} />
      ) : (
        <SetPasswordCard email={email} />
      )}
    </div>
  )
}
