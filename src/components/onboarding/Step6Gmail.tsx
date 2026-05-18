import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  fetchGmailInstallUrl,
  fetchGmailStatus,
  type GmailStatus,
} from '@/lib/operatorSettings'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

type Props = {
  operatorId: string
  onAdvance: () => void
  onBack: () => void
}

export function Step6Gmail({ operatorId, onAdvance, onBack }: Props) {
  const { data, isLoading } = useQuery<GmailStatus>({
    queryKey: ['operator-gmail-status', operatorId],
    queryFn: () => fetchGmailStatus(operatorId),
    enabled: !!operatorId,
  })

  const connectMutation = useMutation({
    mutationFn: () => fetchGmailInstallUrl(operatorId),
    onSuccess: ({ install_url }) => {
      window.location.href = install_url
    },
    onError: (err: Error) =>
      toast.error(t.onboarding.step6.connectError, { description: err.message }),
  })

  const connected = !!data?.connected

  return (
    <StepShell heading={t.onboarding.step6.heading} body={t.onboarding.step6.body}>
      <div className="rounded-md border border-border p-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground">{t.onboarding.step6.loading}</p>
        )}
        {!isLoading && connected && (
          <p className="text-sm">
            {t.onboarding.step6.connectedAs(data?.email_address ?? '—')}
          </p>
        )}
        {!isLoading && !connected && (
          <p className="text-sm text-muted-foreground">{t.settings.gmailNotConnected}</p>
        )}
        <div className="pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending || isLoading}
          >
            {connectMutation.isPending
              ? t.onboarding.step6.connecting
              : connected
              ? t.onboarding.step6.reconnect
              : t.onboarding.step6.connect}
          </Button>
        </div>
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t.onboarding.back}
        </Button>
        <Button type="button" onClick={onAdvance}>
          {connected ? t.onboarding.next : t.onboarding.skip}
        </Button>
      </div>
    </StepShell>
  )
}
