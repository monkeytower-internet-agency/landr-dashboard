// landr-wwhn.32 — Staff-only triage/actions card.
//
// Extracted from TicketDetailSheet per owner feedback: staff actions
// (assignee picker + send-to-development gateway) live here, NOT in the
// operator-facing detail sheet.  Operators never see this card.
//
// Mount this component from TicketDetailSheet when isStaff is true.
// It is also designed to slot into the .28 inbox once that lands.
//
// Components:
//   AssigneeSection  — assignee picker (staff) or read-only display (operator).
//                       Only the picker variant is rendered here (staff-only).
//   GatewayPanel     — engineering prompt + "Send to development" action.
//
// Both sub-components are re-implemented here rather than imported from
// TicketDetailSheet to satisfy react-refresh/only-export-components (each
// component file exports only React components).

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BotIcon, Send } from 'lucide-react'
import { toast } from 'sonner'

import { t } from '@/lib/strings'

import {
  fetchAssignableUsers,
  patchTicketAssignee,
  promoteTicket,
  type AssignableUser,
  type TicketRow,
  type TicketRowStaff,
} from '@/lib/tickets'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

// ---- Public component -------------------------------------------------------

type TicketTriageCardProps = {
  ticket: TicketRow
  staffDetail: TicketRowStaff | null
  onAssigneeChange: () => void
  onPromoteSuccess: () => void
}

export function TicketTriageCard({
  ticket,
  staffDetail,
  onAssigneeChange,
  onPromoteSuccess,
}: TicketTriageCardProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="triage-card">
      {/* Assignee picker */}
      <AssigneePicker
        ticket={ticket}
        onAssigneeChange={onAssigneeChange}
      />

      {/* Send-to-development gateway */}
      <GatewayPanel
        ticketId={ticket.id}
        linkedBdId={staffDetail?.linked_bd_id ?? null}
        onPromoteSuccess={onPromoteSuccess}
      />
    </div>
  )
}

// ---- AssigneePicker ---------------------------------------------------------
//
// Staff-only assignee picker.  The operator read-only view stays in the
// DetailsPanel inside TicketDetailSheet.

type AssigneePickerProps = {
  ticket: TicketRow
  onAssigneeChange: () => void
}

function AssigneePicker({ ticket, onAssigneeChange }: AssigneePickerProps) {
  const qc = useQueryClient()

  const assignableQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000,
  })
  const assignableUsers: AssignableUser[] = assignableQuery.data ?? []

  const currentAssignee: AssignableUser | null =
    ticket.assignee_id
      ? (assignableUsers.find((u) => u.id === ticket.assignee_id) ?? null)
      : null

  const mutation = useMutation({
    mutationFn: (assigneeId: string | null) =>
      patchTicketAssignee(ticket.id, assigneeId),
    onSuccess: (_data, assigneeId) => {
      const name = assigneeId
        ? (assignableUsers.find((u) => u.id === assigneeId)?.email ?? assigneeId)
        : null
      toast.success(
        name
          ? t.ticketDetail.assigneeToastSet(name)
          : t.ticketDetail.assigneeToastCleared,
      )
      onAssigneeChange()
      void qc.invalidateQueries({ queryKey: ['assignable-users'] })
    },
    onError: () => {
      toast.error(t.ticketDetail.assigneeToastError)
    },
  })

  const labelId = `triage-assignee-label-${ticket.id}`

  return (
    <Card data-testid="triage-assignee-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium" id={labelId}>
          {t.ticketDetail.assigneeSectionTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <select
            aria-labelledby={labelId}
            value={ticket.assignee_id ?? ''}
            onChange={(e) => {
              const val = e.target.value
              mutation.mutate(val === '' ? null : val)
            }}
            disabled={mutation.isPending || assignableQuery.isPending}
            className="border-input bg-background rounded-md border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="triage-assignee-picker"
          >
            <option value="">{t.ticketDetail.assigneePickerPlaceholder}</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.is_claude_agent
                  ? `🤖 ${u.email ?? 'Agent'}`
                  : (u.email ?? u.id)}
              </option>
            ))}
          </select>
          {currentAssignee && (
            <AssigneeDisplay assignee={currentAssignee} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---- AssigneeDisplay --------------------------------------------------------

type AssigneeDisplayProps = {
  assignee: AssignableUser
}

function AssigneeDisplay({ assignee }: AssigneeDisplayProps) {
  return (
    <div className="flex items-center gap-2" data-testid="triage-assignee-display">
      {assignee.is_claude_agent ? (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          <BotIcon className="size-3.5" aria-hidden />
        </span>
      ) : (
        <span className="bg-emerald-100 inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {(() => {
            const local = (assignee.email ?? '').split('@')[0] ?? ''
            const parts = local.split(/[._-]/).filter(Boolean)
            const initials =
              parts.length >= 2
                ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
                : local.slice(0, 2).toUpperCase()
            return initials || '?'
          })()}
        </span>
      )}
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {assignee.email ??
            (assignee.is_claude_agent ? 'Claude agent' : assignee.id)}
        </span>
        <span className="text-muted-foreground text-xs">
          {assignee.is_claude_agent
            ? t.ticketDetail.assigneeAgentBadge
            : t.ticketDetail.assigneeStaffBadge}
        </span>
      </div>
    </div>
  )
}

// ---- GatewayPanel -----------------------------------------------------------

type GatewayPanelProps = {
  ticketId: string
  linkedBdId: string | null
  onPromoteSuccess: () => void
}

function GatewayPanel({
  ticketId,
  linkedBdId,
  onPromoteSuccess,
}: GatewayPanelProps) {
  const [prompt, setPrompt] = useState('')

  const mutation = useMutation({
    mutationFn: () => promoteTicket(ticketId, prompt.trim()),
    onSuccess: (result) => {
      setPrompt('')
      toast.success(t.ticketDetail.gatewayToastSuccess(result.linked_bd_id))
      onPromoteSuccess()
    },
    onError: (err: Error) => {
      toast.error(`${t.ticketDetail.gatewayToastError} (${err.message})`)
    },
  })

  const isAlreadyPromoted = linkedBdId !== null
  const canSubmit =
    !isAlreadyPromoted && prompt.trim().length > 0 && !mutation.isPending

  return (
    <Card
      className="border-indigo-300 dark:border-indigo-700"
      data-testid="triage-gateway-panel"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          {t.ticketDetail.gatewaySectionTitle}
          <span className="inline-flex items-center rounded-full border border-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            Staff only
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isAlreadyPromoted ? (
          <p
            className="text-sm text-indigo-700 dark:text-indigo-300"
            data-testid="triage-gateway-already-promoted"
          >
            {t.ticketDetail.gatewayAlreadyPromoted(linkedBdId)}
          </p>
        ) : (
          <>
            <label
              className="text-muted-foreground text-xs font-medium"
              htmlFor={`triage-gateway-prompt-${ticketId}`}
            >
              {t.ticketDetail.gatewayPromptLabel}
            </label>
            <Textarea
              id={`triage-gateway-prompt-${ticketId}`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t.ticketDetail.gatewayPromptPlaceholder}
              className="min-h-[96px] resize-none"
              disabled={mutation.isPending}
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === 'Enter' &&
                  canSubmit
                ) {
                  e.preventDefault()
                  mutation.mutate()
                }
              }}
              data-testid="triage-gateway-prompt-input"
            />
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
              className="self-start gap-1.5"
              data-testid="triage-gateway-submit-btn"
            >
              <Send className="size-3.5" aria-hidden />
              {mutation.isPending
                ? t.ticketDetail.gatewaySubmitting
                : t.ticketDetail.gatewaySubmitLabel}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
