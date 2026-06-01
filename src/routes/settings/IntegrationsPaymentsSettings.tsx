import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircleIcon, CircleIcon } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOperator } from '@/lib/operator'
import {
  fetchIntegrationCredentials,
  upsertHoldedCredential,
  upsertStripeCredential,
  type HoldedMode,
  type IntegrationCredential,
  type StripeMode,
} from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// landr-1nwu.2 — Settings → Payments & invoicing. The operator enters/rotates
// their OWN Stripe (test+live) + Holded (demo+live) integration keys.
//
// SECURITY: the API stores secrets encrypted at rest and NEVER returns a
// decrypted secret — the masked-read endpoint returns only the NON-secret
// Stripe publishable key plus has_* booleans. This page therefore renders
// secrets WRITE-ONLY: "Configured" when set, a plaintext input to rotate /
// replace, never the stored value. The publishable key (non-secret) is shown.
export function IntegrationsPaymentsSettings() {
  const { currentOperatorId } = useOperator()

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.integrationsPayments },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.integrationsPayments}
      />
      {currentOperatorId ? (
        <PaymentsCredentials operatorId={currentOperatorId} />
      ) : (
        <div className="text-muted-foreground p-6">{t.settings.noOperator}</div>
      )}
    </>
  )
}

const QUERY_KEY = (operatorId: string) =>
  ['operator-integration-credentials', operatorId] as const

// A Stripe mode counts as "configured" once ANY of its keys are on file. The
// publishable key is non-secret and returned verbatim; the secret + webhook
// keys are write-only, so we rely on the has_* booleans the API exposes.
function stripeConfigured(c?: IntegrationCredential): boolean {
  return (
    !!c &&
    (c.has_secret_key || c.has_webhook_secret || !!c.stripe_publishable_key)
  )
}

function holdedConfigured(c?: IntegrationCredential): boolean {
  return !!c?.has_holded_key
}

// At-a-glance per-mode status. "Configured" means credentials are STORED — not
// that they have been live-verified against the provider (a separate feature).
function ModeStatus({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircleIcon className="size-4" aria-hidden />
        {t.settings.paymentsModeConfigured}
      </span>
    )
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <CircleIcon className="size-4" aria-hidden />
      {t.settings.paymentsModeNotConfigured}
    </span>
  )
}

// Small green check shown on a tab trigger when that mode is configured, so the
// operator sees which modes are set up without clicking into each tab.
function TabCheck({ configured }: { configured: boolean }) {
  if (!configured) return null
  return (
    <CheckCircleIcon
      className="size-3.5 text-emerald-600 dark:text-emerald-400"
      aria-hidden
    />
  )
}

