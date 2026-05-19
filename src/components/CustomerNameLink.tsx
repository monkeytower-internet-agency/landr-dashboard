import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

type Props = {
  contactId: string
  display: string
  onClick: (contactId: string) => void
  className?: string
}

export function CustomerNameLink({
  contactId,
  display,
  onClick,
  className,
}: Props) {
  return (
    <button
      type="button"
      data-testid="customer-name-link"
      data-contact-id={contactId}
      onClick={(e) => {
        e.stopPropagation()
        onClick(contactId)
      }}
      aria-label={t.customerDetail.openAriaLabel(display)}
      className={cn(
        'cursor-pointer truncate text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none',
        className,
      )}
    >
      {display}
    </button>
  )
}
