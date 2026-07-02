/**
 * Shared "Modify & send" dialog for an outbound email (landr-33r3).
 *
 * Extracted from EmailLog.tsx so both the Email log drawer and the booking
 * timeline can reuse it. Prefills to/subject/body from the source row and
 * POSTs only the changed fields to the landr-2js5 resend endpoint. On success
 * it calls `onResent` so each caller can invalidate the right query (the email
 * log list, or a booking timeline).
 *
 * landr-ri8a: the body is now edited in a TipTap WYSIWYG (RichTextEditor)
 * instead of a plain textarea. The operator formats with headings / lists /
 * bold / links and never sees HTML. `body_html` is the editor's getHTML() and
 * `body_text` is getText(); the raw HTML-source textarea is retained behind a
 * collapsible "Edit HTML source" escape hatch for the rare manual-markup case.
 *
 * landr-7hac: the WYSIWYG and the HTML-source escape hatch are made mutually
 * exclusive so exactly one surface is ever the source of truth:
 *  - while the escape hatch is open, the WYSIWYG is locked (`editable=false`)
 *    so it cannot silently clobber a raw-HTML edit;
 *  - `bodyText` is re-derived from the raw HTML on every keystroke in the
 *    escape hatch, so `body_text` never goes stale relative to `body_html`;
 *  - when the escape hatch closes, the WYSIWYG is re-seeded from `bodyHtml`
 *    (`editor.commands.setContent`, via the RichTextEditor ref) so any
 *    HTML-source edits carry forward instead of being discarded, and the
 *    editor's own onUpdate re-derives both serialisations from the merged
 *    document.
 */
import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { t } from '@/lib/strings'
import {
  resendEmail,
  type ResendEmailPayload,
} from '@/lib/outbound-emails'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from '@/components/email/RichTextEditor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** The minimal email shape the dialog needs — a structural subset shared by
 *  OutboundEmailRow (email log) and TimelineEmail (booking timeline). */
export type ResendDialogSource = {
  id: string
  to_address: string
  subject: string
  body_html: string
  body_text: string
}

/**
 * Best-effort HTML → plain-text, used to keep `bodyText` live-synced while
 * the operator edits raw HTML in the escape-hatch textarea (landr-7hac).
 * Not a substitute for the WYSIWYG's own `editor.getText()` — just enough to
 * stop `body_text` going stale relative to `body_html` between keystrokes.
 */
function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/[ \t]+\n/g, '\n').trim()
}

export type ResendDialogProps = {
  source: ResendDialogSource
  operatorId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful resend so the caller can invalidate caches. */
  onResent?: () => void
}

export function ResendDialog({
  source,
  operatorId,
  open,
  onOpenChange,
  onResent,
}: ResendDialogProps) {
  // Local editable copies — initialised from the source row.
  const [toAddress, setToAddress] = useState(source.to_address)
  const [subject, setSubject] = useState(source.subject)
  // Body is driven by the WYSIWYG editor, which emits both serialisations.
  // The HTML-source textarea (escape hatch) edits `bodyHtml` directly.
  const [bodyHtml, setBodyHtml] = useState(source.body_html)
  const [bodyText, setBodyText] = useState(source.body_text)
  const [htmlExpanded, setHtmlExpanded] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const mutation = useMutation({
    mutationFn: () => {
      // Build payload with ONLY changed fields.
      const payload: ResendEmailPayload = {}
      if (toAddress !== source.to_address) payload.to_address = toAddress
      if (subject !== source.subject) payload.subject = subject
      if (bodyText !== source.body_text) payload.body_text = bodyText
      if (bodyHtml !== source.body_html) payload.body_html = bodyHtml
      return resendEmail(operatorId, source.id, payload)
    },
    onSuccess: () => {
      toast.success(t.emailLog.resendToastSuccess)
      onOpenChange(false)
      onResent?.()
    },
    onError: (err: Error) => {
      toast.error(t.emailLog.resendToastError, { description: err.message })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-md:h-dvh max-md:max-w-none max-md:rounded-none sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.emailLog.resendDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.emailLog.resendDialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 max-md:overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="resend-to">
              {t.emailLog.resendFieldTo}
            </label>
            <Input
              id="resend-to"
              type="email"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              data-testid="resend-to-address"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="resend-subject">
              {t.emailLog.resendFieldSubject}
            </label>
            <Input
              id="resend-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="resend-subject"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              {t.emailLog.resendFieldBody}
            </span>
            <RichTextEditor
              ref={editorRef}
              initialHtml={source.body_html}
              editable={!htmlExpanded}
              onChange={({ html, text }) => {
                setBodyHtml(html)
                setBodyText(text)
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
              onClick={() => {
                // Closing the escape hatch: re-seed the WYSIWYG from the
                // (possibly hand-edited) raw HTML so it becomes the single
                // source of truth again instead of silently reverting to
                // whatever the editor last held (landr-7hac).
                if (htmlExpanded) {
                  editorRef.current?.setHtml(bodyHtml)
                }
                setHtmlExpanded((expanded) => !expanded)
              }}
              aria-expanded={htmlExpanded}
              data-testid="resend-html-toggle"
            >
              {htmlExpanded ? '▾' : '▸'} {t.emailLog.resendHtmlToggle}
            </button>
            {htmlExpanded && (
              <Textarea
                id="resend-body-html"
                rows={8}
                value={bodyHtml}
                onChange={(e) => {
                  const html = e.target.value
                  setBodyHtml(html)
                  // Keep body_text live-synced with the raw HTML being typed
                  // so it never goes stale relative to body_html (landr-7hac).
                  setBodyText(htmlToPlainText(html))
                }}
                className="font-mono text-xs"
                data-testid="resend-body-html"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t.emailLog.resendCancel}
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            data-testid="resend-submit"
          >
            {t.emailLog.resendSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
