// landr-7dya.13 — "View as operator" operator picker dialog.
//
// Opened by AppModeSwitcher → enterViewAsMode() (in app-mode-context.tsx).
// Presents a searchable list of ALL operators (from the staff-scoped
// `staffOperators` list in OperatorProvider — the SEPARATE `operators` table
// query that bypasses the membership filter for is_landr_staff sessions).
//
// Selecting an operator calls enterViewAs() on the OperatorContext, which
// switches `currentOperatorId` to the target so every data query scopes to
// it, then closes the picker.
//
// The ViewAsBanner (already mounted in AppShell above the page body) handles
// the "Viewing as X — exit" affordance; this picker is ENTRY-ONLY.
//
// Non-staff never reach this component: the parent AppModeSwitcher renders
// null, so enterViewAsMode() is never called. The staffOperators list is also
// empty for non-staff (RLS-bounded), providing a second layer of safety.
//
// Accessibility: the cmdk CommandDialog wraps everything in a Dialog + role=
// "dialog" with proper labelling. Focus is trapped inside; Escape closes.

import { useState, useMemo } from 'react'
import { EyeIcon } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useAppMode } from '@/lib/app-mode-context'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

function displayName(name: string | null, slug: string): string {
  return name && name.trim().length > 0 ? name : slug
}

export function ViewAsOperatorPicker() {
  const { viewAsPickerOpen, closeViewAsPicker } = useAppMode()
  const {
    staffOperators,
    staffOperatorsLoading,
    viewAsOperator,
    enterViewAs,
  } = useOperator()

  const [search, setSearch] = useState('')

  // Filter locally; cmdk also does its own built-in filtering but we want to
  // preserve the label + slug matching behaviour across the full list.
  const filtered = useMemo(() => {
    if (!search.trim()) return staffOperators
    const q = search.trim().toLowerCase()
    return staffOperators.filter((op) => {
      const label = displayName(op.name, op.slug).toLowerCase()
      return label.includes(q) || op.slug.toLowerCase().includes(q)
    })
  }, [staffOperators, search])

  function handleSelect(operatorId: string) {
    enterViewAs(operatorId)
    closeViewAsPicker()
    setSearch('')
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      closeViewAsPicker()
      setSearch('')
    }
  }

  return (
    <CommandDialog
      open={viewAsPickerOpen}
      onOpenChange={handleOpenChange}
      title={t.operator.viewAs.pickerTitle}
      description={t.operator.viewAs.pickerDescription}
    >
      <CommandInput
        placeholder={t.operator.viewAs.pickerPlaceholder}
        value={search}
        onValueChange={setSearch}
        data-testid="view-as-picker-input"
      />
      <CommandList>
        {staffOperatorsLoading ? (
          <CommandEmpty>{t.operator.viewAs.pickerLoading}</CommandEmpty>
        ) : filtered.length === 0 ? (
          <CommandEmpty>{t.operator.viewAs.pickerEmpty}</CommandEmpty>
        ) : (
          <CommandGroup heading={t.operator.viewAs.pickerGroupLabel}>
            {filtered.map((op) => {
              const active = op.id === viewAsOperator?.id
              const label = displayName(op.name, op.slug)
              return (
                <CommandItem
                  key={op.id}
                  value={`${label} ${op.slug}`}
                  onSelect={() => handleSelect(op.id)}
                  aria-current={active ? 'true' : undefined}
                  data-testid={`view-as-picker-option-${op.slug}`}
                >
                  <EyeIcon className="mr-2 size-4 shrink-0 opacity-60" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {op.name && op.name !== op.slug ? (
                    <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                      {op.slug}
                    </span>
                  ) : null}
                  {active ? (
                    <span className="text-muted-foreground ml-2 shrink-0 text-xs">
                      {t.operator.viewAs.pickerActive}
                    </span>
                  ) : null}
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
