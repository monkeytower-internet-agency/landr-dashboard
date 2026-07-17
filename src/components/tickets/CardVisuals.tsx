// landr-7dya.2 — Origin-tier chip (PROD vs STAGING) on ticket cards.
// landr-7dya.3 — Trello-style card status icons: attachment, watch, assignee,
//                priority/severity, comment count, moscow, blocked.
//
// Both components are purely display (no hooks, no network calls). The parent
// is responsible for fetching the counts and flags and passing them as props.
//
// OriginChip:
//   - 'prod'    → subtle neutral chip  (production-native row)
//   - 'staging' → amber chip           (relayed from landr-staging)
//   - null      → nothing rendered     (legacy / column not yet on lower env)
//
// CardStatusIcons (Trello-style icon row):
//   - Attachment indicator  (Paperclip icon + count)
//   - Watch indicator       (Eye icon, highlighted when watching)
//   - Assignee avatar       (initials or robot icon)
//   - Priority badge        (p0/p1/p2 — compact)
//   - Comment count         (MessageSquare icon + count)
//   - MoSCoW badge          (must / should / could / wont)
//   - Blocked flag          (AlertCircle icon, red, only when blocked=true)
//
// Components exported here are intentionally prop-driven with no side effects
// so they can be unit-tested without mocking Supabase / React Query.

import { AlertCircle, BotIcon, Eye, MessageSquare, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MOSCOW_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  type AssignableUser,
  type TicketMoscow,
  type TicketPriority,
} from '@/lib/tickets'

// ---- OriginChip -------------------------------------------------------------

export type OriginTier = 'prod' | 'staging' | null

type OriginChipProps = {
  /** The origin tier value from tickets_staff.origin_tier. */
  tier: OriginTier
  /**
   * For staging-origin rows, the denormalised operator label (text, no FK).
   * Shown in the chip tooltip for quick context.
   */
  operatorLabel?: string | null
  className?: string
  'data-testid'?: string
}

/**
 * Colored origin chip for ticket cards.
 *   prod    → subtle muted chip (production-native)
 *   staging → amber chip (relayed from landr-staging)
 *   null    → renders nothing
 */
export function OriginChip({
  tier,
  operatorLabel,
  className,
  'data-testid': testId,
}: OriginChipProps) {
  if (!tier) return null

  const isStaging = tier === 'staging'
  const label = isStaging ? 'STAGING' : 'PROD'
  const title = isStaging
    ? operatorLabel
      ? `Relayed from staging (${operatorLabel})`
      : 'Relayed from staging'
    : 'Production'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
        isStaging
          ? 'border border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
          : 'bg-muted text-muted-foreground',
        className,
      )}
      title={title}
      data-testid={testId ?? 'origin-chip'}
    >
      {label}
    </span>
  )
}

// ---- CardStatusIcons --------------------------------------------------------

export type CardStatusIconsProps = {
  /** Number of attachments on the ticket (0 = hide the indicator). */
  attachmentCount: number
  /** Whether the current user is watching this ticket. */
  isWatching: boolean
  /** Resolved assignee (null = no assignee chip). */
  assignee: AssignableUser | null
  /** Ticket priority. */
  priority: TicketPriority
  /** Number of comments (0 = hide the indicator). */
  commentCount: number
  /** MoSCoW value (null = not planned). */
  moscow: TicketMoscow | null
  /** Whether the ticket is blocked. */
  blocked: boolean
  className?: string
  'data-testid'?: string
}

const MOSCOW_SHORT: Record<TicketMoscow, string> = {
  must: 'M',
  should: 'S',
  could: 'C',
  wont: 'W',
}

const MOSCOW_TONE: Record<TicketMoscow, string> = {
  must: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  should: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  could: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  wont: 'bg-muted text-muted-foreground',
}

const PRIORITY_SHORT: Record<TicketPriority, string> = {
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
}

/**
 * Compact Trello-style icon row for a ticket card.
 * Render after the title/type row, before the footer date.
 */
export function CardStatusIcons({
  attachmentCount,
  isWatching,
  assignee,
  priority,
  commentCount,
  moscow,
  blocked,
  className,
  'data-testid': testId,
}: CardStatusIconsProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1',
        className,
      )}
      data-testid={testId ?? 'card-status-icons'}
    >
      {/* Priority badge */}
      <span
        className={cn(
          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
          PRIORITY_TONE[priority] ?? PRIORITY_TONE.p2,
        )}
        title={PRIORITY_LABEL[priority]}
        data-testid="card-status-priority"
      >
        {PRIORITY_SHORT[priority]}
      </span>

      {/* MoSCoW badge */}
      {moscow && (
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
            MOSCOW_TONE[moscow],
          )}
          title={MOSCOW_LABEL[moscow]}
          data-testid="card-status-moscow"
        >
          {MOSCOW_SHORT[moscow]}
        </span>
      )}

      {/* Blocked flag */}
      {blocked && (
        <span
          className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400"
          title="Blocked"
          data-testid="card-status-blocked"
          aria-label="Blocked"
        >
          <AlertCircle className="size-3" aria-hidden />
        </span>
      )}

      {/* Attachment indicator */}
      {attachmentCount > 0 && (
        <span
          className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px]"
          title={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
          data-testid="card-status-attachments"
          aria-label={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
        >
          <Paperclip className="size-3" aria-hidden />
          {attachmentCount}
        </span>
      )}

      {/* Comment count */}
      {commentCount > 0 && (
        <span
          className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px]"
          title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
          data-testid="card-status-comments"
          aria-label={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
        >
          <MessageSquare className="size-3" aria-hidden />
          {commentCount}
        </span>
      )}

      {/* Watch indicator */}
      {isWatching && (
        <span
          className="text-primary inline-flex items-center"
          title="You are watching this ticket"
          data-testid="card-status-watching"
          aria-label="Watching"
        >
          <Eye className="size-3" aria-hidden />
        </span>
      )}

      {/* Assignee avatar */}
      {assignee && (
        <AssigneeAvatar assignee={assignee} />
      )}
    </div>
  )
}

// ---- AssigneeAvatar (shared) -------------------------------------------------
//
// Very compact version of the AssigneeChip already in TicketCard — size-4,
// used in the status-icons row at the end.

type AssigneeAvatarProps = {
  assignee: AssignableUser
}

export function AssigneeAvatar({ assignee }: AssigneeAvatarProps) {
  const title = assignee.email ?? (assignee.is_claude_agent ? 'Claude agent' : 'Assigned')

  if (assignee.is_claude_agent) {
    return (
      <span
        className="inline-flex size-4 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
        title={`Assigned to agent: ${title}`}
        data-testid="card-status-assignee"
      >
        <BotIcon className="size-2.5" aria-hidden />
      </span>
    )
  }

  const local = (assignee.email ?? '').split('@')[0] ?? ''
  const parts = local.split(/[._-]/).filter(Boolean)
  const initials = parts.length >= 2
    ? `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
    : local.slice(0, 2).toUpperCase()

  return (
    <span
      className="inline-flex size-4 items-center justify-center rounded-full bg-emerald-100 text-[8px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      title={`Assigned to: ${title}`}
      data-testid="card-status-assignee"
    >
      {initials || '?'}
    </span>
  )
}
