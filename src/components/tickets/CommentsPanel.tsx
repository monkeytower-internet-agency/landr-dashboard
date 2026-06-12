// landr-wwhn.13 — CommentsPanel, MentionDropdown, CommentBubble.
// Extracted from TicketDetailSheet.tsx (v9e4.8 refactor — pure file move).
//
// landr-wwhn.24: @mention autocomplete + override-quiet notification dispatch.
// When the user types "@" in the composer, we show a dropdown with matching
// users (searched via searchMentionUsers). Selecting a suggestion inserts the
// email local-part. After a successful comment post, we parse @handles from the
// body, resolve them to user IDs, and call notifyMentions (FastAPI) so those
// users receive a bell record even if their ticket settings are otherwise silent.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, UserPlusIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  createComment,
  fetchAssignableUsers,
  fetchTicketComments,
  fetchTicketCommentsStaff,
  notifyMentions,
  parseMentionHandles,
  resolveMentionHandles,
  searchMentionUsers,
  splitMentionSegments,
  type AssignableUser,
  type MentionUser,
  type TicketComment,
} from '@/lib/tickets'

// ---- CommentsPanel ----------------------------------------------------------

type CommentsPanelProps = {
  ticketId: string
  isStaff: boolean
}

export function CommentsPanel({ ticketId, isStaff }: CommentsPanelProps) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // landr-7dya.9 — reply-with-CC: explicitly notify additional staff on this
  // reply. CC == an explicit notify target, dispatched through the SAME
  // notify-mentions fan-out (bell override-quiet + push/email echo). Selected
  // staff are merged with any parsed @mentions on submit.
  const [ccUserIds, setCcUserIds] = useState<Set<string>>(new Set())
  const ccStaffQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000,
  })
  // CC targets are human staff — a Claude agent isn't a meaningful "reply CC".
  const ccCandidates: AssignableUser[] = (ccStaffQuery.data ?? []).filter(
    (u) => u.is_landr_staff && !u.is_claude_agent,
  )
  const ccSelected: AssignableUser[] = ccCandidates.filter((u) =>
    ccUserIds.has(u.id),
  )

  function toggleCc(userId: string) {
    setCcUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionUser[]>([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0)
  // Track the start offset of the current @-token so we can replace it on select.
  const mentionStartRef = useRef<number>(-1)
  const fetchAbortRef = useRef<AbortController | null>(null)

  // Staff fetch (incl. internal); operator fetch (public only).
  const staffQuery = useQuery({
    queryKey: ['ticket-comments-staff', ticketId],
    queryFn: () => fetchTicketCommentsStaff(ticketId),
    enabled: isStaff,
  })
  const publicQuery = useQuery({
    queryKey: ['ticket-comments', ticketId],
    queryFn: () => fetchTicketComments(ticketId),
    enabled: !isStaff,
  })

  const comments: TicketComment[] = isStaff
    ? (staffQuery.data ?? [])
    : (publicQuery.data ?? [])

  const isPending = isStaff ? staffQuery.isPending : publicQuery.isPending

  // Fetch mention suggestions when mentionQuery changes.
  const fetchSuggestions = useCallback(async (q: string) => {
    // Cancel any in-flight fetch.
    fetchAbortRef.current?.abort()
    const ac = new AbortController()
    fetchAbortRef.current = ac
    setMentionLoading(true)
    try {
      const results = await searchMentionUsers(q)
      if (!ac.signal.aborted) {
        setMentionSuggestions(results)
        setMentionSelectedIdx(0)
      }
    } catch {
      if (!ac.signal.aborted) setMentionSuggestions([])
    } finally {
      if (!ac.signal.aborted) setMentionLoading(false)
    }
    // setState dispatchers are stable; listed so React Compiler's
    // preserve-manual-memoization inference matches the manual dep array.
  }, [setMentionLoading, setMentionSuggestions, setMentionSelectedIdx])

  useEffect(() => {
    // Debounce: schedule fetch after 200 ms idle. When mentionQuery is null,
    // we still schedule a timer so state updates happen asynchronously (the
    // React Compiler forbids synchronous setState in effect bodies).
    const timer = setTimeout(() => {
      if (mentionQuery === null) {
        setMentionSuggestions([])
        setMentionLoading(false)
        return
      }
      void fetchSuggestions(mentionQuery)
    }, mentionQuery === null ? 0 : 200)
    return () => clearTimeout(timer)
  }, [mentionQuery, fetchSuggestions])

  /** Detect whether the cursor is inside an @-token and update mention state. */
  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setBody(val)
    const cursor = e.target.selectionStart ?? val.length
    // Walk backwards from cursor to find the last @ before any whitespace.
    let i = cursor - 1
    while (i >= 0 && !/\s/.test(val[i]!)) {
      if (val[i] === '@') {
        // Found an @-token starting at i.
        mentionStartRef.current = i
        setMentionQuery(val.slice(i + 1, cursor))
        return
      }
      i--
    }
    // No @-token in the current word — close dropdown.
    mentionStartRef.current = -1
    setMentionQuery(null)
  }

  /** Insert the selected user's email local-part at the @-token position. */
  function selectMentionUser(user: MentionUser) {
    const localPart = (user.email ?? '').split('@')[0] ?? ''
    const start = mentionStartRef.current
    if (start < 0) return
    const cursor = textareaRef.current?.selectionStart ?? body.length
    const newBody = `${body.slice(0, start)}@${localPart} ${body.slice(cursor)}`
    setBody(newBody)
    mentionStartRef.current = -1
    setMentionQuery(null)
    // Restore focus + move cursor past the inserted mention.
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        const pos = start + localPart.length + 2 // '@' + localPart + ' '
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const showDropdown =
    mentionQuery !== null && (mentionLoading || mentionSuggestions.length > 0)

  const createMutation = useMutation({
    mutationFn: () =>
      createComment({
        ticket_id: ticketId,
        body: body.trim(),
        is_internal: isStaff ? isInternal : false,
      }),
    onSuccess: (comment) => {
      const postedBody = body.trim()
      // Snapshot the CC selection before clearing the composer state.
      const ccIds = Array.from(ccUserIds)
      setBody('')
      setIsInternal(false)
      setMentionQuery(null)
      setCcUserIds(new Set())
      void qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] })
      void qc.invalidateQueries({ queryKey: ['ticket-comments-staff', ticketId] })
      // Notify dispatch: @mentions (landr-7dya.12) + reply CC (landr-7dya.9) go
      // through the SAME override-quiet fan-out. Fire-and-forget; errors are
      // non-fatal (the comment is already posted — bell is best-effort). The
      // backend de-dupes and excludes the actor, so merging is safe.
      void (async () => {
        try {
          const handles = parseMentionHandles(postedBody)
          const mentionIds = handles.size
            ? Array.from((await resolveMentionHandles(handles)).values()).map(
                (u) => u.id,
              )
            : []
          // Merge mentions + CC, de-duplicated.
          const userIds = Array.from(new Set([...mentionIds, ...ccIds]))
          if (userIds.length > 0) {
            await notifyMentions(ticketId, comment.id, userIds, postedBody)
          }
        } catch {
          // Notify dispatch failure is non-fatal — the comment is already posted.
        }
      })()
    },
    onError: (err: Error) => {
      toast.error(`${t.ticketDetail.commentToastError} (${err.message})`)
    },
  })

  const bodyTrimmed = body.trim()
  const canPost = bodyTrimmed.length > 0 && !createMutation.isPending

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Scrollable comment list */}
      <div
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 pt-3"
        data-testid="ticket-comments-list"
      >
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="bg-muted h-16 animate-pulse rounded-md"
              />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <p
            className="text-muted-foreground text-sm italic"
            data-testid="ticket-comments-empty"
          >
            {t.ticketDetail.noComments}
          </p>
        ) : (
          comments.map((c) => (
            <CommentBubble key={c.id} comment={c} />
          ))
        )}
      </div>

      {/* Compose area — pinned to the bottom */}
      <div className="shrink-0 border-t px-4 pb-4 pt-3">
        {/* Staff internal toggle */}
        {isStaff && (
          <div className="mb-2 flex items-center gap-2">
            <Switch
              checked={isInternal}
              onClick={() => setIsInternal((v) => !v)}
              data-testid="comment-internal-toggle"
              className={cn(
                isInternal &&
                  'bg-amber-500 border-amber-500 dark:bg-amber-600 dark:border-amber-600',
              )}
            />
            <label
              className="cursor-pointer select-none text-xs font-medium"
              onClick={() => setIsInternal((v) => !v)}
            >
              {t.ticketDetail.commentInternalToggle}
            </label>
          </div>
        )}

        {/* Reply-with-CC picker (landr-7dya.9) — staff only. Lets the author
            notify additional staff on this reply via the mention dispatch. */}
        {isStaff && (
          <div
            className="mb-2 flex flex-wrap items-center gap-1.5"
            data-testid="cc-picker"
          >
            <span className="text-muted-foreground inline-flex items-center text-xs font-medium">
              {t.ticketDetail.ccLabel}:
            </span>
            {ccSelected.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                data-testid={`cc-chip-${u.id}`}
              >
                {u.email?.split('@')[0] ?? u.id}
                <button
                  type="button"
                  className="inline-flex size-3.5 items-center justify-center rounded-full hover:bg-blue-200 dark:hover:bg-blue-900"
                  onClick={() => toggleCc(u.id)}
                  aria-label={t.ticketDetail.ccRemove(u.email ?? u.id)}
                  data-testid={`cc-chip-remove-${u.id}`}
                >
                  <XIcon className="size-2.5" aria-hidden />
                </button>
              </span>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                  data-testid="cc-add-btn"
                >
                  <UserPlusIcon className="size-3" aria-hidden />
                  {t.ticketDetail.ccAddLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-60 w-56 overflow-y-auto"
                data-testid="cc-menu"
              >
                <DropdownMenuLabel className="text-xs">
                  {t.ticketDetail.ccPickerPlaceholder}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ccCandidates.length === 0 ? (
                  <div className="text-muted-foreground px-2 py-1.5 text-xs">
                    {t.ticketDetail.ccNoStaff}
                  </div>
                ) : (
                  ccCandidates.map((u) => (
                    <DropdownMenuCheckboxItem
                      key={u.id}
                      checked={ccUserIds.has(u.id)}
                      // Keep the menu open across multiple selections.
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => toggleCc(u.id)}
                      className="text-xs"
                      data-testid={`cc-option-${u.id}`}
                    >
                      {u.email ?? u.id}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {ccSelected.length > 0 && (
              <span className="text-muted-foreground/70 w-full text-[10px]">
                {t.ticketDetail.ccHint}
              </span>
            )}
          </div>
        )}

        {/* @mention autocomplete dropdown */}
        {showDropdown && (
          <MentionDropdown
            loading={mentionLoading}
            suggestions={mentionSuggestions}
            selectedIdx={mentionSelectedIdx}
            onSelect={selectMentionUser}
            data-testid="mention-dropdown"
          />
        )}

        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
            placeholder={
              isInternal
                ? t.ticketDetail.commentInternalPlaceholder
                : t.ticketDetail.commentPlaceholder
            }
            className={cn(
              'min-h-[72px] flex-1 resize-none',
              isInternal && 'border-amber-300 focus-visible:ring-amber-400 dark:border-amber-700',
            )}
            onKeyDown={(e) => {
              // Keyboard navigation for the mention dropdown.
              if (showDropdown) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setMentionSelectedIdx((i) =>
                    Math.min(i + 1, mentionSuggestions.length - 1),
                  )
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setMentionSelectedIdx((i) => Math.max(i - 1, 0))
                  return
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  const user = mentionSuggestions[mentionSelectedIdx]
                  if (user) {
                    e.preventDefault()
                    selectMentionUser(user)
                    return
                  }
                }
                if (e.key === 'Escape') {
                  setMentionQuery(null)
                  return
                }
              }
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canPost) {
                e.preventDefault()
                createMutation.mutate()
              }
            }}
            disabled={createMutation.isPending}
            data-testid="comment-body-input"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!canPost}
            className="self-end"
            data-testid="comment-submit-btn"
          >
            <Send className="size-3.5" aria-hidden />
            {createMutation.isPending
              ? t.ticketDetail.commentSubmitting
              : t.ticketDetail.commentSubmit}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---- MentionDropdown --------------------------------------------------------

