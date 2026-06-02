import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import type { UserIdentity } from '@supabase/supabase-js'

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

async function fetchHasPasswordIdentity(): Promise<boolean> {
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error) throw error
  const identities: UserIdentity[] = data?.identities ?? []
  return identities.some((i) => i.provider === 'email')
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
          {/* Hidden username for password-manager heuristics. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
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

export function SecuritySettings() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const { data: hasPassword, isLoading } = useQuery({
    queryKey: ['user-has-password-identity'],
    queryFn: fetchHasPasswordIdentity,
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
        <Card>
          <CardHeader>
            <CardTitle>{t.security.noPasswordIdentityTitle}</CardTitle>
            <CardDescription>
              {t.security.noPasswordIdentityBody}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
