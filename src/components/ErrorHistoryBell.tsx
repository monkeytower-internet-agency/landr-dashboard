// landr-40x0 — topbar "Recent errors" history affordance.
//
// A button + dropdown that sits next to NotificationsBell in the topbar.
// Shows a count badge when there are captured errors. Each row: relative
// time + message + Copy + Report. Footer: "Clear all".
//
// Styling mirrors NotificationsBell exactly (same DropdownMenu structure,
// same ghost icon button with badge, same w-80 content panel).

import { useState } from 'react'
import { AlertCircleIcon, CopyIcon, FlagIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { useErrorLog, clearErrors, type ErrorEntry } from '@/lib/error-log'
import { openReportFabWithPrefill } from '@/lib/report-fab-context'
import { t } from '@/lib/strings'

// ---- helpers ----------------------------------------------------------------

function relativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH} hour${diffH === 1 ? '' : 's'} ago`
    const diffD = Math.floor(diffH / 24)
    return `${diffD} day${diffD === 1 ? '' : 's'} ago`
  } catch {
    return ''
  }
}

function buildCopyText(entry: ErrorEntry): string {
  const parts: string[] = [`[${entry.ts}] ${entry.message} — ${entry.context}`]
  if (entry.detail) parts.push(`Detail: ${entry.detail}`)
  return parts.join('\n')
}

function buildPrefill(entry: ErrorEntry): string {
  return [
    `**Error report** (auto-filled from error capture)`,
    ``,
    `**Message:** ${entry.message}`,
    entry.detail ? `**Detail:** ${entry.detail}` : null,
    `**Route:** ${entry.context}`,
    `**Time:** ${entry.ts}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// ---- component --------------------------------------------------------------

export function ErrorHistoryBell() {
  const errors = useErrorLog()
  const [open, setOpen] = useState(false)

  const count = errors.length

  function handleCopy(entry: ErrorEntry, e: React.MouseEvent) {
    e.stopPropagation()
    void navigator.clipboard.writeText(buildCopyText(entry)).then(() => {
      toast.success(t.errorHistory.copiedToast)
    }).catch(() => {
      toast.error(t.errorHistory.copyFailedToast)
    })
  }

  function handleReport(entry: ErrorEntry, e: React.MouseEvent) {
    e.stopPropagation()
    setOpen(false)
    openReportFabWithPrefill(buildPrefill(entry))
  }

  function handleClearAll(e: React.MouseEvent) {
    e.stopPropagation()
    clearErrors()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            count > 0
              ? t.errorHistory.badgeLabel(count)
              : t.errorHistory.openLabel
          }
          className="relative"
          data-testid="error-history-trigger"
        >
          <AlertCircleIcon className="size-4" />
          {count > 0 ? (
            <span
              aria-hidden
              data-testid="error-history-badge"
              className="bg-destructive absolute top-1.5 right-1.5 size-2 rounded-full"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80"
        data-testid="error-history-content"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-xs font-medium">
            {t.errorHistory.heading}
          </DropdownMenuLabel>
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-auto px-1 py-0 text-xs"
              onClick={handleClearAll}
              data-testid="error-history-clear-all"
            >
              <Trash2Icon className="mr-1 size-3" />
              {t.errorHistory.clearAll}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />

        {count === 0 ? (
          <div
            className="text-muted-foreground px-2 py-3 text-center text-xs"
            data-testid="error-history-empty"
          >
            {t.errorHistory.empty}
          </div>
        ) : (
          <div
            className="max-h-96 overflow-y-auto"
            data-testid="error-history-list"
          >
            {errors.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                className="flex flex-col items-start gap-1 px-3 py-2"
                // Prevent the item's default onSelect from closing the dropdown
                onSelect={(e) => e.preventDefault()}
                data-testid={`error-history-item-${entry.id}`}
              >
                <div className="flex w-full items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      data-testid={`error-history-message-${entry.id}`}
                    >
                      {entry.message}
                    </p>
                    {entry.detail ? (
                      <p className="text-muted-foreground line-clamp-2 text-xs">
                        {entry.detail}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {relativeTime(entry.ts)}
                      {' · '}
                      <span className="font-mono">{entry.context}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={t.errorHistory.copyLabel}
                      onClick={(e) => handleCopy(entry, e)}
                      data-testid={`error-history-copy-${entry.id}`}
                    >
                      <CopyIcon className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={t.errorHistory.reportLabel}
                      onClick={(e) => handleReport(entry, e)}
                      data-testid={`error-history-report-${entry.id}`}
                    >
                      <FlagIcon className="size-3" />
                    </Button>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
