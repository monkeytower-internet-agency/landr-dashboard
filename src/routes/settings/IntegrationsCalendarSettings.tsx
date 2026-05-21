import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CopyIcon, RefreshCcwIcon } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { useOperator } from '@/lib/operator'
import {
  fetchOperatorIcalToken,
  regenerateOperatorIcalToken,
  type OperatorIcalToken,
} from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// landr-6ybs — Calendar feed subsection. Renders the subscribe URL
// with a Copy button, a Regenerate button (gated behind an
// AlertDialog warning) and per-client instructions for Google / Apple
// / Outlook. The URL is fetched on mount (the API auto-creates the
// token row on first read) so operators see a working URL the first
// time they land on the page — no explicit "enable" step.
export function IntegrationsCalendarSettings() {
  const { currentOperatorId } = useOperator()

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.integrationsCalendar },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.integrationsCalendar}
      />
      {currentOperatorId ? (
        <CalendarFeedCard operatorId={currentOperatorId} />
      ) : (
        <div className="text-muted-foreground p-6">{t.settings.noOperator}</div>
      )}
    </>
  )
}

function CalendarFeedCard({ operatorId }: { operatorId: string }) {
  const qc = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const queryKey = ['operator-ical-token', operatorId] as const

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchOperatorIcalToken(operatorId),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateOperatorIcalToken(operatorId),
    onSuccess: (fresh: OperatorIcalToken) => {
      // Optimistically swap the cached URL so the input updates the
      // instant the mutation resolves (instead of waiting for the
      // refetch round-trip).
      qc.setQueryData(queryKey, fresh)
      toast.success(t.settings.calendarFeedRegenerated)
      setConfirmOpen(false)
    },
    onError: (err: Error) => {
      toast.error(t.settings.calendarFeedRegenerateError, {
        description: err.message,
      })
    },
  })

  async function handleCopy() {
    if (!data?.url) return
    try {
      await navigator.clipboard.writeText(data.url)
      toast.success(t.settings.calendarFeedCopied)
    } catch {
      // Older browsers / non-secure contexts: clipboard API can throw.
      toast.error(t.settings.calendarFeedCopyError)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.calendarFeedTitle}</CardTitle>
          <CardDescription>
            {t.settings.calendarFeedDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calendar-feed-url">
              {t.settings.calendarFeedUrlLabel}
            </Label>
            {isLoading && (
              <p className="text-muted-foreground text-xs">
                {t.settings.calendarFeedLoading}
              </p>
            )}
            {error && (
              <p className="text-destructive text-xs">
                {t.settings.calendarFeedError}
              </p>
            )}
            {data?.url && (
              <div className="flex gap-2">
                <Input
                  id="calendar-feed-url"
                  readOnly
                  value={data.url}
                  // Pre-select on focus so the operator can ctrl/cmd-C
                  // when the clipboard API path fails (older browsers,
                  // non-https previews, etc.).
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  aria-label={t.settings.calendarFeedCopy}
                >
                  <CopyIcon className="h-4 w-4" />
                  <span className="ml-1.5 hidden sm:inline">
                    {t.settings.calendarFeedCopy}
                  </span>
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!data?.url || regenerateMutation.isPending}
            >
              <RefreshCcwIcon className="mr-1.5 h-4 w-4" />
              {regenerateMutation.isPending
                ? t.settings.calendarFeedRegenerating
                : t.settings.calendarFeedRegenerate}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.calendarFeedInstructionsHeading}</CardTitle>
          <CardDescription>
            {t.settings.calendarFeedInstructionsIntro}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <InstructionsSection
            heading={t.settings.calendarFeedGoogleHeading}
            steps={t.settings.calendarFeedGoogleSteps}
          />
          <InstructionsSection
            heading={t.settings.calendarFeedAppleHeading}
            steps={t.settings.calendarFeedAppleSteps}
          />
          <InstructionsSection
            heading={t.settings.calendarFeedOutlookHeading}
            steps={t.settings.calendarFeedOutlookSteps}
          />
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.settings.calendarFeedRegenerateConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.calendarFeedRegenerateConfirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerateMutation.isPending}>
              {t.settings.calendarFeedRegenerateCancelCta}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={regenerateMutation.isPending}
              onClick={(e) => {
                // AlertDialogAction default closes the dialog before
                // the mutation resolves; preventDefault keeps it open
                // so the spinner stays visible until the new URL lands.
                e.preventDefault()
                regenerateMutation.mutate()
              }}
              variant="destructive"
            >
              {regenerateMutation.isPending
                ? t.settings.calendarFeedRegenerating
                : t.settings.calendarFeedRegenerateConfirmCta}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function InstructionsSection({
  heading,
  steps,
}: {
  heading: string
  steps: readonly string[]
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  )
}
