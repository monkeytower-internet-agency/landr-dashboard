import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  customerDisplay,
  dateDisplay,
  priceDisplay,
  productDisplay,
  type BookingRow,
} from '@/lib/bookings'
import { t } from '@/lib/strings'

type Props = {
  row: BookingRow | null
  onOpenChange: (open: boolean) => void
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

export function BookingDetailSheet({ row, onOpenChange }: Props) {
  const open = row !== null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.bookings.detailsTitle}</SheetTitle>
          <SheetDescription>
            {row ? `#${row.id.slice(0, 8)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <div className="flex flex-col gap-4 px-4 pb-6">
            <Field
              label={t.bookings.columnDate}
              value={dateDisplay(row.created_at)}
            />
            <Field
              label={t.bookings.columnCustomer}
              value={customerDisplay(row)}
            />
            <Field
              label={t.bookings.columnProduct}
              value={productDisplay(row)}
            />
            <Field
              label={t.bookings.columnStatus}
              value={row.current_semantic_state}
            />
            <Field
              label={t.bookings.columnPrice}
              value={priceDisplay(row)}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
