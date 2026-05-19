// Provider abstraction for OAuth identity providers.
// Currently ships Google only; Apple and GitHub entries are commented but
// TypeScript-valid so adding them later is a one-line change.
// See landr-4im for the policy-B linking design.

import type { Provider } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type ProviderId = 'google' // | 'apple' | 'github' (landr-4im follow-ups)

export type ProviderConfig = {
  id: ProviderId
  label: string
  /** Path under public/ — served at the same path in dev and prod. */
  logoSrc: string
}

export const PROVIDERS: ReadonlyArray<ProviderConfig> = [
  { id: 'google', label: 'Google', logoSrc: '/google-logo.svg' },
  // { id: 'apple',  label: 'Apple',  logoSrc: '/apple-logo.svg'  }, // landr-4im follow-up
  // { id: 'github', label: 'GitHub', logoSrc: '/github-logo.svg' }, // landr-4im follow-up
]

export function getProvider(id: ProviderId): ProviderConfig {
  const found = PROVIDERS.find((p) => p.id === id)
  if (!found) throw new Error(`Unknown provider id: ${id}`)
  return found
}

/**
 * Kick off OAuth sign-in. Supabase redirects to the provider, then back to
 * `/auth/callback` where AuthCallback exchanges the PKCE code for a session.
 */
export async function signInWithProvider(id: ProviderId) {
  const redirectTo = `${window.location.origin}/auth/callback`
  return supabase.auth.signInWithOAuth({
    provider: id as Provider,
    options: { redirectTo },
  })
}

/**
 * Link an additional provider to an already-signed-in user. Requires
 * `enable_manual_linking = true` in supabase/config.toml — see landr-api
 * companion PR.
 */
export async function linkProvider(id: ProviderId) {
  return supabase.auth.linkIdentity({
    provider: id as Provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
}
