import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ContactAuditSheet } from '@/components/ContactAuditSheet'
import { ContactsFilters } from '@/components/contacts/ContactsFilters'
import { ContactsTable } from '@/components/ContactsTable'
import { CustomerDetailSheet } from '@/components/CustomerDetailSheet'
import { GdprEraseDialog } from '@/components/GdprEraseDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchContacts,
  fetchContactTypeCounts,
  type ContactRow,
} from '@/lib/contacts'
import { useContactsFilters } from '@/lib/contacts-filters'
import { useContactsSort } from '@/lib/contacts-sort'
import { useOperator } from '@/lib/operator'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

export function Contacts() {
  const { currentOperatorId } = useOperator()
  const [editContactId, setEditContactId] = useState<string | null>(null)
  const [eraseTarget, setEraseTarget] = useState<ContactRow | null>(null)
  const [auditTarget, setAuditTarget] = useState<ContactRow | null>(null)

  // landr-pqk — sort + type filter are per-user, persisted in localStorage.
  // The query key embeds both so a change re-runs the fetch with the new
  // ORDER BY / overlap filter at the API layer.
  // landr-dp45 — `includeErased` is also part of the key so flipping the
  // "Show erased contacts" toggle re-runs the fetch with/without the
  // `gdpr_erased_at IS NULL` filter.
  const sortApi = useContactsSort()
  const filtersApi = useContactsFilters()
  const { sort } = sortApi
  const { filters } = filtersApi
  const typesKey = filters.types.slice().sort().join(',') || 'all'

  const query = useRealtimeQuery<ContactRow[]>({
    queryKey: [
      'contacts',
      currentOperatorId ?? 'none',
      sort,
      typesKey,
      filters.includeErased ? 'with-erased' : 'no-erased',
    ],
    queryFn: () =>
      fetchContacts(currentOperatorId as string, {
        sort,
        types: filters.types,
        includeErased: filters.includeErased,
      }),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'contacts',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  // landr-knz3 — per-type counts for the chip badges. Separate from the
  // main list query because the counts are independent of the selected
  // filter (they always reflect the operator-wide totals). The default
  // (excludes GDPR-erased + soft-deleted) matches the visible list.
  const countsQuery = useQuery({
    queryKey: ['contact-type-counts', currentOperatorId ?? 'none', false],
    queryFn: () =>
      fetchContactTypeCounts(currentOperatorId as string, {
        includeErased: false,
      }),
    enabled: !!currentOperatorId,
    staleTime: 30_000,
  })

  const rows = query.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.contacts.title}</h1>
      </header>
      <ContactsFilters
        sortApi={sortApi}
        filtersApi={filtersApi}
        typeCounts={countsQuery.data}
      />
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
          onEdit={(row) => setEditContactId(row.id)}
          onErase={(row) => setEraseTarget(row)}
          onAudit={(row) => setAuditTarget(row)}
        />
      )}
      <CustomerDetailSheet
        contactId={editContactId}
        onOpenChange={(open) => {
          if (!open) setEditContactId(null)
        }}
      />
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
