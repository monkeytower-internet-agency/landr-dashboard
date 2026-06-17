// landr-resend-sender — Account → Email sending.
//
// Per-operator Resend sending domain: the operator connects their OWN domain
// so booking emails send from e.g. bookings@para42.com instead of a Landr
// fallback address. Three states drive the UI off GET /api/operator/email-sender:
//
//   1. Unconfigured (`configured === false`) — explainer + a setup form that
//      POSTs /setup with the sending domain + optional From local part.
//   2. After setup, not yet verified — show the DNS records. If autoDNS/
//      Cloudflare pushed them for us (`dns_provider !== 'manual'`), show a
//      "records added automatically — verifying…" notice + Re-check; otherwise
//      render the records in a copy-per-value table + a Verify button.
//   3. Configured — a status badge (verified/pending/failed), the active From
//      address, and a way to re-verify or change the domain. Until verified we
//      note that emails still send from the Landr fallback address.
//
// See @/lib/email-sender for the typed client + hooks, and the landr-api
// router app/routers/operator_email_sender.py for the field contract.

import { useMemo, useRef, useState } from 'react'
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  SendIcon,
  XCircleIcon,
} from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOperator } from '@/lib/operator'
import {
  DEFAULT_FROM_LOCAL_PART,
  fetchEmailSenderEligibility,
  useEmailSenderConfig,
  useSetupEmailSender,
  useSendEmailSenderTest,
  useVerifyEmailSender,
  type EmailSenderConfig,
  type EmailSenderDnsRecord,
  type EmailSenderEligibility,
  type EmailSenderVerificationStatus,
  type TestEmailResult,
} from '@/lib/email-sender'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function EmailSenderSettings() {
  const { currentOperatorId } = useOperator()

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.accountHub.navLabel, to: '/account' },
          { label: t.settingsHub.sections.emailSender },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.emailSender}
      />
      {currentOperatorId ? (
        <EmailSenderPanel operatorId={currentOperatorId} />
      ) : (
        <div className="text-muted-foreground p-6">{t.settings.noOperator}</div>
      )}
    </>
  )
}

