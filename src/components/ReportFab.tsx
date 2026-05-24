// landr-wwhn.12 — persistent "Report a problem / Suggest" entry point.
//
// A persistent button in the topbar (see AppShell) that opens a create-ticket
// dialog. Keeps Martin's effort minimal:
//   - Title (required)
//   - Body (optional)
//   - Type toggle: Problem → bug/annoyance (light repro hint shown for bug),
//                  Idea   → feature/question
//   - Perceived impact picker: blocking | annoying | idea
//
// Severity + priority are NOT set by the reporter — internal fields only,
// see migration 20260524070041_tickets.sql.
//
// Submit = plain row INSERT via direct Supabase REST (write-routing-convention:
// plain row writes that RLS + audit trigger cover go DIRECT to Supabase).
//
// Type mapping (reporter's simplified toggle → DB ticket_type):
//   "Problem" toggle + perceived_impact == 'blocking' or 'annoying' → 'bug'
//   "Problem" toggle + perceived_impact == 'idea'                    → 'annoyance'
//   "Idea"    toggle                                                  → 'feature'
//
// This keeps the schema rich while the reporter only sees two top-level options.

import { useState } from 'react'
import { MessageSquarePlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createTicket,
  fetchCurrentPublicUser,
  resolveTicketType,
  type ReporterToggle,
  type TicketCreate,
  type TicketRow,
} from '@/lib/tickets'
import { useOperator } from '@/lib/operator'
import { useAuth } from '@/lib/auth'
import { t } from '@/lib/strings'

// ---- Public component -------------------------------------------------------

