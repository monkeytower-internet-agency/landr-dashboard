import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
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
  const popupRef = useRef<Window | null>(null)

  const { data, isLoading } = useQuery<GmailStatus>({
    queryKey: ['operator-gmail-status', operatorId],
    queryFn: () => fetchGmailStatus(operatorId),
    enabled: !!operatorId,
    refetchOnWindowFocus: true,
  })

  const connectMutation = useMutation({
    mutationFn: () => fetchGmailInstallUrl(operatorId),
    onSuccess: ({ install_url }) => {
      if (popupRef.current) {
        popupRef.current.location.href = install_url
      } else {
        window.location.href = install_url
      }
    },
    onError: (err: Error) => {
      popupRef.current?.close()
      popupRef.current = null
      toast.error(t.onboarding.step6.connectError, { description: err.message })
    },
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
            onClick={() => {
              // Open the OAuth popup synchronously (before the async install_url
              // fetch) so it isn't blocked. Do NOT pass 'noopener' — that makes
              // window.open return null, which fell through to a full-tab redirect
              // (the dashboard tab got eaten + a blank tab opened). We need the
              // handle to navigate the popup in onSuccess.
              popupRef.current = window.open('about:blank', 'landr-gmail-oauth', 'popup,width=520,height=680')
              connectMutation.mutate()
            }}
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
