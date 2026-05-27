import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

type Props = {
  contactId: string
  display: string
  onClick: (contactId: string) => void
  className?: string
  // landr-11d5 — optional rich content used when search-highlight wraps
  // matches in <mark>. When omitted, falls back to the plain `display`
  // string. `display` is still the source of truth for aria-label.
  displayNode?: ReactNode
}

export function CustomerNameLink({
  contactId,
  display,
  onClick,
  className,
  displayNode,
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
      {displayNode ?? display}
    </button>
  )
}
