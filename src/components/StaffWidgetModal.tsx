// landr-aoak.3 — staff-mode booking-widget modal.
//
// Opened by the topbar WidgetButton. Instead of opening the PUBLIC widget in
// a new tab, this embeds the booking widget in an <iframe> in STAFF/AGENT
// mode so the operator can book on a customer's behalf — including the
// operator-only powers (force-book a full/blocked day, price override) the
// widget exposes only when it holds a valid signed staff session.
//
// Flow (security-sensitive):
//   1. On open, mint a short-lived signed session via POST
//      /api/staff/operators/{op}/booking-sessions (aoak.1 [S1]).
//   2. Render an <iframe> at the env-matched widget origin (dev →
//      bw-dev.landr.de, …) via buildWidgetUrl — NO token in the src.
//   3. On iframe load, hand the token to the widget via an ORIGIN-TARGETED
//      `landr:staff-init` postMessage (aoak.2): targetOrigin = the exact
//      widget origin, never '*'. This keeps the token out of the iframe URL
//      / browser history. We retry a few times to beat the race with the
//      widget's message listener (it mounts in a useEffect); the widget
//      ignores duplicate inits (a present session wins).
//   4. Listen for the widget's `landr:booking-created` completion message,
//      VERIFY event.origin === the widget origin (ignore everything else),
//      then close the modal, invalidate the bookings query, and deep-link to
//      the new booking's detail sheet (/bookings?open=<id>, landr-ne58).
//
// State that must reset per-open (the minted session + iframe-loaded flag)
// lives in StaffWidgetBody, which is mounted ONLY while `open` is true. The
// Dialog unmounts it on close, so every open starts clean — no reset-on-close
// effects needed.
//
// Framing: bw-dev/bw-staging/bw.landr.de send NO X-Frame-Options and NO CSP
// frame-ancestors (verified 2026-06-08), so the cross-origin embed works. If
// that ever changes, the widget renders blank inside the iframe; the
// follow-up is tracked — see the handoff's FRAMING section.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { buildWidgetUrl, widgetOrigin, type EmbedEnv } from '@/lib/embed-hosts'
import {
  mintBookingSession,
  type StaffBookingSession,
} from '@/lib/booking-session'

const STAFF_INIT_TYPE = 'landr:staff-init'
const BOOKING_CREATED_TYPE = 'landr:booking-created'

/** The widget's completion message (aoak.2 §2). */
type BookingCreatedMessage = {
  type: typeof BOOKING_CREATED_TYPE
  booking_id: string
}

function isBookingCreatedMessage(data: unknown): data is BookingCreatedMessage {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return d.type === BOOKING_CREATED_TYPE && typeof d.booking_id === 'string'
}

type StaffWidgetModalProps = {
  /** Operator to mint the session for (the current dashboard scope). */
  operatorId: string
  /** The operator's widget token — carried on the iframe `?w=` for env scoping. */
  widgetToken: string
  /** Env-matched widget host (dev → bw-dev.landr.de, …). */
  env: EmbedEnv
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StaffWidgetModal({
  operatorId,
  widgetToken,
  env,
  open,
  onOpenChange,
}: StaffWidgetModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // landr-3qkr — full-screen on mobile (no gutter, full dvh), large
        // framed modal on desktop. Override the default centred card sizing.
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          // Mobile: edge-to-edge full screen.
          'h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] rounded-none',
          // Desktop: large framed modal.
          'sm:h-[90dvh] sm:max-h-[90dvh] sm:w-[min(56rem,92vw)] sm:max-w-[56rem] sm:rounded-lg',
        )}
        data-testid="staff-widget-modal"
      >
        <DialogHeader className="border-b px-4 py-3 text-left">
          <DialogTitle className="text-base">
            {t.staffWidget.dialogTitle}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t.staffWidget.dialogDescription}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open so the session + load state reset per-open. */}
        {open ? (
          <StaffWidgetBody
            operatorId={operatorId}
            widgetToken={widgetToken}
            env={env}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type StaffWidgetBodyProps = {
  operatorId: string
  widgetToken: string
  env: EmbedEnv
  onClose: () => void
}

function StaffWidgetBody({
  operatorId,
  widgetToken,
  env,
  onClose,
}: StaffWidgetBodyProps) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // Resolve once so the iframe src and the postMessage/verify origin agree.
  const widgetUrl = buildWidgetUrl(env, widgetToken)
  const origin = widgetOrigin(env)

  const [session, setSession] = useState<StaffBookingSession | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)

  const mint = useMutation<StaffBookingSession, Error, void>({
    mutationFn: () => mintBookingSession(operatorId),
    onSuccess: (minted) => setSession(minted),
    onError: (err) => {
      toast.error(t.staffWidget.mintError(err.message))
      onClose()
    },
  })

  // Mint once when this body mounts (i.e. when the modal opens).
  const mintMutate = mint.mutate
  useEffect(() => {
    mintMutate()
  }, [mintMutate])

  // Hand the freshly-minted token to the widget via an origin-targeted
  // staff-init postMessage. The widget's listener mounts in a useEffect, so
  // we retry a handful of times to beat the race; duplicates are no-ops
  // (a session already set in the widget wins).
  const postStaffInit = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win || !session?.staff_session) return
    win.postMessage(
      {
        type: STAFF_INIT_TYPE,
        token: session.staff_session,
        powers: session.powers,
      },
      origin,
    )
  }, [origin, session])

  // Once both the iframe has loaded and the session is minted, push the
  // staff-init a few times (250ms apart) to cover the listener-mount race.
  useEffect(() => {
    if (!iframeLoaded || !session) return
    let n = 0
    postStaffInit()
    const id = window.setInterval(() => {
      n += 1
      postStaffInit()
      if (n >= 4) window.clearInterval(id)
    }, 250)
    return () => window.clearInterval(id)
  }, [iframeLoaded, session, postStaffInit])

  // Completion listener — ORIGIN-CHECKED. Anything not from the widget origin
  // (or not the booking-created shape) is ignored.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // SECURITY: only the widget's exact origin may report a created booking.
      if (event.origin !== origin) return
      if (!isBookingCreatedMessage(event.data)) return
      const bookingId = event.data.booking_id
      // Refresh the bookings table + approvals counter (broad prefix, mirrors
      // the realtime parity-flush) so the new row is present when we open it.
      void qc.invalidateQueries({ queryKey: ['bookings'] })
      onClose()
      toast.success(t.staffWidget.createdToast)
      // landr-ne58 deep-link: Bookings.tsx reads ?open= and pops the detail.
      navigate(`/bookings?open=${bookingId}`)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, qc, navigate, onClose])

  return (
    <div className="relative min-h-0 flex-1">
      {/*
        The iframe src carries ONLY the operator's widget token (?w=) for env
        scoping — the staff_session is delivered separately via the
        origin-targeted staff-init postMessage above, NOT in the URL.
      */}
      <iframe
        ref={iframeRef}
        src={widgetUrl}
        title={t.staffWidget.iframeTitle}
        data-testid="staff-widget-iframe"
        // Cross-origin embed: allow the widget's own scripts/forms/popups
        // (e.g. Stripe), keep it sandboxed from the dashboard's origin.
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        allow="payment"
        className="h-full w-full border-0"
        onLoad={() => setIframeLoaded(true)}
      />
    </div>
  )
}
