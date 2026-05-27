// landr-v6yd — auth.uid → public.users.id bridge helper.
//
// Background (rls-bridge-supabase-auth-id memory): Supabase auth lives in
// `auth.users`, and the dashboard session exposes auth.uid via
// `session.user.id`. The app's domain tables (memberships, contact erasure
// audit, etc.) FK against `public.users(id)`, which is a separate UUID PK
// joined to auth via the `public.users.supabase_auth_id` column.
//
// Any RPC or write that records "who did this" against a public.users FK
// MUST translate the session auth.uid through this bridge first. The
// canonical caller is `gdprEraseContact()` (contacts.gdpr_erased_by_user_id
// FKs public.users); future RPCs that accept a `p_*_user_id` typed as a
// public.users PK should call `currentPublicUserId()` rather than passing
// `session.user.id` directly. Passing the auth.uid is silently wrong (it
// happens to look like a UUID and won't fail validation) until the FK
// check fires — that's the bug class this helper exists to prevent.
//
// Server-side resolution (RPC accepts auth.uid + does the lookup itself)
// is the architecturally cleaner fix; see landr-v6yd follow-up tickets.
// Until then, every dashboard caller funnels through this helper.

import { supabase } from '@/lib/supabase'

/**
 * Resolve the current session's auth.uid to its `public.users.id`.
 *
 * @param authUid - the Supabase auth user id (e.g. `session.user.id`)
 * @returns the matching `public.users.id`
 * @throws if no `public.users` row exists for the given auth uid, or on
 *         any Supabase error. Callers should let this surface — a missing
 *         bridge row indicates a broken signup flow, not a recoverable
 *         user error.
 */
export async function currentPublicUserId(authUid: string): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('supabase_auth_id', authUid)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('public.users row not found for current session')
  return data.id
}
