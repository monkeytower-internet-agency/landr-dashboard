import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { UserIdentity } from '@supabase/supabase-js'
import { notifyError } from '@/lib/notify'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { supabase } from '@/lib/supabase'
import { PROVIDERS, linkProvider, type ProviderConfig } from '@/lib/auth-providers'
import { t } from '@/lib/strings'

async function fetchIdentities(): Promise<UserIdentity[]> {
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error) throw error
  return data?.identities ?? []
}

type Props = {
  /** Optional: pass a className for the wrapping <Card>. */
  className?: string
}

export function ConnectedAccounts({ className }: Props) {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['user-identities'],
    queryFn: fetchIdentities,
  })

  const identities = data ?? []
  // Email identity is the operator's password account; tracked separately so
  // we always render it as the "primary" row.
  const emailIdentity = identities.find((i) => i.provider === 'email')

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t.connectedAccounts.title}</CardTitle>
        <CardDescription>{t.connectedAccounts.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-muted-foreground text-xs">
            {t.connectedAccounts.loading}
          </p>
        )}
        {error && (
          <p className="text-destructive text-xs">
            {t.connectedAccounts.error}
          </p>
        )}
        {!isLoading && !error && (
          <ul className="divide-y divide-border">
            {/* Email & password — always present as long as the user has it. */}
            {emailIdentity && (
              <EmailRow identity={emailIdentity} />
            )}
            {PROVIDERS.map((provider) => {
              const linked = identities.find((i) => i.provider === provider.id)
              return (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  identity={linked ?? null}
                  totalIdentities={identities.length}
                  onChanged={() =>
                    qc.invalidateQueries({ queryKey: ['user-identities'] })
                  }
                />
              )
            })}
            {/* Apple / GitHub follow-ups land here by appending to PROVIDERS. */}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function EmailRow({ identity }: { identity: UserIdentity }) {
  const email =
    (identity.identity_data?.email as string | undefined) ?? undefined
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-medium text-sm">{t.connectedAccounts.primaryEmail}</p>
        <p className="text-muted-foreground text-xs">
          {email ?? t.connectedAccounts.primaryEmailDescription}
        </p>
      </div>
      <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        {t.connectedAccounts.statusLinked}
      </span>
    </li>
  )
}

function ProviderRow({
  provider,
  identity,
  totalIdentities,
  onChanged,
}: {
  provider: ProviderConfig
  identity: UserIdentity | null
  totalIdentities: number
  onChanged: () => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const linked = identity != null
  // We must keep at least one identity so the user can sign back in.
  const canDisconnect = totalIdentities > 1
  const providerEmail =
    (identity?.identity_data?.email as string | undefined) ?? undefined

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await linkProvider(provider.id)
      if (error) throw error
    },
    onError: (err: Error) => {
      // landr-40x0: route through notifyError for capture + sticky toast.
      notifyError(t.connectedAccounts.toastLinkError(provider.label), {
        detail: err.message,
      })
    },
    // Success path: Supabase redirects the browser away. On return,
    // /auth/callback navigates back to Settings (via App routing), and the
    // useQuery refetch picks up the new identity.
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!identity) throw new Error('no identity to unlink')
      const { error } = await supabase.auth.unlinkIdentity(identity)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t.connectedAccounts.toastUnlinked(provider.label))
      setConfirmOpen(false)
      onChanged()
    },
    onError: (err: Error) => {
      // landr-40x0: route through notifyError for capture + sticky toast.
      notifyError(t.connectedAccounts.toastUnlinkError(provider.label), {
        detail: err.message,
      })
    },
  })

  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <img
          src={provider.logoSrc}
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
        />
        <div>
          <p className="font-medium text-sm">{provider.label}</p>
          {linked ? (
            <p className="text-muted-foreground text-xs">
              {providerEmail ?? t.connectedAccounts.statusLinked}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t.connectedAccounts.statusNotLinked}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {!linked && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending
              ? t.connectedAccounts.connecting
              : t.connectedAccounts.connect}
          </Button>
        )}
        {linked && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={!canDisconnect || disconnectMutation.isPending}
            title={
              canDisconnect
                ? undefined
                : t.connectedAccounts.disconnectDisabledTooltip
            }
          >
            {disconnectMutation.isPending
              ? t.connectedAccounts.disconnecting
              : t.connectedAccounts.disconnect}
          </Button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.connectedAccounts.confirmDisconnectTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.connectedAccounts.confirmDisconnectBody(provider.label)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t.connectedAccounts.confirmDisconnectCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                disconnectMutation.mutate()
              }}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending
                ? t.connectedAccounts.disconnecting
                : t.connectedAccounts.confirmDisconnectAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