function PaymentsCredentials({ operatorId }: { operatorId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY(operatorId),
    queryFn: () => fetchIntegrationCredentials(operatorId),
  })

  // Index masked rows by `${provider}:${mode}` for O(1) lookup per tab.
  const byKey = useMemo(() => {
    const m = new Map<string, IntegrationCredential>()
    for (const row of data ?? []) m.set(`${row.provider}:${row.mode}`, row)
    return m
  }, [data])

  if (isLoading) {
    return (
      <div className="text-muted-foreground p-6">{t.settings.paymentsLoading}</div>
    )
  }
  if (error) {
    return <div className="text-destructive p-6">{t.settings.paymentsError}</div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.paymentsStripeTitle}</CardTitle>
          <CardDescription>
            {t.settings.paymentsStripeDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="test">
            <TabsList variant="pill">
              <TabsTrigger variant="pill" value="test" className="gap-1.5">
                {t.settings.paymentsModeTest}
                <TabCheck
                  configured={stripeConfigured(byKey.get('stripe:test'))}
                />
              </TabsTrigger>
              <TabsTrigger variant="pill" value="live" className="gap-1.5">
                {t.settings.paymentsModeLive}
                <TabCheck
                  configured={stripeConfigured(byKey.get('stripe:live'))}
                />
              </TabsTrigger>
            </TabsList>
            {(['test', 'live'] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4 pt-4">
                <ModeStatus
                  configured={stripeConfigured(byKey.get(`stripe:${mode}`))}
                />
                <StripeModeForm
                  operatorId={operatorId}
                  mode={mode}
                  credential={byKey.get(`stripe:${mode}`)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.paymentsHoldedTitle}</CardTitle>
          <CardDescription>
            {t.settings.paymentsHoldedDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="demo">
            <TabsList variant="pill">
              <TabsTrigger variant="pill" value="demo" className="gap-1.5">
                {t.settings.paymentsModeDemo}
                <TabCheck
                  configured={holdedConfigured(byKey.get('holded:demo'))}
                />
              </TabsTrigger>
              <TabsTrigger variant="pill" value="live" className="gap-1.5">
                {t.settings.paymentsModeLive}
                <TabCheck
                  configured={holdedConfigured(byKey.get('holded:live'))}
                />
              </TabsTrigger>
            </TabsList>
            {(['demo', 'live'] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4 pt-4">
                <ModeStatus
                  configured={holdedConfigured(byKey.get(`holded:${mode}`))}
                />
                <HoldedModeForm
                  operatorId={operatorId}
                  mode={mode}
                  credential={byKey.get(`holded:${mode}`)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        {t.settings.paymentsSecretNeverShown}
      </p>
    </div>
  )
}

// --- shared write-only secret field ----------------------------------------

// A secret field the API never returns. When `configured`, we show
// "Configured ••••" + a Rotate button that reveals an input; otherwise we show
// the input directly. The entered value bubbles up via onChange; an empty
// string means "leave untouched".
function SecretField({
  id,
  label,
  configured,
  value,
  onChange,
}: {
  id: string
  label: string
  configured: boolean
  value: string
  onChange: (v: string) => void
}) {
  // Open the editor immediately when nothing is stored yet; otherwise the
  // operator must click Rotate to reveal the input (avoids accidental edits).
  const [editing, setEditing] = useState(!configured)

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {configured && !editing ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">
            {t.settings.paymentsConfigured}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            {t.settings.paymentsRotate}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="password"
            autoComplete="off"
            value={value}
            placeholder={
              configured
                ? t.settings.paymentsSecretRotatePlaceholder
                : t.settings.paymentsSecretEnterPlaceholder
            }
            onChange={(e) => onChange(e.target.value)}
          />
          {configured && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange('')
                setEditing(false)
              }}
            >
              {t.settings.paymentsRotateCancel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function LastUpdated({ credential }: { credential?: IntegrationCredential }) {
  if (!credential?.updated_at) return null
  return (
    <p className="text-muted-foreground text-xs">
      {t.settings.paymentsLastUpdated(
        new Date(credential.updated_at).toLocaleString(),
      )}
    </p>
  )
}

// --- Stripe (test/live) -----------------------------------------------------

function StripeModeForm({
  operatorId,
  mode,
  credential,
}: {
  operatorId: string
  mode: StripeMode
  credential?: IntegrationCredential
}) {
  const qc = useQueryClient()
  // Publishable key is NON-secret — prefill with the stored value so the
  // operator can edit it in place.
  const [publishable, setPublishable] = useState(
    credential?.stripe_publishable_key ?? '',
  )
  const [secret, setSecret] = useState('')
  const [webhook, setWebhook] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const body: {
        stripe_publishable_key?: string
        stripe_secret_key?: string
        stripe_webhook_secret?: string
      } = {}
      const trimmedPub = publishable.trim()
      // Only send the publishable key if it actually changed (it's prefilled).
      if (trimmedPub && trimmedPub !== (credential?.stripe_publishable_key ?? '')) {
        body.stripe_publishable_key = trimmedPub
      }
      if (secret.trim()) body.stripe_secret_key = secret.trim()
      if (webhook.trim()) body.stripe_webhook_secret = webhook.trim()
      return upsertStripeCredential(operatorId, mode, body)
    },
    onSuccess: () => {
      toast.success(t.settings.paymentsSaved)
      // Clear the secret inputs so they never linger in the DOM.
      setSecret('')
      setWebhook('')
      qc.invalidateQueries({ queryKey: QUERY_KEY(operatorId) })
    },
    onError: (err: Error) => {
      toast.error(t.settings.paymentsSaveError, { description: err.message })
    },
  })

  const hasChange =
    (publishable.trim() &&
      publishable.trim() !== (credential?.stripe_publishable_key ?? '')) ||
    secret.trim().length > 0 ||
    webhook.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasChange) {
      toast.error(t.settings.paymentsNothingToSave)
      return
    }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`stripe-pub-${mode}`}>
          {t.settings.paymentsStripePublishableLabel}
        </Label>
        <Input
          id={`stripe-pub-${mode}`}
          value={publishable}
          autoComplete="off"
          placeholder={
            mode === 'live'
              ? t.settings.paymentsStripePublishablePlaceholderLive
              : t.settings.paymentsStripePublishablePlaceholderTest
          }
          onChange={(e) => setPublishable(e.target.value)}
        />
      </div>
      <SecretField
        id={`stripe-secret-${mode}`}
        label={t.settings.paymentsStripeSecretLabel}
        configured={credential?.has_secret_key ?? false}
        value={secret}
        onChange={setSecret}
      />
      <SecretField
        id={`stripe-webhook-${mode}`}
        label={t.settings.paymentsStripeWebhookLabel}
        configured={credential?.has_webhook_secret ?? false}
        value={webhook}
        onChange={setWebhook}
      />
      <div className="flex items-center justify-between gap-3 pt-1">
        <LastUpdated credential={credential} />
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? t.settings.paymentsSaving : t.settings.paymentsSave}
        </Button>
      </div>
    </form>
  )
}

// --- Holded (demo/live) -----------------------------------------------------

function HoldedModeForm({
  operatorId,
  mode,
  credential,
}: {
  operatorId: string
  mode: HoldedMode
  credential?: IntegrationCredential
}) {
  const qc = useQueryClient()
  const [apiKey, setApiKey] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      upsertHoldedCredential(operatorId, mode, {
        holded_api_key: apiKey.trim(),
      }),
    onSuccess: () => {
      toast.success(t.settings.paymentsSaved)
      setApiKey('')
      qc.invalidateQueries({ queryKey: QUERY_KEY(operatorId) })
    },
    onError: (err: Error) => {
      toast.error(t.settings.paymentsSaveError, { description: err.message })
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) {
      toast.error(t.settings.paymentsNothingToSave)
      return
    }
    mutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SecretField
        id={`holded-key-${mode}`}
        label={t.settings.paymentsHoldedApiKeyLabel}
        configured={credential?.has_holded_key ?? false}
        value={apiKey}
        onChange={setApiKey}
      />
      <div className="flex items-center justify-between gap-3 pt-1">
        <LastUpdated credential={credential} />
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? t.settings.paymentsSaving : t.settings.paymentsSave}
        </Button>
      </div>
    </form>
  )
}
