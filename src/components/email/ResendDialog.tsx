/**
 * Shared "Modify & send" dialog for an outbound email (landr-33r3).
 *
 * Extracted from EmailLog.tsx so both the Email log drawer and the booking
 * timeline can reuse it. Prefills to/subject/body from the source row and
 * POSTs only the changed fields to the landr-2js5 resend endpoint. On success
 * it calls `onResent` so each caller can invalidate the right query (the email
 * log list, or a booking timeline).
 */
import { useState } from 'react'
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
  const [bodyText, setBodyText] = useState(source.body_text)
  const [bodyHtml, setBodyHtml] = useState(source.body_html)
  const [htmlExpanded, setHtmlExpanded] = useState(false)

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
      <DialogContent className="max-md:h-dvh max-md:max-w-none max-md:rounded-none sm:max-w-lg">
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
            <label className="text-sm font-medium" htmlFor="resend-body-text">
              {t.emailLog.resendFieldBodyText}
            </label>
            <Textarea
              id="resend-body-text"
              rows={5}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              data-testid="resend-body-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
              onClick={() => setHtmlExpanded((v) => !v)}
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
                onChange={(e) => setBodyHtml(e.target.value)}
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
