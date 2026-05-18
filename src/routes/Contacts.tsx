import { useState } from 'react'
import { ContactAuditSheet } from '@/components/ContactAuditSheet'
import { ContactsTable } from '@/components/ContactsTable'
import { GdprEraseDialog } from '@/components/GdprEraseDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchContacts, type ContactRow } from '@/lib/contacts'
import { useOperator } from '@/lib/operator'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

export function Contacts() {
  const { currentOperatorId } = useOperator()
  const [eraseTarget, setEraseTarget] = useState<ContactRow | null>(null)
  const [auditTarget, setAuditTarget] = useState<ContactRow | null>(null)

  const query = useRealtimeQuery<ContactRow[]>({
    queryKey: ['contacts', currentOperatorId ?? 'none'],
    queryFn: () => fetchContacts(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'contacts',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  const rows = query.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.contacts.title}</h1>
      </header>
      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.contacts.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.contacts.loading}</p>
      ) : (
        <ContactsTable
          rows={rows}
          onErase={(row) => setEraseTarget(row)}
          onAudit={(row) => setAuditTarget(row)}
        />
      )}
      <GdprEraseDialog
        contact={eraseTarget}
        onOpenChange={(open) => {
          if (!open) setEraseTarget(null)
        }}
      />
      <ContactAuditSheet
        contact={auditTarget}
        onOpenChange={(open) => {
          if (!open) setAuditTarget(null)
        }}
      />
    </div>
  )
}
