import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  PROVIDERS,
  signInWithProvider,
  type ProviderConfig,
  type ProviderId,
} from '@/lib/auth-providers'
import { t } from '@/lib/strings'

type Props = {
  /** Which provider to render. Defaults to the first provider in PROVIDERS. */
  providerId?: ProviderId
  /** Called with the error message if signInWithOAuth fails synchronously. */
  onError?: (message: string) => void
  className?: string
}

export function ContinueWithProvider({
  providerId,
  onError,
  className,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const provider: ProviderConfig =
    PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0]

  async function onClick() {
    setSubmitting(true)
    const { error } = await signInWithProvider(provider.id)
    if (error) {
      setSubmitting(false)
      onError?.(error.message || t.auth.oauthUnknownError)
    }
    // Success path: Supabase redirects the browser to the provider.
    // The page unloads, so we don't reset submitting on success.
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={submitting}
      className={className}
      aria-label={t.auth.continueWith(provider.label)}
    >
      <img
        src={provider.logoSrc}
        alt=""
        aria-hidden="true"
        width={18}
        height={18}
      />
      {submitting
        ? t.auth.continueWithLoading(provider.label)
        : t.auth.continueWith(provider.label)}
    </Button>
  )
}
