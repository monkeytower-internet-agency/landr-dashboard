import { useState } from 'react'
import { UserPlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StaffEditSheet } from '@/components/StaffEditSheet'
import { StaffInviteSheet } from '@/components/StaffInviteSheet'
import { StaffRevokeDialog } from '@/components/StaffRevokeDialog'
import { StaffTable } from '@/components/StaffTable'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { fetchStaff, type StaffRow } from '@/lib/staff'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

export function Staff() {
  const { currentOperatorId } = useOperator()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<StaffRow | null>(null)

  const query = useRealtimeQuery<StaffRow[]>({
    queryKey: ['staff', currentOperatorId ?? 'none'],
    queryFn: () => fetchStaff(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'operator_memberships',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  const rows = query.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.team },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.team}
      />
      <header className="flex items-center justify-end gap-4">
        <Button
          type="button"
          onClick={() => setInviteOpen(true)}
          disabled={!currentOperatorId}
        >
          <UserPlusIcon className="size-4" />
          {t.staff.actionInvite}
        </Button>
      </header>

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.staff.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.staff.loading}</p>
      ) : (
        <StaffTable
          rows={rows}
          onEdit={(row) => setEditTarget(row)}
          onRevoke={(row) => setRevokeTarget(row)}
        />
      )}

      <StaffInviteSheet
        operatorId={currentOperatorId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
      <StaffEditSheet
        member={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      />
      <StaffRevokeDialog
        member={revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
      />
    </div>
  )
}
