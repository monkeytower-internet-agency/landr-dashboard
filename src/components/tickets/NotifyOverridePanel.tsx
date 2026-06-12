// landr-wwhn.16 — NotifyOverridePanel, NotifyOverrideEditor, NotifyChannelRow.
// Extracted from TicketDetailSheet.tsx (v9e4.8 refactor — pure file move).
//
// Per-ticket notification override. Shows:
//   - Effective setting (resolved from per-ticket override + global default).
//   - "Following your global default" badge OR "Custom for this ticket" badge.
//   - Channel toggles (bell / email / push) that write nullable-inherit rows:
//       NULL  = follow global (live)
//       bool  = explicit pin
//   - "Reset to global default" button removes the override row.
//
// Loads two queries: global prefs + per-ticket settings. When a per-ticket
// row exists, the toggle shows the per-ticket value; otherwise it shows the
// resolved effective value (which equals the global default when no override).
// Saving a toggle marks that single channel as explicitly set; the other
// channels remain as they were (null = still following global).
//
// Design: all-null per-ticket row → DELETE → pure inheritance. Implemented in
// upsertTicketNotifySettings() in the data layer.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellIcon, BellOffIcon, MailIcon, SmartphoneIcon } from 'lucide-react'
import { toast } from 'sonner'

import { t } from '@/lib/strings'
import {
  fetchNotificationPrefs,
  fetchTicketNotifySettings,
  upsertTicketNotifySettings,
  resolveEffectiveNotifySettings,
  type TicketNotifySettings,
} from '@/lib/notification-prefs'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---- NotifyOverridePanel ----------------------------------------------------

type NotifyOverridePanelProps = {
  ticketId: string
  userId: string
}

// Outer loader: fetches global prefs + per-ticket override, then mounts the
// keyed editor so draft state initialises from the server data without needing
// useEffect+setState (which the React Compiler flags as a cascade risk).
export function NotifyOverridePanel({ ticketId, userId }: NotifyOverridePanelProps) {
  const globalQuery = useQuery({
    queryKey: ['notification-prefs', userId],
    queryFn: () => fetchNotificationPrefs(userId),
    staleTime: 60_000,
  })

  const overrideQuery = useQuery({
    queryKey: ['ticket-notify-settings', ticketId, userId],
    queryFn: () => fetchTicketNotifySettings(ticketId, userId),
    staleTime: 30_000,
  })

  // Wait until both queries have settled before rendering the editor.
  // While pending, show nothing (the sheet already has a loading skeleton).
  if (globalQuery.isPending || overrideQuery.isPending) return null

  const globalPrefs = globalQuery.data ?? null
  const override: TicketNotifySettings | null = overrideQuery.data ?? null

  // Key the editor on the serialised override row: when the server row changes
  // after a save/clear the editor remounts with fresh initialState, avoiding
  // the need for useEffect+setState.
  const editorKey = JSON.stringify(override)

  return (
    <NotifyOverrideEditor
      key={editorKey}
      ticketId={ticketId}
      userId={userId}
      globalPrefs={globalPrefs}
      override={override}
    />
  )
}

// ---- NotifyOverrideEditor ---------------------------------------------------

type NotifyOverrideEditorProps = {
  ticketId: string
  userId: string
  globalPrefs: import('@/lib/notification-prefs').NotificationPrefs | null
  override: TicketNotifySettings | null
}

