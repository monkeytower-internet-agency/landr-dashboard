import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUB_KEY

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUB_KEY in .env',
    )
  }
  client = createClient(url, publishableKey)
  return client
}
