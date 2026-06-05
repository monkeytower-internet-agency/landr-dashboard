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
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  mobileSheetContent,
  mobileSheetHeader,
  mobileSheetBody,
} from '@/lib/mobile-sheet-classes'

type Props = {
  contact: ContactRow | null
  onOpenChange: (open: boolean) => void
}

export function ContactAuditSheet({ contact, onOpenChange }: Props) {
  const open = contact !== null
  const isMobile = useIsMobile()
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
      {/* landr-3qkr.3 — full-screen below md. */}
      <SheetContent className={cn('w-full sm:max-w-md', mobileSheetContent)}>
        {/* landr-3qkr.3 — sticky header below md. */}
        <SheetHeader className={cn('p-4', isMobile && mobileSheetHeader)}>
          <SheetTitle>{t.contacts.auditTitle}</SheetTitle>
          <SheetDescription>
            {contact ? contactNameDisplay(contact) : ''}
          </SheetDescription>
        </SheetHeader>
        {/* landr-3qkr.3 — pb-safe via mobileSheetBody. */}
        <div className={cn('flex flex-col gap-2 px-4 pb-6', mobileSheetBody)}>
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