type MentionDropdownProps = {
  loading: boolean
  suggestions: MentionUser[]
  selectedIdx: number
  onSelect: (user: MentionUser) => void
  'data-testid'?: string
}

export function MentionDropdown({
  loading,
  suggestions,
  selectedIdx,
  onSelect,
  'data-testid': testId,
}: MentionDropdownProps) {
  return (
    <div
      role="listbox"
      aria-label="Mention suggestions"
      className="bg-popover border-border mb-1 max-h-40 overflow-y-auto rounded-md border shadow-md"
      data-testid={testId ?? 'mention-dropdown'}
    >
      {loading ? (
        <div className="text-muted-foreground px-3 py-2 text-xs">
          {t.ticketDetail.mentionSearching}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-muted-foreground px-3 py-2 text-xs">
          {t.ticketDetail.mentionNoResults}
        </div>
      ) : (
        suggestions.map((u, idx) => (
          <button
            key={u.id}
            type="button"
            role="option"
            aria-selected={idx === selectedIdx}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
              idx === selectedIdx
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted',
            )}
            onMouseDown={(e) => {
              // mousedown fires before textarea blur; prevent default so we
              // can still read the cursor position and insert the mention.
              e.preventDefault()
              onSelect(u)
            }}
            data-testid={`mention-option-${u.id}`}
          >
            <span className="font-medium">{u.email?.split('@')[0]}</span>
            <span className="text-muted-foreground truncate">{u.email}</span>
          </button>
        ))
      )}
    </div>
  )
}

// ---- CommentBubble ----------------------------------------------------------

type CommentBubbleProps = {
  comment: TicketComment
}

export function CommentBubble({ comment }: CommentBubbleProps) {
  const dateFormatter = new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm',
        comment.is_internal
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
          : 'bg-card border-input',
      )}
      data-testid={`comment-${comment.id}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {dateFormatter.format(new Date(comment.created_at))}
        </span>
        {comment.is_internal && (
          <span className="inline-flex items-center rounded-full border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            Internal
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap" data-testid={`comment-body-${comment.id}`}>
        {/* landr-7dya.12 — highlight @mentions in the displayed body. */}
        {splitMentionSegments(comment.body).map((seg, i) =>
          seg.type === 'mention' ? (
            <span
              key={i}
              className="rounded bg-blue-100 px-0.5 font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
              data-testid="comment-mention"
            >
              {seg.value}
            </span>
          ) : (
            <span key={i}>{seg.value}</span>
          ),
        )}
      </p>
    </div>
  )
}