function NotifyOverrideEditor({
  ticketId,
  userId,
  globalPrefs,
  override,
}: NotifyOverrideEditorProps) {
  const qc = useQueryClient()

  // Draft mirrors the OVERRIDE row (nullable), not the resolved effective value.
  // null = "follow global" for that channel.
  const [draftBell, setDraftBell] = useState<boolean | null>(override?.bell ?? null)
  const [draftEmail, setDraftEmail] = useState<boolean | null>(override?.email ?? null)
  const [draftPush, setDraftPush] = useState<boolean | null>(override?.push ?? null)

  const hasOverride =
    override !== null &&
    (override.bell !== null || override.email !== null || override.push !== null)

  const dirty =
    draftBell !== (override?.bell ?? null) ||
    draftEmail !== (override?.email ?? null) ||
    draftPush !== (override?.push ?? null)

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertTicketNotifySettings(ticketId, userId, {
        bell: draftBell,
        email: draftEmail,
        push: draftPush,
      }),
    onSuccess: () => {
      toast.success(t.notificationPrefs.overrideToastSaved)
      void qc.invalidateQueries({
        queryKey: ['ticket-notify-settings', ticketId, userId],
      })
    },
    onError: (err: Error) => {
      toast.error(t.notificationPrefs.overrideToastError, {
        description: err.message,
      })
    },
  })

  const clearMutation = useMutation({
    mutationFn: () =>
      upsertTicketNotifySettings(ticketId, userId, {
        bell: null,
        email: null,
        push: null,
      }),
    onSuccess: () => {
      toast.success(t.notificationPrefs.overrideToastCleared)
      void qc.invalidateQueries({
        queryKey: ['ticket-notify-settings', ticketId, userId],
      })
    },
    onError: (err: Error) => {
      toast.error(t.notificationPrefs.overrideToastError, {
        description: err.message,
      })
    },
  })

  const isPending = saveMutation.isPending || clearMutation.isPending

  // Effective values for display in each toggle (resolved from draft + global).
  const resolved = resolveEffectiveNotifySettings(
    globalPrefs,
    // Build a synthetic settings object from draft for display purposes.
    {
      ticket_id: ticketId,
      user_id: userId,
      bell: draftBell,
      email: draftEmail,
      push: draftPush,
      delivery_mode: null,
      created_at: '',
      updated_at: '',
    },
  )

  return (
    <Card data-testid="notify-override-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">
            {t.notificationPrefs.perTicketSectionTitle}
          </CardTitle>
          {hasOverride ? (
            <span
              className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              data-testid="notify-override-badge-custom"
            >
              {t.notificationPrefs.customForTicket}
            </span>
          ) : (
            <span
              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              data-testid="notify-override-badge-following"
            >
              {t.notificationPrefs.followingGlobal}
            </span>
          )}
        </div>
        {hasOverride && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t.notificationPrefs.customHint}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Channel toggles */}
        <div className="flex flex-col gap-2">
          <NotifyChannelRow
            icon={<BellIcon className="size-3.5" aria-hidden />}
            label={t.notificationPrefs.bellLabel}
            effective={resolved.bell}
            pinned={draftBell}
            onToggle={(v) => setDraftBell(v)}
            disabled={isPending}
            testId="notify-override-bell"
          />
          <NotifyChannelRow
            icon={<MailIcon className="size-3.5" aria-hidden />}
            label={t.notificationPrefs.emailLabel}
            effective={resolved.email}
            pinned={draftEmail}
            onToggle={(v) => setDraftEmail(v)}
            disabled={isPending}
            testId="notify-override-email"
          />
          <NotifyChannelRow
            icon={<SmartphoneIcon className="size-3.5" aria-hidden />}
            label={t.notificationPrefs.pushLabel}
            effective={resolved.push}
            pinned={draftPush}
            onToggle={(v) => setDraftPush(v)}
            disabled={isPending}
            testId="notify-override-push"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {hasOverride ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={() => clearMutation.mutate()}
              disabled={isPending}
              title={t.notificationPrefs.followGlobalDesc}
              data-testid="notify-override-clear"
            >
              <BellOffIcon className="size-3" aria-hidden />
              {t.notificationPrefs.followGlobalAction}
            </Button>
          ) : (
            <span />
          )}
          {dirty && (
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => saveMutation.mutate()}
              disabled={isPending}
              data-testid="notify-override-save"
            >
              {saveMutation.isPending
                ? t.notificationPrefs.saving
                : t.notificationPrefs.saveAction}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---- NotifyChannelRow -------------------------------------------------------

type NotifyChannelRowProps = {
  icon: React.ReactNode
  label: string
  /** The RESOLVED effective value (for display when following global). */
  effective: boolean
  /** The current draft value for this channel (null = not pinned). */
  pinned: boolean | null
  onToggle: (v: boolean | null) => void
  disabled: boolean
  testId: string
}

function NotifyChannelRow({
  icon,
  label,
  effective,
  pinned,
  onToggle,
  disabled,
  testId,
}: NotifyChannelRowProps) {
  // Display value: use pinned if explicitly set, otherwise fall back to
  // effective (which is the resolved global default).
  const displayValue = pinned !== null ? pinned : effective
  const isPinned = pinned !== null

  function handleClick() {
    if (!isPinned) {
      // First click: pin to the OPPOSITE of the current effective value.
      onToggle(!effective)
    } else {
      // Subsequent clicks: flip the pinned value.
      onToggle(!pinned)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded px-1 py-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
        {isPinned && (
          <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
            (custom)
          </span>
        )}
      </div>
      <Switch
        size="sm"
        checked={displayValue}
        onClick={handleClick}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  )
}
