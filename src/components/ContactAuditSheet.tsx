import { useQuery } from '@tanstack/react-query'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  contactDateTime,
  contactNameDisplay,
  fetchContactAuditLog,
  type ContactRow,
} from '@/lib/contacts'
import { useOperatorCalendarPrefs } from '@/lib/operator'
import { t } from '@/lib/strings'

type Props = {
  contact: ContactRow | null
  onOpenChange: (open: boolean) => void
}

export function ContactAuditSheet({ contact, onOpenChange }: Props) {
  const open = contact !== null
  // landr-f1s — respect time_format_24h for audit-log timestamps.
  const { hour12 } = useOperatorCalendarPrefs()
  const query = useQuery({
    queryKey: ['contact-audit-log', contact?.id ?? 'none'],
    queryFn: () => fetchContactAuditLog(contact!.id),
    enabled: open && !!contact,
  })

  const rows = query.data ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.contacts.auditTitle}</SheetTitle>
          <SheetDescription>
            {contact ? contactNameDisplay(contact) : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-6">
          {query.isPending ? (
            <p className="text-muted-foreground text-sm">
              {t.contacts.auditLoading}
            </p>
          ) : query.isError ? (
            <p className="text-destructive text-sm">
              {t.contacts.auditError}
              <br />
              <span className="text-muted-foreground text-xs">
                {query.error?.message ?? ''}
              </span>
            </p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t.contacts.auditEmpty}
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md border bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium uppercase tracking-wide">
                      {row.operation}
                    </span>
                    <span className="text-muted-foreground">
                      {contactDateTime(row.occurred_at, { hour12 })}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1">
                    <span>{row.actor_kind}</span>
                    {row.actor_subkind ? (
                      <span> · {row.actor_subkind}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
