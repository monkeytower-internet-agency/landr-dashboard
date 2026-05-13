import { Check, ChevronsUpDown } from 'lucide-react'
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
import { t } from '@/lib/strings'

function displayName(name: string | null, slug: string): string {
  return name && name.trim().length > 0 ? name : slug
}

export function OperatorSwitcher() {
  const { operators, currentOperator, currentOperatorId, loading, switchOperator } =
    useOperator()

  if (loading && operators.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">{t.operator.loading}</span>
    )
  }

  if (operators.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">
        {t.operator.noOperators}
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
          className="justify-between gap-2"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        <DropdownMenuLabel>{t.operator.switchTo}</DropdownMenuLabel>
        <DropdownMenuSeparator />
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
