import { useState, type ReactNode } from 'react'
import { PencilIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type Props = {
  /** Sheet header title — what the user is managing (e.g. "Discount schemes"). */
  title: string
  /** Sheet header description — short blurb shown beneath the title. */
  description?: string
  /** aria-label / tooltip for the trigger button. */
  ariaLabel: string
  /** Controls the sheet open state externally; if omitted, the button manages state internally. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** What renders inside the sheet body. */
  children: ReactNode
}

/**
 * Pen-icon affordance for editing a taxonomy/lookup list (pricing schemes,
 * pickup types, product groups, etc.) inline from wherever it's referenced
 * (typically next to a dropdown that selects from the same list).
 *
 * Sourcing note (landr-wto): scaffolded here because sibling ticket landr-ogf
 * (pickup types) had not landed its `src/components/ui/edit-taxonomy-button.tsx`
 * yet. When landr-ogf merges, replace this with the canonical version — same
 * API on purpose.
 */
export function EditTaxonomyButton({
  title,
  description,
  ariaLabel,
  open: openProp,
  onOpenChange,
  children,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const handleOpenChange = onOpenChange ?? setInternalOpen
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => handleOpenChange(true)}
      >
        <PencilIcon className="size-4" />
      </Button>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="p-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