export function ReportFab() {
  const { currentOperatorId } = useOperator()
  const [open, setOpen] = useState(false)

  // Hide until an operator is selected — same guard as QuickCaptureFab.
  if (!currentOperatorId) return null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t.reportButton.triggerLabel}
        onClick={() => setOpen(true)}
        data-testid="report-fab-trigger"
        className="gap-1.5 text-xs"
      >
        <MessageSquarePlusIcon className="size-3.5" aria-hidden />
        {t.reportButton.triggerText}
      </Button>
      <ReportDialog
        operatorId={currentOperatorId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

// ---- Dialog shell -----------------------------------------------------------

type DialogProps = {
  operatorId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ReportDialog({ operatorId, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.reportButton.dialogTitle}</DialogTitle>
          <DialogDescription>{t.reportButton.dialogDescription}</DialogDescription>
        </DialogHeader>
        {open ? (
          <ReportBody
            operatorId={operatorId}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ---- Form body --------------------------------------------------------------

type BodyProps = {
  operatorId: string
  onClose: () => void
}

function ReportBody({ operatorId, onClose }: BodyProps) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const [toggle, setToggle] = useState<ReporterToggle>('problem')
  const [impact, setImpact] = useState<TicketCreate['perceived_impact']>('annoying')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const titleTrimmed = title.trim()
  const bodyTrimmed = body.trim()
  const titleMissing = titleTrimmed.length === 0

  const createMutation = useMutation<TicketRow, Error, TicketCreate>({
    mutationFn: (payload) => createTicket(payload),
    onSuccess: () => {
      // Invalidate any future ticket list queries (ticket board — slice-2+)
      // so they pick up the new row when they land.
      void qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success(t.reportButton.toastSuccess)
      onClose()
    },
    onError: (err) => {
      toast.error(`${t.reportButton.toastError} (${err.message})`)
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (titleMissing || createMutation.isPending) return

    // reporter_id: resolve the Supabase auth.uid → public.users.id via
    // fetchCurrentPublicUser (added in landr-wwhn.13). The FK on tickets
    // points to public.users(id), NOT to auth.users(id), so we must do this
    // round-trip. If the user is not authenticated or no public.users row
    // exists (broken signup), we fall back to null — the ticket is still
    // attributed to the operator and fully usable; auto-watch (landr-wwhn.3
    // trigger) simply won't fire for a null reporter.
    const authUid = user?.id ?? null
    const buildAndSubmit = async () => {
      let reporterId: string | null = null
      if (authUid) {
        try {
          const publicUser = await fetchCurrentPublicUser(authUid)
          reporterId = publicUser?.id ?? null
        } catch {
          // Non-fatal: submit with null reporter rather than blocking the user.
          reporterId = null
        }
      }
      const payload: TicketCreate = {
        operator_id: operatorId,
        reporter_id: reporterId,
        type: resolveTicketType(toggle, impact),
        title: titleTrimmed,
        body: bodyTrimmed.length > 0 ? bodyTrimmed : null,
        perceived_impact: impact,
      }
      createMutation.mutate(payload)
    }
    void buildAndSubmit()
  }

  const canSubmit = !titleMissing && !createMutation.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* --- Type toggle --------------------------------------------------- */}
      <div className="space-y-1.5">
        <span
          id="report-type-label"
          className="text-xs font-medium leading-none"
        >
          Type
        </span>
        <div
          role="radiogroup"
          aria-labelledby="report-type-label"
          className="flex gap-2"
        >
          <ToggleChip
            id="report-type-problem"
            value="problem"
            checked={toggle === 'problem'}
            onChange={() => {
              setToggle('problem')
              // Reset impact to the most common problem value.
              if (impact === 'idea') setImpact('annoying')
            }}
            label={t.reportButton.typeProblem}
          />
          <ToggleChip
            id="report-type-idea"
            value="idea"
            checked={toggle === 'idea'}
            onChange={() => {
              setToggle('idea')
              setImpact('idea')
            }}
            label={t.reportButton.typeIdea}
          />
        </div>
      </div>

      {/* --- Title --------------------------------------------------------- */}
      <div className="space-y-1.5">
        <Label htmlFor="report-title" className="text-xs">
          {t.reportButton.titleLabel}
        </Label>
        <Input
          id="report-title"
          autoFocus
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.reportButton.titlePlaceholder}
          aria-invalid={title.length > 0 && titleMissing ? true : undefined}
        />
        {title.length > 0 && titleMissing ? (
          <p className="text-destructive text-xs" role="alert">
            {t.reportButton.titleRequired}
          </p>
        ) : null}
      </div>

      {/* --- Body ---------------------------------------------------------- */}
      <div className="space-y-1.5">
        <Label htmlFor="report-body" className="text-xs">
          {t.reportButton.bodyLabel}
          <span className="text-muted-foreground ml-1">(optional)</span>
        </Label>
        <Textarea
          id="report-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.reportButton.bodyPlaceholder}
          rows={4}
        />
        {/* Light repro hint for bug tickets */}
        {toggle === 'problem' ? (
          <p className="text-muted-foreground text-xs" data-testid="report-repro-hint">
            {t.reportButton.reproHint}
          </p>
        ) : null}
      </div>

      {/* --- Perceived impact ---------------------------------------------- */}
      <div className="space-y-1.5">
        <span
          id="report-impact-label"
          className="text-xs font-medium leading-none"
        >
          {t.reportButton.impactLabel}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="report-impact-label"
          className="flex flex-col gap-1.5"
        >
          {toggle === 'problem' ? (
            <>
              <ImpactRadio
                id="report-impact-blocking"
                value="blocking"
                checked={impact === 'blocking'}
                onChange={() => setImpact('blocking')}
                label={t.reportButton.impactBlocking}
              />
              <ImpactRadio
                id="report-impact-annoying"
                value="annoying"
                checked={impact === 'annoying'}
                onChange={() => setImpact('annoying')}
                label={t.reportButton.impactAnnoying}
              />
            </>
          ) : null}
          <ImpactRadio
            id="report-impact-idea"
            value="idea"
            checked={impact === 'idea'}
            onChange={() => setImpact('idea')}
            label={t.reportButton.impactIdea}
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={createMutation.isPending}
        >
          {t.reportButton.cancel}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {createMutation.isPending
            ? t.reportButton.submitting
            : t.reportButton.submit}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---- Small sub-components ---------------------------------------------------

type ToggleChipProps = {
  id: string
  value: ReporterToggle
  checked: boolean
  onChange: () => void
  label: string
}

function ToggleChip({ id, checked, onChange, label }: ToggleChipProps) {
  return (
    <label
      htmlFor={id}
      className={[
        'flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        checked
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
      ].join(' ')}
    >
      <input
        id={id}
        type="radio"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  )
}

type ImpactRadioProps = {
  id: string
  value: TicketCreate['perceived_impact']
  checked: boolean
  onChange: () => void
  label: string
}

function ImpactRadio({ id, checked, onChange, label }: ImpactRadioProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer select-none items-center gap-2 text-sm"
    >
      <input
        id={id}
        type="radio"
        className="accent-primary size-3.5"
        checked={checked}
        onChange={onChange}
        data-testid={`report-impact-${id.replace('report-impact-', '')}`}
      />
      {label}
    </label>
  )
}
