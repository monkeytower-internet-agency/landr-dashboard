// landr-wwhn.16 — Settings → Notifications.
//
// Global default notification preference editor. Operators set their default
// bell/email/push channels + delivery mode here; those values seed every new
// ticket's notification behaviour.
//
// This is a PERSONAL (per-user) setting, not an operator/tenant setting, so
// we use the public.users.id (publicUserId) resolved from the Supabase auth
// session — not the currentOperatorId from useOperator().
//
// Per write-routing-convention: direct Supabase REST (own-row upsert on
// notification_preferences; RLS + audit trigger cover it). No FastAPI call.
//
// Design notes:
//   - bell defaults ON; email + push default OFF (per schema defaults).
//   - delivery_mode: immediate (default) vs digest (slice-3 batching, column
//     exists now so we surface it; digest batching itself ships in slice-3).
//   - Mobile push ONLY — no browser/web push (epic spec).

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellIcon, MailIcon, SmartphoneIcon } from 'lucide-react'
import { toast } from 'sonner'

import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { useAuth } from '@/lib/auth'
import {
  fetchCurrentPublicUser,
} from '@/lib/tickets'
import {
  fetchNotificationPrefs,
  upsertNotificationPrefs,
  NOTIF_PREFS_DEFAULTS,
  type DeliveryMode,
  type NotificationPrefsWrite,
} from '@/lib/notification-prefs'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

// ---- Public component -------------------------------------------------------

export function NotificationPrefsSettings() {
  const { user: authUser } = useAuth()

  const publicUserQuery = useQuery({
    queryKey: ['current-public-user', authUser?.id ?? 'anon'],
    queryFn: () => fetchCurrentPublicUser(authUser!.id),
    enabled: !!authUser?.id,
    staleTime: 5 * 60 * 1000,
  })
  const publicUserId = publicUserQuery.data?.id ?? null

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.notifications },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.notifications}
      />
      {publicUserId ? (
        <NotificationPrefsLoader userId={publicUserId} />
      ) : publicUserQuery.isPending ? (
        <p className="text-muted-foreground p-6 text-sm">
          {t.notificationPrefs.loading}
        </p>
      ) : (
        <p className="text-muted-foreground p-6 text-sm">
          {t.notificationPrefs.noUser}
        </p>
      )}
    </>
  )
}

// ---- Loader -----------------------------------------------------------------

function NotificationPrefsLoader({ userId }: { userId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['notification-prefs', userId],
    queryFn: () => fetchNotificationPrefs(userId),
    staleTime: 60_000,
  })

  if (isPending) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        {t.notificationPrefs.loading}
      </p>
    )
  }

  // data may be null if the user has no row yet — editor initialises from
  // hard defaults in that case.
  return (
    <NotificationPrefsEditor
      key={JSON.stringify(data)}
      userId={userId}
      initialBell={data?.bell ?? NOTIF_PREFS_DEFAULTS.bell}
      initialEmail={data?.email ?? NOTIF_PREFS_DEFAULTS.email}
      initialPush={data?.push ?? NOTIF_PREFS_DEFAULTS.push}
      initialDeliveryMode={data?.delivery_mode ?? NOTIF_PREFS_DEFAULTS.delivery_mode}
    />
  )
}

// ---- Editor -----------------------------------------------------------------

type EditorProps = {
  userId: string
  initialBell: boolean
  initialEmail: boolean
  initialPush: boolean
  initialDeliveryMode: DeliveryMode
}

