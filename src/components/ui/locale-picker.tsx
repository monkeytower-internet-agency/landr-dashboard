import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { LOCALES } from "@/lib/locale-defaults"

export type LocalePickerProps = {
  value: string
  onChange: (locale: string) => void
  disabled?: boolean
  id?: string
  placeholder?: string
}

function displayLabel(code: string): string {
  const entry = LOCALES.find((l) => l.code === code)
  if (entry) return `${entry.label} (${entry.code})`
  return code
}

export function LocalePicker({
  value,
  onChange,
  disabled,
  id,
  placeholder = "Select locale…",
}: LocalePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LOCALES
    return LOCALES.filter(
      (l) => l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full cursor-pointer items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value ? displayLabel(value) : placeholder}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="ml-2 size-4 shrink-0 opacity-60"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="flex flex-col">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter locales…"
            aria-label="Filter locales"
            className="h-9 w-full rounded-t-md border-b border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No locales found.
              </li>
            )}
            {filtered.map((l) => {
              const selected = l.code === value
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(l.code)
                      setOpen(false)
                      setQuery("")
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      selected && "bg-accent/50",
                    )}
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">
                      {l.label} ({l.code})
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
