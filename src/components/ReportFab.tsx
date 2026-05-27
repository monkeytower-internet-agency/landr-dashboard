// landr-wwhn.29 — simplified operator feedback form.
//
// One form: "Report an issue / Send feedback". No type toggle.
//
// Single classifier: perceived_impact (Blocking | Annoying | Idea/suggestion).
// ticket.type is INTERNAL — derived here as a sensible default (blocking/annoying
// → bug, idea → feature) and staff retypes in triage. No enum changes.
//
// Additions over the original (landr-wwhn.12):
//   • File-time attachments: paste (Ctrl+V) or click-to-upload, reusing the
//     Storage flow from TicketDetailSheet AttachmentsPanel.
//   • Optional URL/link field.
//   • Auto-capture of current route + app version into body metadata.
//   • Friendly on-brand submit confirmation toast linking to the ticket.

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquarePlusIcon, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'

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
  uploadTicketAttachment,
  fetchCurrentPublicUser,
  resolveTicketType,
  type TicketCreate,
  type TicketRow,
} from '@/lib/tickets'
import { useOperator } from '@/lib/operator'
import { useAuth } from '@/lib/auth'
import { t } from '@/lib/strings'

// ---- constants ---------------------------------------------------------------

const APP_VERSION = __APP_VERSION__

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

// ---- Staged attachment (pre-submit, held in memory) -------------------------

type StagedFile = {
  /** Unique key for React lists */
  key: string
  file: File
  previewUrl: string | null
}

function makeStagedFile(file: File): StagedFile {
  const previewUrl = file.type.startsWith('image/')
    ? URL.createObjectURL(file)
    : null
  return { key: crypto.randomUUID(), file, previewUrl }
}

// ---- Form body --------------------------------------------------------------

type BodyProps = {
  operatorId: string
  onClose: () => void
}