function EmailSenderPanel({ operatorId }: { operatorId: string }) {
  const { data, isLoading, error } = useEmailSenderConfig(operatorId)

  if (isLoading) {
    return (
      <div className="text-muted-foreground p-6">
        {t.emailSenderSettings.loading}
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="text-destructive p-6">
        {t.emailSenderSettings.errorTitle}
        {error ? ` — ${(error as Error).message}` : ''}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {data.configured ? (
        <ConfiguredView operatorId={operatorId} config={data} />
      ) : (
        <SetupForm operatorId={operatorId} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unconfigured — explainer + setup form
// ---------------------------------------------------------------------------

// Light client-side domain shape check. Intentionally permissive — the server
// is the source of truth; this only catches the obvious "they typed an email
// address" / empty-string mistakes before we round-trip.
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i

function normaliseDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

function SetupForm({ operatorId }: { operatorId: string }) {
  const [domain, setDomain] = useState('')
  const [localPart, setLocalPart] = useState('')
  const [domainError, setDomainError] = useState<string | null>(null)
  const setup = useSetupEmailSender(operatorId)

  // Eligibility pre-check state (landr-oqrz.6)
  const [eligibility, setEligibility] = useState<EmailSenderEligibility | null>(null)
  const [eligibilityChecking, setEligibilityChecking] = useState(false)
  // Track which domain the last check was for so we clear the hint if it changes.
  const eligibilityDomainRef = useRef<string>('')

  const effectiveLocalPart = localPart.trim() || DEFAULT_FROM_LOCAL_PART
  const cleanDomain = normaliseDomain(domain)
  const preview = cleanDomain
    ? `${effectiveLocalPart}@${cleanDomain}`
    : null

  function handleDomainChange(raw: string) {
    setDomain(raw)
    if (domainError) setDomainError(null)
    // Clear eligibility hint when the operator edits the domain.
    const normalised = normaliseDomain(raw)
    if (normalised !== eligibilityDomainRef.current) {
      setEligibility(null)
      eligibilityDomainRef.current = ''
    }
  }

  async function handleCheckDomain() {
    const d = normaliseDomain(domain)
    if (!d) {
      setDomainError(t.emailSenderSettings.domainRequired)
      return
    }
    if (!DOMAIN_RE.test(d)) {
      setDomainError(t.emailSenderSettings.domainInvalid)
      return
    }
    setDomainError(null)
    setEligibilityChecking(true)
    try {
      const result = await fetchEmailSenderEligibility(d)
      setEligibility(result)
      eligibilityDomainRef.current = d
    } catch {
      // Silently ignore — the eligibility check is optional/informational.
      setEligibility(null)
    } finally {
      setEligibilityChecking(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const d = normaliseDomain(domain)
    if (!d) {
      setDomainError(t.emailSenderSettings.domainRequired)
      return
    }
    if (!DOMAIN_RE.test(d)) {
      setDomainError(t.emailSenderSettings.domainInvalid)
      return
    }
    setDomainError(null)
    const trimmedLocal = localPart.trim()
    setup.mutate(
      {
        sending_domain: d,
        ...(trimmedLocal ? { from_local_part: trimmedLocal } : {}),
      },
      {
        onError: (err: Error) => {
          toast.error(t.emailSenderSettings.setupError, {
            description: err.message,
          })
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SendIcon className="size-4" aria-hidden />
          {t.emailSenderSettings.introTitle}
        </CardTitle>
        <CardDescription>{t.emailSenderSettings.introBody}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email-sender-domain">
              {t.emailSenderSettings.domainLabel}
            </Label>
            <div className="flex gap-2">
              <Input
                id="email-sender-domain"
                value={domain}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t.emailSenderSettings.domainPlaceholder}
                onChange={(e) => handleDomainChange(e.target.value)}
                aria-invalid={domainError ? 'true' : undefined}
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCheckDomain}
                disabled={eligibilityChecking || !domain.trim()}
                data-testid="check-domain-button"
              >
                {eligibilityChecking
                  ? t.emailSenderSettings.checkDomainChecking
                  : t.emailSenderSettings.checkDomainButton}
              </Button>
            </div>
            {domainError ? (
              <p className="text-destructive text-xs" role="alert">
                {domainError}
              </p>
            ) : eligibility ? (
              <p
                className={
                  eligibility.path === 'auto'
                    ? 'text-xs text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground text-xs'
                }
                role="status"
                data-testid="eligibility-hint"
              >
                {eligibility.path === 'auto'
                  ? t.emailSenderSettings.checkDomainHintAuto
                  : t.emailSenderSettings.checkDomainHintManual}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {t.emailSenderSettings.domainHint}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-sender-local">
              {t.emailSenderSettings.localPartLabel}
            </Label>
            <Input
              id="email-sender-local"
              value={localPart}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t.emailSenderSettings.localPartPlaceholder}
              onChange={(e) => setLocalPart(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-muted-foreground text-xs">
              {t.emailSenderSettings.localPartHint}
            </p>
          </div>

          <div className="bg-muted/50 rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs">
              {t.emailSenderSettings.previewLabel}
            </p>
            {preview ? (
              <p className="font-mono text-sm" data-testid="email-sender-preview">
                {preview}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t.emailSenderSettings.previewPending}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={setup.isPending}>
              {setup.isPending
                ? t.emailSenderSettings.setupSubmitting
                : t.emailSenderSettings.setupButton}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Configured — status + From + DNS records / verify
// ---------------------------------------------------------------------------

function ConfiguredView({
  operatorId,
  config,
}: {
  operatorId: string
  config: EmailSenderConfig
}) {
  const verify = useVerifyEmailSender(operatorId)
  // Let the operator drop back into the setup form to point at a different
  // domain (a fresh /setup upserts the row in place server-side).
  const [changing, setChanging] = useState(false)

  if (changing) {
    return <SetupForm operatorId={operatorId} />
  }

  const status = config.verification_status
  const isVerified = status === 'verified'
  // Show the DNS records / verify affordances until the domain is verified.
  const showDnsStep = !isVerified

  function handleVerify() {
    verify.mutate(undefined, {
      onError: (err: Error) => {
        toast.error(t.emailSenderSettings.verifyError, {
          description: err.message,
        })
      },
    })
  }

  const manual = config.dns_provider === 'manual' || config.dns_provider == null
  const records = config.dns_records ?? []

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <SendIcon className="size-4" aria-hidden />
              {config.sending_domain}
            </span>
            <StatusBadge status={status} />
          </CardTitle>
          <CardDescription>
            <span className="text-muted-foreground">
              {t.emailSenderSettings.activeFromLabel}:{' '}
            </span>
            <span className="text-foreground font-mono">
              {config.from_address ??
                `${config.from_local_part ?? DEFAULT_FROM_LOCAL_PART}@${config.sending_domain ?? ''}`}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isVerified && (
            <div
              className="bg-muted text-muted-foreground rounded-md border px-3 py-2 text-xs"
              role="status"
            >
              {t.emailSenderSettings.fallbackNotice}
            </div>
          )}

          {status === 'failed' && config.last_error && (
            <div
              className="text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-xs"
              role="alert"
            >
              <span className="font-medium">
                {t.emailSenderSettings.lastErrorLabel}:{' '}
              </span>
              {config.last_error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleVerify}
              disabled={verify.isPending}
            >
              {verify.isPending
                ? t.emailSenderSettings.verifying
                : isVerified
                  ? t.emailSenderSettings.reverifyButton
                  : t.emailSenderSettings.verifyButton}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setChanging(true)}
            >
              {t.emailSenderSettings.changeDomainButton}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showDnsStep &&
        (manual ? (
          <ManualDnsCard
            records={records}
            onVerify={handleVerify}
            verifying={verify.isPending}
          />
        ) : (
          <AutoDnsCard onRecheck={handleVerify} rechecking={verify.isPending} />
        ))}

      {isVerified && <TestEmailCard operatorId={operatorId} />}
    </>
  )
}

function StatusBadge({
  status,
}: {
  status: EmailSenderVerificationStatus | null
}) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2Icon className="size-4" aria-hidden />
        {t.emailSenderSettings.statusVerified}
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="text-destructive inline-flex items-center gap-1.5 text-sm font-medium">
        <AlertCircleIcon className="size-4" aria-hidden />
        {t.emailSenderSettings.statusFailed}
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
        <ClockIcon className="size-4" aria-hidden />
        {t.emailSenderSettings.statusPending}
      </span>
    )
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <ClockIcon className="size-4" aria-hidden />
      {t.emailSenderSettings.statusUnverified}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DNS step — autoDNS (one-click) vs manual (copy records)
// ---------------------------------------------------------------------------

function AutoDnsCard({
  onRecheck,
  rechecking,
}: {
  onRecheck: () => void
  rechecking: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2Icon className="size-4" aria-hidden />
          {t.emailSenderSettings.autodnsTitle}
        </CardTitle>
        <CardDescription>{t.emailSenderSettings.autodnsBody}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" size="sm" variant="outline" onClick={onRecheck} disabled={rechecking}>
          {rechecking
            ? t.emailSenderSettings.verifying
            : t.emailSenderSettings.recheckButton}
        </Button>
      </CardContent>
    </Card>
  )
}

function ManualDnsCard({
  records,
  onVerify,
  verifying,
}: {
  records: EmailSenderDnsRecord[]
  onVerify: () => void
  verifying: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.emailSenderSettings.manualTitle}</CardTitle>
        <CardDescription>{t.emailSenderSettings.manualBody}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="text-muted-foreground space-y-1 text-sm list-decimal list-inside">
          {t.emailSenderSettings.manualSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">
                  {t.emailSenderSettings.dnsColType}
                </TableHead>
                <TableHead>{t.emailSenderSettings.dnsColName}</TableHead>
                <TableHead>{t.emailSenderSettings.dnsColValue}</TableHead>
                <TableHead className="w-16 sr-only">
                  {t.emailSenderSettings.copyRow}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record, i) => (
                <DnsRow key={`${record.type}-${record.name}-${i}`} record={record} />
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onVerify} disabled={verifying}>
            {verifying
              ? t.emailSenderSettings.verifying
              : t.emailSenderSettings.verifyButton}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DnsRow({ record }: { record: EmailSenderDnsRecord }) {
  // Resend names DNS records as a bare host (e.g. "resend._domainkey"); render
  // verbatim so the operator can paste exactly what their DNS provider wants.
  const valueText = useMemo(() => String(record.value ?? ''), [record.value])
  const rowText = useMemo(
    () => `${record.type.toUpperCase()} / ${record.name} / ${valueText}`,
    [record.type, record.name, valueText],
  )

  async function handleCopyValue() {
    try {
      await navigator.clipboard.writeText(valueText)
      toast.success(t.emailSenderSettings.copied)
    } catch {
      toast.error(t.emailSenderSettings.copyFailed)
    }
  }

  async function handleCopyRow() {
    try {
      await navigator.clipboard.writeText(rowText)
      toast.success(t.emailSenderSettings.copied)
    } catch {
      toast.error(t.emailSenderSettings.copyFailed)
    }
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs uppercase">
        {record.type}
      </TableCell>
      <TableCell className="font-mono text-xs break-all">
        {record.name}
      </TableCell>
      <TableCell>
        <div className="flex items-start gap-2">
          <span className="font-mono text-xs break-all">{valueText}</span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="shrink-0"
            aria-label={t.emailSenderSettings.copyValue}
            onClick={handleCopyValue}
          >
            <CopyIcon className="size-3" aria-hidden />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0"
          aria-label={t.emailSenderSettings.copyRow}
          onClick={handleCopyRow}
        >
          <CopyIcon className="size-3" aria-hidden />
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Test email card — visible only when domain is verified (landr-gp0v)
// ---------------------------------------------------------------------------

function TestEmailCard({ operatorId }: { operatorId: string }) {
  const [to, setTo] = useState('')
  const [result, setResult] = useState<TestEmailResult | null>(null)
  const mutation = useSendEmailSenderTest(operatorId)

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = to.trim()
    if (!trimmed) return
    setResult(null)
    mutation.mutate(trimmed, {
      onSuccess: (res) => setResult(res),
      onError: (err: Error) => {
        // Network / unexpected failure — surface as a failed result so the UI
        // stays consistent (no toast needed; the log line appears inline).
        setResult({
          status: 'failed',
          detail: err.message,
          message_id: null,
          from_address: null,
        })
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SendIcon className="size-4" aria-hidden />
          {t.emailSenderSettings.testEmailTitle}
        </CardTitle>
        <CardDescription>
          {t.emailSenderSettings.testEmailDescription}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="test-email-to">
              {t.emailSenderSettings.testEmailLabel}
            </Label>
            <div className="flex gap-2">
              <Input
                id="test-email-to"
                type="email"
                value={to}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={t.emailSenderSettings.testEmailPlaceholder}
                onChange={(e) => {
                  setTo(e.target.value)
                  if (result) setResult(null)
                }}
                className="font-mono text-sm"
              />
              <Button
                type="submit"
                size="sm"
                disabled={mutation.isPending || !to.trim()}
                data-testid="send-test-email-button"
              >
                {mutation.isPending
                  ? t.emailSenderSettings.testEmailSending
                  : t.emailSenderSettings.testEmailButton}
              </Button>
            </div>
          </div>

          {result && (
            <div
              role="status"
              data-testid="test-email-result"
              className={
                result.status === 'sent'
                  ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'text-destructive border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm'
              }
            >
              {result.status === 'sent' ? (
                <p className="flex items-start gap-1.5">
                  <CheckCircle2Icon
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">
                      {t.emailSenderSettings.testEmailSuccessPrefix}
                    </span>{' '}
                    {result.detail}
                    {result.message_id && (
                      <span className="text-emerald-700 dark:text-emerald-400 ml-1 text-xs">
                        {t.emailSenderSettings.testEmailMessageId}{' '}
                        <span className="font-mono">{result.message_id}</span>
                      </span>
                    )}
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-1.5">
                  <XCircleIcon
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">
                      {t.emailSenderSettings.testEmailFailedPrefix}
                    </span>{' '}
                    {result.detail}
                  </span>
                </p>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