function NotificationPrefsEditor({
  userId,
  initialBell,
  initialEmail,
  initialPush,
  initialDeliveryMode,
}: EditorProps) {
  const qc = useQueryClient()
  const [bell, setBell] = useState(initialBell)
  const [email, setEmail] = useState(initialEmail)
  const [push, setPush] = useState(initialPush)
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(initialDeliveryMode)

  const dirty =
    bell !== initialBell ||
    email !== initialEmail ||
    push !== initialPush ||
    deliveryMode !== initialDeliveryMode

  const mutation = useMutation({
    mutationFn: (prefs: NotificationPrefsWrite) =>
      upsertNotificationPrefs(userId, prefs),
    onSuccess: () => {
      toast.success(t.notificationPrefs.toastSaved)
      void qc.invalidateQueries({ queryKey: ['notification-prefs', userId] })
    },
    onError: (err: Error) => {
      toast.error(t.notificationPrefs.toastSaveError, {
        description: err.message,
      })
    },
  })

  function revert() {
    setBell(initialBell)
    setEmail(initialEmail)
    setPush(initialPush)
    setDeliveryMode(initialDeliveryMode)
  }

  function save() {
    mutation.mutate({ bell, email, push, delivery_mode: deliveryMode })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.notificationPrefs.globalSectionTitle}</CardTitle>
          <CardDescription>{t.notificationPrefs.globalSectionDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Channel toggles */}
          <fieldset>
            <legend className="mb-3 text-sm font-medium">
              {t.notificationPrefs.channelSectionTitle}
            </legend>
            <div className="flex flex-col gap-4">
              <ChannelToggle
                id="notif-bell"
                icon={<BellIcon className="size-4" aria-hidden />}
                label={t.notificationPrefs.bellLabel}
                description={t.notificationPrefs.bellDesc}
                checked={bell}
                onChange={setBell}
                disabled={mutation.isPending}
                testId="notif-toggle-bell"
              />
              <ChannelToggle
                id="notif-email"
                icon={<MailIcon className="size-4" aria-hidden />}
                label={t.notificationPrefs.emailLabel}
                description={t.notificationPrefs.emailDesc}
                checked={email}
                onChange={setEmail}
                disabled={mutation.isPending}
                testId="notif-toggle-email"
              />
              <ChannelToggle
                id="notif-push"
                icon={<SmartphoneIcon className="size-4" aria-hidden />}
                label={t.notificationPrefs.pushLabel}
                description={t.notificationPrefs.pushDesc}
                checked={push}
                onChange={setPush}
                disabled={mutation.isPending}
                testId="notif-toggle-push"
              />
            </div>
          </fieldset>

          {/* Delivery mode */}
          <div>
            <Label className="mb-2 block text-sm font-medium">
              {t.notificationPrefs.deliveryModeLabel}
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              <DeliveryModeOption
                id="delivery-immediate"
                value="immediate"
                label={t.notificationPrefs.deliveryModeImmediate}
                description={t.notificationPrefs.deliveryModeImmediateDesc}
                selected={deliveryMode === 'immediate'}
                onChange={setDeliveryMode}
                disabled={mutation.isPending}
                testId="notif-delivery-immediate"
              />
              <DeliveryModeOption
                id="delivery-digest"
                value="digest"
                label={t.notificationPrefs.deliveryModeDigest}
                description={t.notificationPrefs.deliveryModeDigestDesc}
                selected={deliveryMode === 'digest'}
                onChange={setDeliveryMode}
                disabled={mutation.isPending}
                testId="notif-delivery-digest"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={revert}
          disabled={!dirty || mutation.isPending}
          data-testid="notif-prefs-revert"
        >
          {t.notificationPrefs.revert}
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={!dirty || mutation.isPending}
          data-testid="notif-prefs-save"
        >
          {mutation.isPending
            ? t.notificationPrefs.saving
            : t.notificationPrefs.saveAction}
        </Button>
      </div>
    </div>
  )
}

// ---- ChannelToggle ----------------------------------------------------------

type ChannelToggleProps = {
  id: string
  icon: React.ReactNode
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  testId: string
}

function ChannelToggle({
  id,
  icon,
  label,
  description,
  checked,
  onChange,
  disabled,
  testId,
}: ChannelToggleProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
    >
      <div className="mt-0.5 flex shrink-0 items-center gap-2 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <Switch
        id={id}
        className="mt-0.5"
        checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        data-testid={testId}
      />
    </label>
  )
}

// ---- DeliveryModeOption -----------------------------------------------------

type DeliveryModeOptionProps = {
  id: string
  value: DeliveryMode
  label: string
  description: string
  selected: boolean
  onChange: (v: DeliveryMode) => void
  disabled: boolean
  testId: string
}

function DeliveryModeOption({
  id,
  value,
  label,
  description,
  selected,
  onChange,
  disabled,
  testId,
}: DeliveryModeOptionProps) {
  return (
    <label
      htmlFor={id}
      className={
        'flex flex-1 cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors hover:bg-accent/50' +
        (selected ? ' border-primary bg-primary/5' : '')
      }
    >
      <input
        type="radio"
        id={id}
        name="delivery-mode"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        disabled={disabled}
        className="mt-0.5 shrink-0 accent-primary"
        data-testid={testId}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
    </label>
  )
}
