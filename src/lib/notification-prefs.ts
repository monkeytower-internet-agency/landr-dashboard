// landr-wwhn.16 — Notification preferences data layer.
//
// Two tables, one resolver:
//   notification_preferences  — per-user GLOBAL DEFAULT (one row per user).
//                               Channels bell/email/push are NOT NULL (always a
//                               concrete value). delivery_mode immediate|digest.
//   ticket_notify_settings    — per-(ticket,user) OVERRIDE. Every column is
//                               NULLABLE: NULL = follow global (live). A row
//                               exists only to PIN ≥1 field; absence = pure
//                               inheritance. When all overridden fields are
//                               reset to NULL we DELETE the row to keep the
//                               table to genuine overrides.
//
// RLS: both tables are own-row (user_id IN (SELECT id FROM users WHERE
// supabase_auth_id = auth.uid())), so direct Supabase REST is correct per
// write-routing-convention — no side-effecting orchestration involved.
//
// The nullable-inherit contract is computed at read time by
// resolve_ticket_notify_setting() in Postgres. The UI reads the raw tables
// (global prefs + optional per-ticket row) and COALESCE-renders the "effective"
// state for display; it does NOT call the DB resolver directly.

import { supabase } from '@/lib/supabase'

// ---- Types ------------------------------------------------------------------

export type DeliveryMode = 'immediate' | 'digest'

/**
 * Global default notification preference row.
 * Mirrors public.notification_preferences. All channel columns NOT NULL.
 */
export type NotificationPrefs = {
  user_id: string
  bell: boolean
  email: boolean
  push: boolean
  delivery_mode: DeliveryMode
  created_at: string
  updated_at: string
}

/**
 * Per-ticket notification override row.
 * Mirrors public.ticket_notify_settings. All channel columns NULLABLE:
 *   null  = follow global (live inheritance)
 *   bool  = explicit per-ticket pin
 */
export type TicketNotifySettings = {
  ticket_id: string
  user_id: string
  bell: boolean | null
  email: boolean | null
  push: boolean | null
  delivery_mode: DeliveryMode | null
  created_at: string
  updated_at: string
}

/**
 * What we WRITE when upserting the global default.
 * user_id is always the caller's public.users.id so we don't take it as a
 * parameter (callers provide it from their auth context).
 */
export type NotificationPrefsWrite = {
  bell: boolean
  email: boolean
  push: boolean
  delivery_mode: DeliveryMode
}

/**
 * What we WRITE when upserting a per-ticket override.
 * null = "follow global"; delete the row when all channels are null.
 */
export type TicketNotifySettingsWrite = {
  bell: boolean | null
  email: boolean | null
  push: boolean | null
  delivery_mode?: DeliveryMode | null
}

// ---- Hard defaults (mirror the DB COALESCE base layer) ----------------------
// Callers use these when the user has no global row yet — avoids an undefined
// first render before the fetch resolves.
export const NOTIF_PREFS_DEFAULTS: NotificationPrefsWrite = {
  bell: true,
  email: false,
  push: false,
  delivery_mode: 'immediate',
}

// ---- Global default (notification_preferences) ------------------------------

const PREFS_SELECT = `
  user_id,
  bell,
  email,
  push,
  delivery_mode,
  created_at,
  updated_at
`

/**
 * Fetch the global default for a public.users.id.
 * Returns null if the user has never saved a preference row — callers fall back
 * to NOTIF_PREFS_DEFAULTS in that case.
 */
export async function fetchNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs | null> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(PREFS_SELECT)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as NotificationPrefs | null
}

/**
 * Upsert the global default.
 *
 * Per write-routing-convention this is a plain own-row upsert — RLS + the
 * audit trigger handle it; no FastAPI call needed.
 */
export async function upsertNotificationPrefs(
  userId: string,
  prefs: NotificationPrefsWrite,
): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' })
    .select(PREFS_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as NotificationPrefs
}

// ---- Per-ticket override (ticket_notify_settings) ---------------------------

const TICKET_NOTIFY_SELECT = `
  ticket_id,
  user_id,
  bell,
  email,
  push,
  delivery_mode,
  created_at,
  updated_at
`

/**
 * Fetch the per-ticket override for a (ticket, user) pair.
 * Returns null if no override row exists (pure global inheritance).
 */
export async function fetchTicketNotifySettings(
  ticketId: string,
  userId: string,
): Promise<TicketNotifySettings | null> {
  const { data, error } = await supabase
    .from('ticket_notify_settings')
    .select(TICKET_NOTIFY_SELECT)
    .eq('ticket_id', ticketId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as TicketNotifySettings | null
}

/**
 * Upsert a per-ticket override.
 *
 * If ALL channel values (bell, email, push) are null — meaning the user has
 * reset everything to "follow global" — DELETE the row instead of keeping an
 * all-null stub (the schema contract: absence == pure inheritance).
 *
 * Per write-routing-convention: direct Supabase REST — own-row write, no
 * side effects.
 */
export async function upsertTicketNotifySettings(
  ticketId: string,
  userId: string,
  settings: TicketNotifySettingsWrite,
): Promise<TicketNotifySettings | null> {
  const allNull =
    settings.bell === null &&
    settings.email === null &&
    settings.push === null &&
    (settings.delivery_mode === null || settings.delivery_mode === undefined)

  if (allNull) {
    // Delete the row — pure inheritance going forward.
    const { error } = await supabase
      .from('ticket_notify_settings')
      .delete()
      .eq('ticket_id', ticketId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
    return null
  }

  const { data, error } = await supabase
    .from('ticket_notify_settings')
    .upsert(
      { ticket_id: ticketId, user_id: userId, ...settings },
      { onConflict: 'ticket_id,user_id' },
    )
    .select(TICKET_NOTIFY_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as TicketNotifySettings
}

// ---- Client-side resolver ---------------------------------------------------

/**
 * Compute the effective notification setting for a (ticket, user) pair from
 * the two raw rows the UI already has in cache. Mirrors the DB
 * resolve_ticket_notify_setting() logic: COALESCE(per-ticket, global, hard
 * default) per field.
 *
 * The UI calls this for display only — the dispatcher (.8) calls the DB
 * resolver. Both must agree; this function is the client-side mirror.
 */
export function resolveEffectiveNotifySettings(
  global: NotificationPrefs | null,
  perTicket: TicketNotifySettings | null,
): { bell: boolean; email: boolean; push: boolean; delivery_mode: DeliveryMode } {
  return {
    bell:
      perTicket?.bell !== null && perTicket?.bell !== undefined
        ? perTicket.bell
        : (global?.bell ?? NOTIF_PREFS_DEFAULTS.bell),
    email:
      perTicket?.email !== null && perTicket?.email !== undefined
        ? perTicket.email
        : (global?.email ?? NOTIF_PREFS_DEFAULTS.email),
    push:
      perTicket?.push !== null && perTicket?.push !== undefined
        ? perTicket.push
        : (global?.push ?? NOTIF_PREFS_DEFAULTS.push),
    delivery_mode:
      perTicket?.delivery_mode !== null &&
      perTicket?.delivery_mode !== undefined
        ? perTicket.delivery_mode
        : (global?.delivery_mode ?? NOTIF_PREFS_DEFAULTS.delivery_mode),
  }
}
