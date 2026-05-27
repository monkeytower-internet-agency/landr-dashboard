import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useOperator } from '@/lib/operator'
import {
  fetchGmailStatus,
  fetchGmailInstallUrl,
  disconnectGmail,
} from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// Gmail integration subsection. Lives in its own route so the OAuth
// connect/disconnect flow has a stable deep-link.
export function IntegrationsGmailSettings() {
  const { currentOperatorId } = useOperator()

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.integrationsGmail },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.integrationsGmail}
      />
      {currentOperatorId ? (
        <GmailCard operatorId={currentOperatorId} />
      ) : (
        <div className="text-muted-foreground p-6">{t.settings.noOperator}</div>
      )}
    </>
  )
}

function GmailCard({ operatorId }: { operatorId: string }) {
  const qc = useQueryClient()
  const popupRef = useRef<Window | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['operator-gmail-status', operatorId],
    queryFn: () => fetchGmailStatus(operatorId),
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
      toast.error(t.settings.gmailConnectError, { description: err.message })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGmail(operatorId),
    onSuccess: () => {
      toast.success(t.settings.gmailDisconnected)
      qc.invalidateQueries({ queryKey: ['operator-gmail-status', operatorId] })
    },
    onError: (err: Error) => {
      toast.error(t.settings.gmailDisconnectError, { description: err.message })
    },
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.settings.sectionIntegrations}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.sectionIntegrations}</CardTitle>
          <CardDescription>{t.settings.sectionIntegrationsDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Gmail</p>
              {isLoading && (
                <p className="text-muted-foreground text-xs">
                  {t.settings.gmailLoading}
                </p>
              )}
              {error && (
                <p className="text-destructive text-xs">{t.settings.gmailError}</p>
              )}
              {data && !data.connected && (
                <p className="text-muted-foreground text-xs">
                  {t.settings.gmailNotConnected}
                </p>
              )}
              {data?.connected && (
                <div className="text-muted-foreground space-y-0.5 text-xs">
                  <p>{data.email_address}</p>
                  {data.connected_at && (
                    <p>
                      {t.settings.gmailConnectedAt}{' '}
                      {new Date(data.connected_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {!data?.connected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    popupRef.current = window.open('about:blank', '_blank', 'noopener,noreferrer')
                    connectMutation.mutate()
                  }}
                  disabled={connectMutation.isPending || isLoading}
                >
                  {connectMutation.isPending
                    ? t.settings.gmailConnecting
                    : t.settings.gmailConnect}
                </Button>
              )}
              {data?.connected && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending
                    ? t.settings.gmailDisconnecting
                    : t.settings.gmailDisconnect}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