function ReportBody({ operatorId, onClose }: BodyProps) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const location = useLocation()

  const [impact, setImpact] = useState<TicketCreate['perceived_impact']>('annoying')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [linkInvalid, setLinkInvalid] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const titleTrimmed = title.trim()
  const bodyTrimmed = body.trim()
  const titleMissing = titleTrimmed.length === 0

  // Revoke object URLs on unmount or when staged files change.
  useEffect(() => {
    return () => {
      for (const f of stagedFiles) {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
      }
    }
    // intentionally only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clipboard paste handler — image blobs or any file-kind item.
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) setStagedFiles((prev) => [...prev, makeStagedFile(file)])
      }
    }
  }, [])

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  function handleFileInput(files: FileList | null) {
    if (!files) return
    setStagedFiles((prev) => [
      ...prev,
      ...Array.from(files).map(makeStagedFile),
    ])
    // Reset so the same file can be re-selected after removal.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeStagedFile(key: string) {
    setStagedFiles((prev) => {
      const removed = prev.find((f) => f.key === key)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((f) => f.key !== key)
    })
  }

  // Validate URL (optional field — only if non-empty).
  function validateLink(raw: string): boolean {
    if (!raw.trim()) return true
    try {
      const u = new URL(raw.trim())
      return u.protocol === 'https:'
    } catch {
      return false
    }
  }

  const createMutation = useMutation<TicketRow, Error, TicketCreate>({
    mutationFn: (payload) => createTicket(payload),
    onSuccess: async (ticket) => {
      // Upload any staged files now that we have a ticket id.
      let uploaderId: string | null = null
      if (user?.id) {
        try {
          const pub = await fetchCurrentPublicUser(user.id)
          uploaderId = pub?.id ?? null
        } catch {
          uploaderId = null
        }
      }
      await Promise.allSettled(
        stagedFiles.map((f) =>
          uploadTicketAttachment(ticket.id, f.file, uploaderId),
        ),
      )
      void qc.invalidateQueries({ queryKey: ['tickets'] })
      void qc.invalidateQueries({ queryKey: ['ticket-attachments', ticket.id] })
      toast.success(t.reportButton.toastSuccess(ticket.id))
      onClose()
    },
    onError: (err) => {
      toast.error(`${t.reportButton.toastError} (${err.message})`)
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (titleMissing || createMutation.isPending) return

    const rawLink = linkUrl.trim()
    if (rawLink && !validateLink(rawLink)) {
      setLinkInvalid(true)
      return
    }
    setLinkInvalid(false)

    const buildAndSubmit = async () => {
      let reporterId: string | null = null
      const authUid = user?.id ?? null
      if (authUid) {
        try {
          const publicUser = await fetchCurrentPublicUser(authUid)
          reporterId = publicUser?.id ?? null
        } catch {
          reporterId = null
        }
      }

      // Auto-capture route + version appended as metadata note (no migration
      // needed — piggybacked onto body; staff can read the [context] block).
      const contextNote =
        `\n\n[context: route=${location.pathname}, app=${APP_VERSION}]` +
        (rawLink ? `, link=${rawLink}` : '')
      const fullBody = bodyTrimmed.length > 0
        ? `${bodyTrimmed}${contextNote}`
        : contextNote.trim()

      const payload: TicketCreate = {
        operator_id: operatorId,
        reporter_id: reporterId,
        type: resolveTicketType(impact),
        title: titleTrimmed,
        body: fullBody.length > 0 ? fullBody : null,
        perceived_impact: impact,
      }
      createMutation.mutate(payload)
    }
    void buildAndSubmit()
  }

  const canSubmit = !titleMissing && !createMutation.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* --- Impact picker ------------------------------------------------- */}
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
          <ImpactRadio
            id="report-impact-idea"
            value="idea"
            checked={impact === 'idea'}
            onChange={() => setImpact('idea')}
            label={t.reportButton.impactIdea}
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
          rows={3}
        />
        {/* Contextual hints per impact */}
        {impact === 'blocking' ? (
          <p className="text-muted-foreground text-xs" data-testid="report-repro-hint">
            {t.reportButton.reproHintBlocking}
          </p>
        ) : impact === 'annoying' ? (
          <p className="text-muted-foreground text-xs" data-testid="report-repro-hint">
            {t.reportButton.reproHintAnnoying}
          </p>
        ) : null}
      </div>

      {/* --- Attachment zone ----------------------------------------------- */}
      <div className="space-y-1.5">
        <span className="text-xs font-medium leading-none">
          {t.reportButton.attachLabel}
          <span className="text-muted-foreground ml-1">(optional)</span>
        </span>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            aria-label={t.reportButton.attachLabel}
            onChange={(e) => handleFileInput(e.target.files)}
            data-testid="report-file-input"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={createMutation.isPending}
            data-testid="report-attach-btn"
          >
            <Paperclip className="size-3.5" aria-hidden />
            {createMutation.isPending
              ? t.reportButton.attachUploading
              : t.reportButton.attachHint}
          </Button>
        </div>
        {stagedFiles.length > 0 ? (
          <ul className="space-y-1" data-testid="report-staged-files">
            {stagedFiles.map((f) => (
              <li
                key={f.key}
                className="bg-muted flex items-center gap-2 rounded px-2 py-1 text-xs"
              >
                {f.previewUrl ? (
                  <img
                    src={f.previewUrl}
                    alt={f.file.name}
                    className="size-6 rounded object-cover"
                  />
                ) : (
                  <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.file.name}`}
                  onClick={() => removeStagedFile(f.key)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  data-testid={`report-remove-file-${f.key}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* --- Optional URL -------------------------------------------------- */}
      <div className="space-y-1.5">
        <Label htmlFor="report-link" className="text-xs">
          {t.reportButton.linkLabel}
          <span className="text-muted-foreground ml-1">(optional)</span>
        </Label>
        <Input
          id="report-link"
          type="url"
          autoComplete="off"
          value={linkUrl}
          onChange={(e) => {
            setLinkUrl(e.target.value)
            setLinkInvalid(false)
          }}
          placeholder={t.reportButton.linkPlaceholder}
          aria-invalid={linkInvalid ? true : undefined}
          data-testid="report-link-input"
        />
        {linkInvalid ? (
          <p className="text-destructive text-xs" role="alert">
            {t.reportButton.linkInvalid}
          </p>
        ) : null}
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
