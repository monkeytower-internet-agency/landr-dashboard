import { Check, ChevronsUpDown, EyeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useOperator } from '@/lib/operator'
import { useEntitlements } from '@/lib/entitlements'
import { t } from '@/lib/strings'

function displayName(name: string | null, slug: string): string {
  return name && name.trim().length > 0 ? name : slug
}

// landr-2soj — STAFF-ONLY "View as operator" picker. Renders the all-operators
// list (from the SEPARATE staffOperators query in OperatorProvider — NOT the
// membership dropdown above, so the landr-69c leak does not return) under its
// own labelled section. Selecting an entry enters view-as for that operator;
// the active target carries a check. Gated on raw isLandrStaff so it stays
// available even while already in view-as (lets staff re-pick another
// operator without first exiting). For non-staff the staffOperators list is
// empty AND isLandrStaff is false, so this section never appears.
function ViewAsSection() {
  const { staffOperators, viewAsOperator, enterViewAs } = useOperator()
  if (staffOperators.length === 0) return null
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="flex items-center gap-1.5">
        <EyeIcon className="size-3.5 opacity-70" aria-hidden />
        {t.operator.viewAs.sectionLabel}
      </DropdownMenuLabel>
      {staffOperators.map((op) => {
        const active = op.id === viewAsOperator?.id
        return (
          <DropdownMenuItem
            key={`view-as-${op.id}`}
            onSelect={() => enterViewAs(op.id)}
            aria-current={active ? 'true' : undefined}
          >
            <span className="flex-1 truncate">
              {displayName(op.name, op.slug)}
            </span>
            {active ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function OperatorSwitcher() {
  const { operators, currentOperator, currentOperatorId, loading, switchOperator } =
    useOperator()
  const { isLandrStaff } = useEntitlements()

  if (loading && operators.length === 0 && !isLandrStaff) {
    return (
      <span className="text-muted-foreground text-sm">{t.operator.loading}</span>
    )
  }

  // landr-2soj — staff ALWAYS get the dropdown so the "View as operator"
  // picker is reachable even when they own 0 or 1 operators. Non-staff keep
  // the existing landr-fx2i degradation (0 → hint label, 1 → static label).
  const showDropdown = isLandrStaff || operators.length >= 2

  if (!showDropdown) {
    // landr-fx2i — single-operator accounts get no switcher dropdown
    // (dead UI), but we still render a small read-only label so the
    // topbar reveals which org the user is currently scoped into.
    if (operators.length === 0) {
      return (
        <span className="text-muted-foreground text-sm">
          {t.operator.noOperators}
        </span>
      )
    }
    const only = operators[0]
    return (
      <span
        // landr-fd5m.1 — tightened from 8rem to 6rem below sm so the
        // never-fold floor (this label + staff chrome) fits at 360px.
        className="text-foreground max-w-[6rem] truncate text-sm font-medium sm:max-w-[16rem]"
        aria-label={t.operator.switcherLabel}
      >
        {displayName(only.name, only.slug)}
      </span>
    )
  }

  const label = currentOperator
    ? displayName(currentOperator.name, currentOperator.slug)
    : t.operator.switchTo

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t.operator.switcherLabel}
          // landr-gu14 — cap the trigger width on phone so a long operator
          // name can't push the page title clean off the topbar. Desktop
          // keeps the original auto-width behaviour.
          // landr-fd5m.1 — tightened from 8rem to 6rem: the staff-chrome
          // never-fold floor needs the extra ~2rem to fit at 360px.
          className="max-w-[6rem] justify-between gap-2 sm:max-w-none"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        {/* Membership scope — the user's own operators (landr-69c filtered).
            Hidden when the user has no memberships so the menu opens straight
            on the View-as picker rather than an empty section. */}
        {operators.length > 0 ? (
          <>
            <DropdownMenuLabel>{t.operator.switchTo}</DropdownMenuLabel>
            {operators.map((op) => {
              const active = op.id === currentOperatorId
              return (
                <DropdownMenuItem
                  key={op.id}
                  onSelect={() => switchOperator(op.id)}
                  aria-current={active ? 'true' : undefined}
                >
                  <span className="flex-1 truncate">
                    {displayName(op.name, op.slug)}
                  </span>
                  {active ? <Check className="size-4" /> : null}
                </DropdownMenuItem>
              )
            })}
          </>
        ) : null}
        {isLandrStaff ? <ViewAsSection /> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
