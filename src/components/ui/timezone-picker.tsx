import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const FALLBACK_TIMEZONES: ReadonlyArray<string> = [
  "Europe/Madrid",
  "Atlantic/Canary",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/London",
  "Europe/Lisbon",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Brussels",
  "Europe/Dublin",
  "Europe/Warsaw",
  "Europe/Prague",
  "America/New_York",
  "UTC",
]

let cachedTimezones: ReadonlyArray<string> | null = null

function getTimezones(): ReadonlyArray<string> {
  if (cachedTimezones) return cachedTimezones
  try {
    // Intl.supportedValuesOf is available in modern browsers / Node 18+.
    const intl = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[]
    }
    if (typeof intl.supportedValuesOf === "function") {
      const list = intl.supportedValuesOf("timeZone")
      if (Array.isArray(list) && list.length > 0) {
        cachedTimezones = list
        return cachedTimezones
      }
    }
  } catch {
    // ignore — fall through to the curated fallback list.
  }
  cachedTimezones = FALLBACK_TIMEZONES
  return cachedTimezones
}

export type TimezonePickerProps = {
  value: string
  onChange: (tz: string) => void
  disabled?: boolean
  id?: string
  placeholder?: string
}

export function TimezonePicker({
  value,
  onChange,
  disabled,
  id,
  placeholder = "Select timezone…",
}: TimezonePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const tzList = React.useMemo(() => getTimezones(), [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tzList.slice(0, 200)
    return tzList.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 200)
  }, [query, tzList])

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
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value || placeholder}
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
            placeholder="Filter timezones…"
            aria-label="Filter timezones"
            className="h-9 w-full rounded-t-md border-b border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No timezones found.
              </li>
            )}
            {filtered.map((tz) => {
              const selected = tz === value
              return (
                <li key={tz}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(tz)
                      setOpen(false)
                      setQuery("")
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
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
                    <span className="truncate">{tz}</span>
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
